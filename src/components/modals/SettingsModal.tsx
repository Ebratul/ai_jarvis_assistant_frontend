import { Check, Cpu, Download, ExternalLink, Play, RefreshCw, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, exportUrl, fetchTTS, post, type ModelInfo, type Provider } from '../../lib/api'
import { refreshIntegrations, setRealtime, setTtsEngine, ttsEngine, updateState, voice } from '../../lib/controller'
import { useNono } from '../../lib/store'

export function Modal({ title, onClose, children, tabs }: { title: string; onClose: () => void; children: React.ReactNode; tabs?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {tabs}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function BrainTab() {
  const state = useNono((s) => s.state)
  const [providers, setProviders] = useState<Provider[]>([])
  const [provider, setProvider] = useState(state?.provider ?? 'openrouter')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    api<{ providers: Provider[] }>('/api/providers').then((r) => setProviders(r.providers)).catch(() => {})
  }, [])
  useEffect(() => {
    setLoading(true)
    api<{ models: ModelInfo[] }>(`/api/models?provider=${provider}`).then((r) => setModels(r.models)).catch(() => setModels([])).finally(() => setLoading(false))
  }, [provider])

  const choose = async (model: string) => {
    await updateState({ provider, model })
  }

  return (
    <>
      <p className="note">Pick NONO's thinking engine, or just say <code>“Nono, switch to groq”</code>, <code>“use gemma”</code>, <code>“মডেল পরিবর্তন করো gemini”</code>. If a model is busy, NONO automatically falls back to the next free one.</p>
      <div className="grid2">
        {providers.map((p) => (
          <button key={p.id} className={`card ${provider === p.id ? 'sel' : ''} ${p.configured ? '' : 'off'}`} onClick={() => setProvider(p.id)}>
            <h4>{p.label} {state?.provider === p.id && <Check size={15} color="#34d399" />}</h4>
            <div className="row">
              {p.configured ? <span className="badge ok">ready</span> : <span className="badge warn">{p.id === 'ollama' ? 'not running' : 'needs key'}</span>}
              {p.free && <span className="badge free">free</span>}
            </div>
            {!p.configured && <p>{p.id === 'ollama' ? 'Install Ollama and run a model for free offline AI.' : <>Add the key to backend <code className="code">.env</code>.</>} <a href={p.signup} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#67e8f9' }}>Get one <ExternalLink size={11} /></a></p>}
          </button>
        ))}
      </div>
      <div className="field">
        <label>Models · {provider} {loading && <RefreshCw size={11} className="spin" />}</label>
        <div className="grid2" style={{ maxHeight: 280, overflow: 'auto' }}>
          {models.map((m) => (
            <button key={m.id} className={`card ${state?.provider === provider && state?.model === m.id ? 'sel' : ''}`} onClick={() => choose(m.id)}>
              <h4 style={{ fontSize: 13.5 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>{m.free && <span className="badge free">free</span>}</h4>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{m.id}{m.context ? ` · ${Math.round(m.context / 1000)}k ctx` : ''}</p>
            </button>
          ))}
          {!loading && models.length === 0 && <div className="empty">No models found (is the provider running / key set?)</div>}
        </div>
      </div>
      <div className="row">
        <input className="input" style={{ flex: 1 }} placeholder="or type any model id, e.g. deepseek/deepseek-r1:free" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn" onClick={() => custom && choose(custom)}><Cpu />Use</button>
      </div>
    </>
  )
}

function VoiceTab() {
  const voices = useNono((s) => s.voices)
  const state = useNono((s) => s.state)
  const [engine, setEngine] = useState(ttsEngine())
  const [playing, setPlaying] = useState('')
  const preview = async (id: string) => {
    setPlaying(id)
    const v = voices.find((x) => x.id === id)
    try {
      await voice.init()
      if (engine === 'eleven' && state?.tts) {
        const buf = await fetchTTS(`Hello ${state.user_name}. I am ${v?.name}, your NONO voice.`, id)
        const audio = await voice.ctx!.decodeAudioData(buf)
        const src = voice.ctx!.createBufferSource()
        src.buffer = audio
        src.connect(voice.ctx!.destination)
        src.start()
        src.onended = () => setPlaying('')
        return
      }
      await voice.speak(`Hello. I am ${v?.name}.`, v, 'browser')
    } catch {
      /* ignore */
    }
    setPlaying('')
  }
  return (
    <>
      <p className="note">Five voices. Say <code>“Nono, change your voice to Aria”</code> or <code>“use a deep voice”</code>.</p>
      <div className="grid2">
        {voices.map((v, i) => (
          <div key={v.id} className={`card ${state?.voice === v.id ? 'sel' : ''}`}>
            <h4><span style={{ color: v.color }}>{i + 1}. {v.name}</span><span className="badge" style={{ color: v.color }}>{v.gender}</span></h4>
            <p>{v.style}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>ElevenLabs · {v.base}</p>
            <div className="row">
              <button className="btn ghost" onClick={() => preview(v.id)} disabled={playing === v.id}><Play />{playing === v.id ? 'Playing…' : 'Preview'}</button>
              <button className="btn" onClick={() => updateState({ voice: v.id })}><Check />Use</button>
            </div>
          </div>
        ))}
      </div>
      <div className="field">
        <label>Speech engine</label>
        <div className="row">
          <button className={`mini ${engine === 'eleven' ? 'on' : ''}`} onClick={() => { setEngine('eleven'); setTtsEngine('eleven') }} disabled={!state?.tts}>ElevenLabs (premium)</button>
          <button className={`mini ${engine === 'browser' ? 'on' : ''}`} onClick={() => { setEngine('browser'); setTtsEngine('browser') }}>Browser voice (free, unlimited)</button>
        </div>
        <p className="note">The ElevenLabs free plan gives about 10,000 credits a month. When they run out, NONO switches to the browser voice on its own.</p>
      </div>
    </>
  )
}

function SpeechTab() {
  const state = useNono((s) => s.state)
  const wake = useNono((s) => s.wakeWord)
  return (
    <>
      <div className="field">
        <label>Language</label>
        <div className="row">
          {[['en-US', 'English'], ['bn-BD', 'বাংলা (Bangla)'], ['en-IN', 'English (India)']].map(([code, name]) => (
            <button key={code} className={`mini ${state?.language === code ? 'on' : ''}`} onClick={async () => { await updateState({ language: code }); voice.lang = code }}>{name}</button>
          ))}
        </div>
        <p className="note">Sets the speech recognition language. NONO always replies in whatever language you speak.</p>
      </div>
      <div className="field">
        <label>Hands-free wake word</label>
        <label className="switch"><input type="checkbox" checked={wake} onChange={(e) => void setRealtime(e.target.checked)} />Always listen for “Nono” (Realtime mode)</label>
        <p className="note">Say <code>“Nono, what's on my calendar?”</code>. After NONO answers, you have a few seconds to follow up without saying the wake word again. Works best in Chrome or Edge. Push-to-talk: hold <code>Space</code> or the mic button.</p>
        {!voice.sttSupported && <p className="note" style={{ color: '#f5a524' }}>This browser has no built-in speech recognition. Push-to-talk will use server Whisper (needs GROQ_API_KEY).</p>}
      </div>
      <div className="field">
        <label>Default city (weather)</label>
        <input className="input" defaultValue={state?.city} onBlur={(e) => e.target.value && updateState({ city: e.target.value })} />
      </div>
      <div className="field">
        <label>Keyboard</label>
        <p className="note"><code>Space</code> hold to talk · <code>Esc</code> stop speaking · <code>B</code> toggle brain view</p>
      </div>
    </>
  )
}

function IntegrationsTab() {
  const integ = useNono((s) => s.integrations)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    void refreshIntegrations()
    const t = setInterval(refreshIntegrations, 4000)
    return () => clearInterval(t)
  }, [])
  const tg = integ?.telegram
  const test = async () => {
    try {
      await post('/api/telegram/send', { text: '👋 Hello from NONO. Telegram link is working.' })
      setMsg('Sent ✔')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  return (
    <div className="grid2">
      <div className="card">
        <h4>Telegram {tg?.paired ? <span className="badge ok">paired</span> : tg?.enabled ? <span className="badge warn">not paired</span> : <span className="badge warn">off</span>}</h4>
        {!tg?.enabled && <p>Create a bot with <b>@BotFather</b>, put <code className="code">TELEGRAM_BOT_TOKEN</code> in backend .env and restart.</p>}
        {tg?.enabled && !tg.paired && <><p>Send this to {tg.bot ? <b>@{tg.bot}</b> : 'your bot'}:</p><div className="pair-code">/pair {tg.pair_code}</div></>}
        {tg?.paired && <p>Command NONO from Telegram, and get reminders there. Try “send me a telegram saying hi”.</p>}
        {tg?.paired && <div className="row"><button className="btn" onClick={test}><Send />Send test</button><span className="note">{msg}</span></div>}
      </div>
      <div className="card">
        <h4>Google Calendar {integ?.google_calendar.connected ? <span className="badge ok">connected</span> : <span className="badge warn">local</span>}</h4>
        <p>{integ?.google_calendar.connected ? 'Events sync with your Google Calendar.' : 'Right now NONO uses its built-in calendar. To sync Google: put your OAuth credentials.json in backend/data and run '}
          {!integ?.google_calendar.connected && <code className="code">python scripts/google_auth.py</code>}</p>
      </div>
      <div className="card">
        <h4>Neural memory {integ?.rag.online ? <span className="badge ok">online</span> : <span className="badge warn">offline</span>}</h4>
        <p>{integ?.rag.memories ?? 0} instructions stored permanently · {integ?.rag.embedder}</p>
        <a className="btn ghost" href={exportUrl()} download><Download />Export full brain</a>
      </div>
      <div className="card">
        <h4>Voice I/O</h4>
        <p>ElevenLabs: {integ?.tts.elevenlabs ? `on (${integ.tts.model})` : 'off, using browser voice'}</p>
        <p>Server speech-to-text: {integ?.stt.server ? 'on (Whisper)' : 'off, using browser recognition'}</p>
      </div>
    </div>
  )
}

export default function SettingsModal() {
  const tab = useNono((s) => s.settingsTab)
  const set = useNono((s) => s.set)
  const tabs = (
    <div className="tabs">
      {(['brain', 'voice', 'speech', 'integrations'] as const).map((t) => (
        <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => set({ settingsTab: t })}>
          {t === 'brain' ? 'AI Models' : t === 'voice' ? 'Voices' : t === 'speech' ? 'Speech' : 'Integrations'}
        </button>
      ))}
    </div>
  )
  return (
    <Modal title="NONO · CONFIGURATION" onClose={() => set({ modal: null })} tabs={tabs}>
      {tab === 'brain' && <BrainTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'speech' && <SpeechTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </Modal>
  )
}
