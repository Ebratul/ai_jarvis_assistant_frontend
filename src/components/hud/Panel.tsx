import type { ReactNode } from 'react'

export function Panel({ title, icon, meta, children, className = '', delay = 0 }: {
  title: string
  icon?: ReactNode
  meta?: ReactNode
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <section className={`panel ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <header className="panel-head">
        <div className="panel-title">{icon}{title}</div>
        {meta ? <div className="panel-meta">{meta}</div> : <div className="panel-dots"><i /><i /><i /></div>}
      </header>
      {children}
    </section>
  )
}

export function timeAgo(iso: string | number) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 365) return `${Math.floor(s / 86400)}d`
  return `${(s / 86400 / 365).toFixed(1)}y`
}

export function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : `${h}h ${m}m`
}
