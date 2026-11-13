import { Mic } from 'lucide-react'
import { voice } from '../../lib/controller'
import { useNono } from '../../lib/store'

export function MiniCore() {
  const status = useNono((s) => s.status)
  const state = useNono((s) => s.state)
  const interim = useNono((s) => s.interim)
  const last = useNono((s) => [...s.messages].reverse().find((m) => m.role === 'nono'))
  const color = status === 'thinking' ? '#a78bfa' : status === 'listening' ? '#5eead4' : status === 'offline' ? '#fb7185' : '#22d3ee'
  return (
    <div className="mini-core">
      <svg viewBox="0 0 200 200" style={{ color }}>
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="1 5" />
        <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="70 26 20 26" className="spin-a" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="#f5a524" strokeWidth="4" strokeDasharray="90 350" className="spin-b" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeOpacity=".5" strokeDasharray="3 4" className="spin-c" />
        <circle cx="100" cy="100" r="46" fill="rgba(2,20,36,.85)" stroke="currentColor" strokeOpacity=".6" />
        <text x="100" y="106" textAnchor="middle" fill="#e0faff" fontFamily="Orbitron" fontWeight="800" fontSize="15" letterSpacing="2">N.O.N.O.</text>
      </svg>
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className={`status-pill ${status}`}><span className="dot" />{status === 'idle' ? 'online' : status}</span>
        <span className="status-pill" style={{ color: '#5eead4' }}>{(state?.model ?? '').split('/').pop()?.slice(0, 18)}</span>
      </div>
      <div className="mini-caption">{interim || last?.text || 'listening for “nono”…'}</div>
      <button className="mini-talk" onPointerDown={() => void voice.startPushToTalk()} onPointerUp={() => voice.stopPushToTalk()}>
        <Mic size={14} /> Hold to talk, ask one question
      </button>
    </div>
  )
}
