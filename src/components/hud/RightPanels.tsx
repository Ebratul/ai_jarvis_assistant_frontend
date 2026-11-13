import { AlarmClock, Bell, BrainCircuit, CalendarDays, CalendarPlus, History, LayoutGrid, MessageCircle, Send, Settings2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Alert, type Memory } from '../../lib/api'
import { useNono } from '../../lib/store'
import { Panel, timeAgo } from './Panel'

function alertView(a: Alert) {
  switch (a.type) {
    case 'reminder': return { icon: <AlarmClock />, text: `Reminder: ${a.text}`, color: '#f5a524' }
    case 'reminder_set': return { icon: <Bell />, text: `Reminder set: ${(a.reminder as { text: string })?.text ?? ''}`, color: '#22d3ee' }
    case 'event_added': return { icon: <CalendarPlus />, text: `Event added: ${a.title}`, color: '#38bdf8' }
    case 'telegram': return { icon: <Send />, text: `Telegram · ${a.sender ?? ''}: ${a.text}`, color: '#38bdf8' }
    case 'error': return { icon: <TriangleAlert />, text: String(a.text), color: '#fb7185' }
    default: return { icon: <Bell />, text: String(a.text ?? a.type), color: '#22d3ee' }
  }
}

export function AlertsPanel() {
  const alerts = useNono((s) => s.alerts)
  return (
    <Panel title="Live Alerts" icon={<Bell />} meta={alerts.length ? `${alerts.length}` : undefined} delay={80}>
      <ul className="list" style={{ maxHeight: 128, overflow: 'auto' }}>
        {alerts.length === 0 && <li className="empty">All quiet. Reminders, Telegram messages and events appear here live.</li>}
        {alerts.slice(0, 6).map((a, i) => {
          const v = alertView(a)
          return (
            <li className="item" key={`${a.at}-${i}`}>
              <span className="ico" style={{ color: v.color, background: `${v.color}22` }}>{v.icon}</span>
              <span className="txt">{v.text}</span>
              <span className="when">{timeAgo(a.at)}</span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function RecentPanel() {
  const messages = useNono((s) => s.messages.length)
  const stats = useNono((s) => s.stats?.total)
  const set = useNono((s) => s.set)
  const [items, setItems] = useState<Memory[]>([])
  useEffect(() => {
    api<{ items: Memory[] }>('/api/brain/memories?limit=4').then((r) => setItems(r.items)).catch(() => setItems([]))
  }, [messages, stats])
  return (
    <Panel title="Memory Stream" icon={<History />} meta={<button className="chip" onClick={() => set({ modal: 'log' })}>log</button>} delay={140}>
      <ul className="list">
        {items.length === 0 && <li className="empty">No instructions yet. Everything you say is stored forever.</li>}
        {items.map((m) => (
          <li className="item" key={m.id} onClick={() => set({ view: 'brain' })} style={{ cursor: 'pointer' }}>
            <span className="ico" style={{ color: m.color, background: `${m.color}22` }}><BrainCircuit /></span>
            <span>
              <span className="txt">{m.text}</span>
              <span className="sub">{m.category} · {m.source}</span>
            </span>
            <span className="when">{timeAgo(m.created_at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ShortcutsPanel() {
  const set = useNono((s) => s.set)
  return (
    <Panel title="Shortcuts" icon={<LayoutGrid />} delay={200}>
      <div className="shortcuts">
        <button className="shortcut" onClick={() => set({ view: 'brain' })}><BrainCircuit />Brain</button>
        <button className="shortcut" onClick={() => set({ modal: 'calendar' })}><CalendarDays />Agenda</button>
        <button className="shortcut" onClick={() => set({ modal: 'settings', settingsTab: 'integrations' })}><MessageCircle />Telegram</button>
        <button className="shortcut" onClick={() => set({ modal: 'settings', settingsTab: 'brain' })}><Settings2 />Models</button>
      </div>
    </Panel>
  )
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function AgendaPanel() {
  const reminders = useNono((s) => s.reminders)
  const events = useNono((s) => s.events)
  const set = useNono((s) => s.set)
  const items = [
    ...reminders.map((r) => ({ id: r.id, text: r.text, at: r.due_at, kind: 'reminder' as const })),
    ...events.map((e) => ({ id: e.id, text: e.title, at: e.start, kind: 'event' as const })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 6)
  return (
    <Panel title="Agenda" icon={<CalendarDays />} meta={<button className="chip" onClick={() => set({ modal: 'calendar' })}>open</button>} delay={260} className="grow">
      <ul className="list scroll">
        {items.length === 0 && <li className="empty">Nothing scheduled. Try: “Nono, remind me to stretch in 30 minutes”.</li>}
        {items.map((i) => (
          <li className="item" key={i.id}>
            <span className="ico" style={i.kind === 'reminder' ? { color: '#f5a524', background: '#f5a52422' } : undefined}>
              {i.kind === 'reminder' ? <AlarmClock /> : <CalendarDays />}
            </span>
            <span className="txt">{i.text}</span>
            <span className="when">{fmtWhen(i.at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
