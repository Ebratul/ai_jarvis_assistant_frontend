// Wires the voice engine, backend API, WebSocket and UI store together.
import { api, patch, post, wsUrl, type Alert, type BrainStats, type CalEvent, type ChatResult, type Integrations, type NonoState, type Reminder, type SystemInfo, type Voice } from './api'
import { useNono } from './store'
import { VoiceEngine, type TtsEngine } from './voice'

const S = () => useNono.getState()
let ws: WebSocket | null = null
let started = false
let pending = 0

export const voice = new VoiceEngine({
  onCommand: (text) => void send(text, 'voice'),
  onInterim: (text) => S().set({ interim: text }),
  onListening: (on) => {
    const st = S().status
    if (on && (st === 'thinking' || st === 'speaking')) return
    if (on) S().set({ status: 'listening' })
    else if (st === 'listening') S().set({ status: 'idle' })
  },
  onWake: () => S().set({ status: 'listening' }),
  onError: (msg) => {
    const recent = S().alerts.find((a) => a.type === 'error' && a.text === msg && Date.now() - Date.parse(a.at) < 15000)
    if (!recent) S().alert({ type: 'error', at: new Date().toISOString(), text: msg })
  },
})

export function ttsEngine(): TtsEngine {
  try {
    return (localStorage.getItem('nono.tts') as TtsEngine) || 'eleven'
  } catch {
    return 'eleven'
  }
}

export function setTtsEngine(e: TtsEngine) {
  try {
    localStorage.setItem('nono.tts', e)
  } catch {
    /* ignore */
  }
}

function activeVoice(): Voice | undefined {
  const { voices, state } = S()
  return voices.find((v) => v.id === state?.voice) ?? voices[0]
}

export async function speak(text: string) {
  const st = S().state
  if (st?.muted) return
  S().set({ status: 'speaking' })
  await voice.speak(text, activeVoice(), st?.tts ? ttsEngine() : 'browser')
  if (S().status === 'speaking') S().set({ status: 'idle' })
}

export async function send(text: string, source: 'voice' | 'text' = 'text') {
  const clean = text.trim()
  if (!clean) return
  voice.stopSpeaking()
  S().push({ role: 'user', text: clean, meta: { source } })
  S().set({ status: 'thinking', interim: '' })
  pending++
  try {
    const res = await post<ChatResult>('/api/chat', { text: clean, source, session: 'hud' })
    S().set({ state: res.state })
    S().push({ role: 'nono', text: res.reply, meta: res })
    for (const a of res.client_actions) runClientAction(a.tool, a.args)
    for (const a of res.actions) {
      if (a.tool === 'set_reminder' || a.tool === 'cancel_reminder') void refreshAgenda()
      if (a.tool === 'add_event') void refreshAgenda()
    }
    pending--
    if (!pending) S().set({ status: 'idle' })
    void refreshStats()
    await speak(res.reply)
  } catch (err) {
    pending--
    S().set({ status: S().online ? 'idle' : 'offline' })
    S().push({ role: 'system', text: `Connection problem: ${(err as Error).message}` })
  }
}

function runClientAction(tool: string, args: Record<string, unknown>) {
  if (tool === 'open_url' && typeof args.url === 'string') window.open(args.url, '_blank', 'noopener')
  if (tool === 'set_mute') void setMuted(Boolean(args.muted))
  if (tool === 'show_view') S().set({ view: args.view === 'brain' ? 'brain' : 'hud' })
}

export async function setMuted(muted: boolean) {
  if (muted) voice.stopSpeaking()
  const st = await patch<NonoState>('/api/state', { muted })
  S().set({ state: st })
}

export async function updateState(p: Partial<NonoState>) {
  const st = await patch<NonoState>('/api/state', p)
  S().set({ state: st })
  return st
}

export async function refreshStats() {
  try {
    S().set({ stats: await api<BrainStats>('/api/brain/stats') })
  } catch {
    /* brain offline */
  }
}

export async function refreshAgenda() {
  try {
    const [r, e] = await Promise.all([
      api<{ reminders: Reminder[] }>('/api/reminders'),
      api<{ events: CalEvent[] }>('/api/events?days=14'),
    ])
    S().set({ reminders: r.reminders, events: e.events })
  } catch {
    /* ignore */
  }
}

export async function refreshIntegrations() {
  try {
    S().set({ integrations: await api<Integrations>('/api/integrations') })
  } catch {
    /* ignore */
  }
}

async function pollSystem() {
  try {
    S().set({ system: await api<SystemInfo>('/api/system'), online: true })
    if (S().status === 'offline') S().set({ status: 'idle' })
  } catch {
    S().set({ online: false, status: 'offline' })
  }
}

function connectWs() {
  try {
    ws = new WebSocket(wsUrl())
  } catch {
    return
  }
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data) as Alert & { state?: NonoState }
    if (ev.type === 'hello' || ev.type === 'state') {
      if (ev.state) S().set({ state: ev.state })
      return
    }
    if (ev.type === 'pong') return
    if (ev.type === 'conversation') {
      if (ev.source === 'telegram') {
        S().push({ role: 'user', text: String(ev.text), meta: { source: 'telegram' } })
        S().push({ role: 'nono', text: String(ev.reply), meta: { source: 'telegram' } })
      }
      void refreshStats()
      return
    }
    S().alert(ev)
    if (ev.type === 'reminder') {
      void refreshAgenda()
      void speak(`Reminder: ${ev.text}`)
    }
    if (ev.type === 'reminder_set' || ev.type === 'event_added') void refreshAgenda()
  }
  ws.onclose = () => setTimeout(connectWs, 3000)
}

export async function boot() {
  if (started) return
  started = true
  await pollSystem()
  try {
    const [state, v] = await Promise.all([
      api<NonoState>('/api/state'),
      api<{ voices: Voice[] }>('/api/voices'),
    ])
    S().set({ state, voices: v.voices, status: 'idle' })
    voice.lang = state.language
    const alerts = await api<{ alerts: Alert[] }>('/api/alerts')
    S().set({ alerts: alerts.alerts.filter((a) => !['conversation', 'state', 'pong'].includes(a.type)) })
  } catch {
    S().set({ status: 'offline' })
  }
  void refreshStats()
  void refreshAgenda()
  void refreshIntegrations()
  connectWs()
  setInterval(pollSystem, 3000)
  setInterval(refreshStats, 30000)
  setInterval(refreshAgenda, 60000)
}

export async function engage() {
  await voice.init()
  if (S().wakeWord) {
    S().set({ mode: 'realtime' })
    await voice.startWake()
  }
  const name = S().state?.user_name ?? 'Boss'
  const hour = new Date().getHours()
  const part = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greet = `${part}, ${name}. All systems are online.${S().wakeWord ? ' Say "Nono" whenever you need me.' : ''}`
  S().push({ role: 'nono', text: greet })
  void speak(greet)
}

export async function setRealtime(on: boolean) {
  S().set({ mode: on ? 'realtime' : 'general', wakeWord: on })
  try {
    localStorage.setItem('nono.wake', on ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (on) await voice.startWake()
  else voice.stopWake()
}
