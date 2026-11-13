import { AudioLines, BrainCircuit, Cpu, LayoutDashboard, Mic, MicOff, Radio, SendHorizontal, Settings, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { send, setMuted, setRealtime, voice } from '../../lib/controller'
import { useNono, type Status } from '../../lib/store'

const STATUS_TEXT: Record<Status, string> = {
  booting: 'Initializing', idle: 'Online', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', offline: 'Offline',
}

export function StatusPill() {
  const status = useNono((s) => s.status)
  return <span className={`status-pill ${status}`}><span className="dot" />{STATUS_TEXT[status]}</span>
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="clock">
      <div className="time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="date">{now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  )
}

export function TopBar() {
  const set = useNono((s) => s.set)
  const view = useNono((s) => s.view)
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">N.O.N.O.</div>
          <div className="brand-sub">Neural Omni-Network Operator</div>
        </div>
      </div>
      <div className="title-plate">NONO</div>
      <div className="top-right">
        <StatusPill />
        <Clock />
        <button className={`icon-btn ${view === 'brain' ? 'active' : ''}`} title="Neural memory (B)" onClick={() => set({ view: view === 'brain' ? 'hud' : 'brain' })}>
          {view === 'brain' ? <LayoutDashboard size={18} /> : <BrainCircuit size={18} />}
        </button>
        <button className="icon-btn" title="Settings" onClick={() => set({ modal: 'settings' })}><Settings size={18} /></button>
      </div>
    </header>
  )
}

export function CenterOverlay() {
  const state = useNono((s) => s.state)
  const status = useNono((s) => s.status)
  const interim = useNono((s) => s.interim)
  const messages = useNono((s) => s.messages)
  const stats = useNono((s) => s.stats)
  const lastNono = [...messages].reverse().find((m) => m.role !== 'user')
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const showUser = lastUser && (!lastNono || lastUser.at > lastNono.at || status === 'thinking')
  return (
    <>
      <div className="float-card l" style={{ top: '9%' }}>
        <div className="k">Neural engine</div>
        <div className="v">{state?.provider ?? '—'}</div>
        <div className="k" style={{ marginTop: 4 }}>{state?.model?.split('/').pop() ?? ''}</div>
        <div className="bar"><i style={{ width: status === 'thinking' ? '92%' : '64%', transition: 'width .6s' }} /></div>
      </div>
      <div className="float-card l" style={{ top: '34%', animationDelay: '-2s' }}>
        <div className="k">Memories</div>
        <div className="v">{stats?.total ?? 0} instructions</div>
        <div className="bar"><i style={{ width: `${Math.min(100, ((stats?.total ?? 0) % 100) + 8)}%` }} /></div>
      </div>
      <div className="float-card r" style={{ top: '9%', animationDelay: '-1s' }}>
        <div className="k">Voice</div>
        <div className="v">{state?.voice_name ?? '—'}{state?.muted ? ' · muted' : ''}</div>
        <div className="bar"><i style={{ width: status === 'speaking' ? '96%' : '40%', transition: 'width .4s' }} /></div>
      </div>
      <div className="float-card r" style={{ top: '34%', animationDelay: '-3s' }}>
        <div className="k">Language</div>
        <div className="v">{state?.language === 'bn-BD' ? 'বাংলা · Bangla' : 'English'}</div>
        <div className="bar"><i style={{ width: '72%' }} /></div>
      </div>
      <div className="state-caption" aria-live="polite">
        <div className="label">{status === 'listening' ? '● listening' : status === 'thinking' ? '◆ processing' : status === 'speaking' ? '▶ responding' : status === 'offline' ? '× backend offline' : 'say “nono” or press space'}</div>
        <div className="subtitle">
          {interim ? <span className="interim">{interim}</span> : (
            <>
              {showUser && <span className="you">“{lastUser!.text}”</span>}
              {!showUser && lastNono && lastNono.text}
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function Dock() {
  const mode = useNono((s) => s.mode)
  const status = useNono((s) => s.status)
  const muted = useNono((s) => s.state?.muted ?? false)
  const set = useNono((s) => s.set)
  const [text, setText] = useState('')
  const holding = useRef(false)
  const live = status === 'listening'

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if (typing) return
      if (e.code === 'Space' && !holding.current) {
        e.preventDefault()
        holding.current = true
        void voice.startPushToTalk()
      }
      if (e.key === 'Escape') voice.stopSpeaking()
      if (e.key.toLowerCase() === 'b') useNono.getState().set({ view: useNono.getState().view === 'brain' ? 'hud' : 'brain' })
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && holding.current) {
        holding.current = false
        voice.stopPushToTalk()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const submit = () => {
    if (!text.trim()) return
    void send(text, 'text')
    setText('')
  }

  return (
    <footer className="dock">
      <div className="dock-inner">
        <button className={`dock-btn ${mode === 'general' ? 'on' : ''}`} onClick={() => void setRealtime(false)} title="Push-to-talk and typing">
          <Cpu />General
        </button>
        <button className={`dock-btn ${mode === 'realtime' ? 'on' : ''}`} onClick={() => void setRealtime(true)} title='Hands-free: say "Nono ..."'>
          <Radio />Realtime
        </button>
        <div className="composer">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={mode === 'realtime' ? 'Say “Nono, …” or type here' : 'Type an instruction, or hold Space to talk'} aria-label="Instruction" />
          <button className="send" onClick={submit} aria-label="Send"><SendHorizontal size={18} /></button>
        </div>
        <button className={`mic ${live ? 'live' : ''}`} aria-label="Talk"
          onPointerDown={() => void voice.startPushToTalk()} onPointerUp={() => voice.stopPushToTalk()} onPointerLeave={() => live && voice.stopPushToTalk()}>
          {live ? <Mic /> : status === 'offline' ? <MicOff /> : <Mic />}
        </button>
        <button className={`dock-btn ${mode === 'audio' ? 'on' : ''}`} onClick={() => set({ modal: 'settings', settingsTab: 'voice' })} title="Voices">
          <AudioLines />Audio
        </button>
        <button className={`dock-btn danger ${muted ? 'on' : ''}`} onClick={() => void setMuted(!muted)} title="Mute NONO">
          {muted ? <VolumeX /> : <Volume2 />}{muted ? 'Muted' : 'Mute'}
        </button>
      </div>
    </footer>
  )
}

export function Toasts() {
  const alerts = useNono((s) => s.alerts)
  const [visible, setVisible] = useState<string[]>([])
  const latest = alerts[0]
  const key = latest ? `${latest.at}-${latest.type}-${latest.text ?? ''}` : ''
  useEffect(() => {
    if (!latest || !['reminder', 'error', 'telegram'].includes(latest.type)) return
    setVisible((v) => [key, ...v].slice(0, 3))
    const t = setTimeout(() => setVisible((v) => v.filter((k) => k !== key)), latest.type === 'reminder' ? 12000 : 6000)
    return () => clearTimeout(t)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = alerts.filter((a) => visible.includes(`${a.at}-${a.type}-${a.text ?? ''}`))
  return (
    <div className="toasts">
      {shown.map((a) => (
        <div key={`${a.at}-${a.type}`} className={`toast ${a.type === 'error' ? 'error' : ''}`}>
          {a.type === 'reminder' ? '⏰' : a.type === 'telegram' ? '✈' : '⚠'} {a.type === 'telegram' ? `${a.sender}: ${a.text}` : String(a.text)}
        </div>
      ))}
    </div>
  )
}
