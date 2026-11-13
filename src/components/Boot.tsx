import { useEffect, useState } from 'react'
import { boot, engage } from '../lib/controller'
import { useNono } from '../lib/store'

const LINES = [
  'Loading neural core',
  'Linking language models',
  'Mounting permanent memory',
  'Calibrating voice synthesis',
  'Opening automation channels',
]

export default function Boot() {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const online = useNono((s) => s.online)
  const stats = useNono((s) => s.stats)

  useEffect(() => {
    void boot()
    const t = setInterval(() => setStep((s) => Math.min(LINES.length, s + 1)), 320)
    return () => clearInterval(t)
  }, [])

  const start = async () => {
    setDone(true)
    await engage()
  }

  return (
    <div className={`boot ${done ? 'done' : ''}`}>
      <div className="boot-inner">
        <div className="boot-ring">
          <svg viewBox="0 0 200 200">
            <defs>
              <radialGradient id="bc"><stop offset="0" stopColor="#67e8f9" stopOpacity=".9" /><stop offset="1" stopColor="#0891b2" stopOpacity="0" /></radialGradient>
            </defs>
            <circle cx="100" cy="100" r="34" fill="url(#bc)" />
            <circle cx="100" cy="100" r="58" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="60 22" style={{ transformOrigin: 'center', animation: 'spin 3s linear infinite' }} />
            <circle cx="100" cy="100" r="76" fill="none" stroke="#67e8f9" strokeOpacity=".5" strokeWidth="1" strokeDasharray="4 6" style={{ transformOrigin: 'center', animation: 'spin 9s linear infinite reverse' }} />
            <circle cx="100" cy="100" r="92" fill="none" stroke="#22d3ee" strokeOpacity=".35" strokeWidth="3" strokeDasharray="120 400" style={{ transformOrigin: 'center', animation: 'spin 2.2s linear infinite' }} />
          </svg>
        </div>
        <h1>NONO</h1>
        <div className="tag">Personal neural assistant</div>
        <div className="boot-lines">
          {LINES.slice(0, step).map((l, i) => (
            <div key={l}>
              <span className="ok">[ OK ]</span> {l}
              {i === 2 && stats ? ` · ${stats.total} memories` : ''}
              {i === 1 && !online && step >= LINES.length ? ' · backend offline' : ''}
            </div>
          ))}
        </div>
        <button className="engage" onClick={start} disabled={step < LINES.length}>Engage</button>
      </div>
    </div>
  )
}
