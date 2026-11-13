import { AlarmClock, CalendarDays, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { del, post } from '../../lib/api'
import { refreshAgenda } from '../../lib/controller'
import { useNono } from '../../lib/store'
import { Modal } from './SettingsModal'

export function CalendarModal() {
  const set = useNono((s) => s.set)
  const reminders = useNono((s) => s.reminders)
  const events = useNono((s) => s.events)
  const [rText, setRText] = useState('')
  const [rWhen, setRWhen] = useState('in 30 minutes')
  const [eTitle, setETitle] = useState('')
  const [eStart, setEStart] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    void refreshAgenda()
  }, [])

  const addReminder = async () => {
    if (!rText) return
    try {
      await post('/api/reminders', { text: rText, when: rWhen })
      setRText('')
      setErr('')
      void refreshAgenda()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const addEvent = async () => {
    if (!eTitle || !eStart) return
    try {
      await post('/api/events', { title: eTitle, start: eStart })
      setETitle('')
      setErr('')
      void refreshAgenda()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Modal title="AGENDA" onClose={() => set({ modal: null })}>
      <p className="note">Or just say: <code>“Nono, remind me to call mom tomorrow at 5pm”</code> · <code>“schedule a meeting with Rahim on Monday 11am”</code> · <code>“what's on my calendar this week?”</code></p>
      <div className="grid2">
        <div className="card">
          <h4><span><AlarmClock size={15} /> Reminders</span><span className="badge free">{reminders.length}</span></h4>
          <ul className="list">
            {reminders.length === 0 && <li className="empty">No pending reminders.</li>}
            {reminders.map((r) => (
              <li key={r.id} className="item" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span className="txt">{r.text}{r.repeat ? ` · ${r.repeat}` : ''}</span>
                <span className="when">{fmt(r.due_at)}</span>
                <button className="mini danger" onClick={async () => { await del(`/api/reminders/${r.id}`); void refreshAgenda() }} aria-label="Cancel"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" style={{ flex: 2, minWidth: 120 }} placeholder="Reminder text" value={rText} onChange={(e) => setRText(e.target.value)} />
            <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="when" value={rWhen} onChange={(e) => setRWhen(e.target.value)} />
            <button className="btn" onClick={addReminder}><Plus />Add</button>
          </div>
        </div>
        <div className="card">
          <h4><span><CalendarDays size={15} /> Events · next 14 days</span><span className="badge free">{events.length}</span></h4>
          <ul className="list">
            {events.length === 0 && <li className="empty">No events.</li>}
            {events.map((e) => (
              <li key={e.id} className="item" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span className="txt">{e.title}{e.location ? ` · ${e.location}` : ''}</span>
                <span className="when">{fmt(e.start)}</span>
                {e.source === 'local' ? <button className="mini danger" onClick={async () => { await del(`/api/events/${e.id}`); void refreshAgenda() }} aria-label="Delete"><Trash2 size={12} /></button> : <span className="badge ok">google</span>}
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" style={{ flex: 2, minWidth: 120 }} placeholder="Event title" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
            <input className="input" style={{ flex: 1, minWidth: 150 }} type="datetime-local" value={eStart} onChange={(e) => setEStart(e.target.value)} />
            <button className="btn" onClick={addEvent}><Plus />Add</button>
          </div>
        </div>
      </div>
      {err && <p className="note" style={{ color: '#fb7185' }}>{err}</p>}
    </Modal>
  )
}

export function LogModal() {
  const set = useNono((s) => s.set)
  const messages = useNono((s) => s.messages)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView(), [messages.length])
  return (
    <Modal title="CONVERSATION LOG" onClose={() => set({ modal: null })}>
      <div className="log">
        {messages.length === 0 && <div className="empty">No conversation yet in this session.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.text}
            <div className="meta">
              {new Date(m.at).toLocaleTimeString()} {m.meta?.source ? `· ${m.meta.source}` : ''}
              {m.meta?.model ? ` · ${m.meta.provider}/${String(m.meta.model).split('/').pop()}` : ''}
              {m.meta?.latency_ms ? ` · ${(m.meta.latency_ms / 1000).toFixed(1)}s` : ''}
            </div>
            {m.meta?.actions?.map((a, i) => <span key={i} className={`tool-tag ${a.ok ? '' : 'bad'}`}>{a.tool}{a.ok ? '' : ' ✕'}</span>)}
          </div>
        ))}
        <div ref={end} />
      </div>
    </Modal>
  )
}
