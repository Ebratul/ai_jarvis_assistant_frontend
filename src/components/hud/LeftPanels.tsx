import { Activity, Brain, Clock, Cpu, HardDrive, Radio, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { audioBus } from '../../lib/audioBus'
import { useNono } from '../../lib/store'
import { Panel, fmtUptime } from './Panel'

function Gauge({ value, label, display, color = '#22d3ee' }: { value: number; label: string; display: string; color?: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="gauge">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="37" fill="none" stroke="rgba(56,189,248,.18)" strokeDasharray="2 4" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(56,189,248,.14)" strokeWidth="5" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 40 40)"
          style={{ filter: `drop-shadow(0 0 5px ${color})`, transition: 'stroke-dasharray .8s ease' }} />
        <text x="40" y="45" textAnchor="middle" className="val">{display}</text>
      </svg>
      <span className="lbl">{label}</span>
    </div>
  )
}

export function SystemPanel() {
  const sys = useNono((s) => s.system)
  const stats = useNono((s) => s.stats)
  const total = stats?.total ?? 0
  return (
    <Panel title="System" icon={<Cpu />} delay={60}>
      <div className="gauges">
        <Gauge value={sys?.cpu ?? 0} label="CPU" display={`${Math.round(sys?.cpu ?? 0)}%`} />
        <Gauge value={sys?.ram ?? 0} label="Memory" display={`${Math.round(sys?.ram ?? 0)}%`} color="#38bdf8" />
        <Gauge value={Math.min(100, (Math.log10(total + 1) / 4) * 100)} label="Brain" display={total > 999 ? `${(total / 1000).toFixed(1)}k` : String(total)} color="#a78bfa" />
      </div>
      <div className="chips">
        <span className="chip"><Clock /> up <b>{sys ? fmtUptime(sys.uptime_s) : '--'}</b></span>
        <span className="chip"><HardDrive /> disk <b>{sys ? `${Math.round(sys.disk)}%` : '--'}</b></span>
        {sys?.battery != null && <span className="chip"><Zap /> <b>{sys.battery}%</b>{sys.charging ? ' ⚡' : ''}</span>}
      </div>
    </Panel>
  )
}

export function SignalPanel() {
  const ref = useRef<HTMLCanvasElement>(null)
  const status = useNono((s) => s.status)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let t = 0
    const draw = () => {
      const w = (canvas.width = canvas.clientWidth * devicePixelRatio)
      const h = (canvas.height = canvas.clientHeight * devicePixelRatio)
      ctx.clearRect(0, 0, w, h)
      t += 0.04
      // frequency bars (mirrored)
      const bars = 48
      const live = audioBus.analyser != null
      for (let i = 0; i < bars; i++) {
        const f = live ? audioBus.freq[Math.floor((i / bars) * audioBus.freq.length * 0.7)] / 255 : 0
        const idle = 0.06 + 0.05 * Math.sin(t * 2 + i * 0.5) + 0.03 * Math.sin(t * 5 + i)
        const v = Math.max(idle, f)
        const bh = v * h * 0.9
        const x = (i / bars) * w
        const g = ctx.createLinearGradient(0, h / 2 - bh / 2, 0, h / 2 + bh / 2)
        g.addColorStop(0, 'rgba(34,211,238,0.05)')
        g.addColorStop(0.5, 'rgba(103,232,249,0.85)')
        g.addColorStop(1, 'rgba(34,211,238,0.05)')
        ctx.fillStyle = g
        ctx.fillRect(x + 1, h / 2 - bh / 2, w / bars - 3, bh)
      }
      // waveform line
      ctx.beginPath()
      ctx.lineWidth = 1.6 * devicePixelRatio
      ctx.strokeStyle = '#a5f3fc'
      ctx.shadowColor = '#22d3ee'
      ctx.shadowBlur = 10
      const N = 120
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * w
        const idx = Math.floor((i / N) * (audioBus.wave.length - 1))
        const v = live ? (audioBus.wave[idx] - 128) / 128 : 0
        const y = h / 2 + (v * 1.6 + Math.sin(t * 3 + i * 0.25) * 0.04 * (1 + audioBus.level * 6)) * h * 0.45
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  const label = status === 'speaking' ? 'OUTPUT' : status === 'listening' ? 'INPUT' : 'STANDBY'
  return (
    <Panel title="AI Signal" icon={<Radio />} meta={label} delay={120}>
      <canvas ref={ref} className="wave-canvas" />
    </Panel>
  )
}

function AreaChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 300
  const H = 80
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [values.length < 2 ? W / 2 : (i / (values.length - 1)) * W, H - (v / max) * (H - 8) - 4])
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity=".55" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(56,189,248,.1)" strokeDasharray="3 4" />)}
      {pts.length > 0 && <path d={`${path} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#ag)" />}
      {pts.length > 0 && <path d={path} fill="none" stroke="#67e8f9" strokeWidth="1.8" style={{ filter: 'drop-shadow(0 0 4px #22d3ee)' }} />}
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.2" fill="#e0faff" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }} />}
      {labels.map((l, i) => (labels.length < 8 || i % Math.ceil(labels.length / 6) === 0) && (
        <text key={i} x={pts[i]?.[0] ?? 0} y={H + 12} textAnchor="middle">{l}</text>
      ))}
    </svg>
  )
}

export function GrowthPanel() {
  const stats = useNono((s) => s.stats)
  const months = stats?.by_month ?? []
  let running = 0
  const before = (stats?.total ?? 0) - months.reduce((a, m) => a + m.count, 0)
  const cumulative = months.map((m) => (running += m.count) + before)
  return (
    <Panel title="Brain Growth" icon={<TrendingUp />} meta={`${stats?.total ?? 0} memories`} delay={180}>
      {months.length ? <AreaChart values={cumulative} labels={months.map((m) => m.month.slice(2).replace('-', '/'))} /> :
        <div className="empty">Every instruction you give becomes a neuron. Talk to NONO to grow the brain.</div>}
    </Panel>
  )
}

export function ActivityPanel() {
  const stats = useNono((s) => s.stats)
  const hours = stats?.by_hour ?? Array(24).fill(0)
  const max = Math.max(1, ...hours)
  const now = new Date().getUTCHours()
  return (
    <Panel title="Activity" icon={<Activity />} meta="by hour (UTC)" delay={240}>
      <svg className="chart" viewBox="0 0 300 94" preserveAspectRatio="none">
        {hours.map((v, i) => {
          const h = (v / max) * 72 + 2
          const x = i * (300 / 24) + 2
          return (
            <g key={i}>
              <rect x={x} y={80 - h} width={300 / 24 - 4} height={h} rx="1.5"
                fill={i === now ? '#e0faff' : 'url(#bg)'} style={{ filter: i === now ? 'drop-shadow(0 0 6px #22d3ee)' : undefined }} />
              {i % 6 === 0 && <text x={x + 4} y={92} textAnchor="middle">{String(i).padStart(2, '0')}</text>}
            </g>
          )
        })}
        <defs>
          <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#0e7490" stopOpacity=".4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="chips">
        {Object.entries(stats?.by_category ?? {}).slice(0, 4).map(([c, n]) => (
          <span className="chip" key={c}><Brain style={{ color: stats?.category_colors[c] }} />{c} <b>{n}</b></span>
        ))}
      </div>
    </Panel>
  )
}
