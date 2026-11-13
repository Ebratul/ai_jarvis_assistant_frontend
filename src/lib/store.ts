import { create } from 'zustand'
import type { Alert, BrainStats, ChatResult, Integrations, NonoState, Reminder, SystemInfo, Voice, CalEvent } from './api'

export type Status = 'booting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'
export type View = 'hud' | 'brain'
export type Mode = 'general' | 'realtime' | 'audio'

export interface ChatMessage {
  id: string
  role: 'user' | 'nono' | 'system'
  text: string
  at: number
  meta?: Partial<ChatResult> & { source?: string }
}

interface Store {
  view: View
  status: Status
  mode: Mode
  online: boolean
  state: NonoState | null
  voices: Voice[]
  messages: ChatMessage[]
  interim: string
  alerts: Alert[]
  system: SystemInfo | null
  stats: BrainStats | null
  reminders: Reminder[]
  events: CalEvent[]
  integrations: Integrations | null
  modal: null | 'settings' | 'calendar' | 'log'
  settingsTab: 'brain' | 'voice' | 'speech' | 'integrations'
  wakeWord: boolean
  set: (p: Partial<Store>) => void
  push: (m: Omit<ChatMessage, 'id' | 'at'>) => void
  alert: (a: Alert) => void
}

const savedWake = (() => {
  try {
    return localStorage.getItem('nono.wake') !== '0'
  } catch {
    return true
  }
})()

export const useNono = create<Store>((set) => ({
  view: 'hud',
  status: 'booting',
  mode: 'general',
  online: false,
  state: null,
  voices: [],
  messages: [],
  interim: '',
  alerts: [],
  system: null,
  stats: null,
  reminders: [],
  events: [],
  integrations: null,
  modal: null,
  settingsTab: 'brain',
  wakeWord: savedWake,
  set: (p) => set(p),
  push: (m) =>
    set((s) => ({
      messages: [...s.messages.slice(-80), { ...m, id: crypto.randomUUID(), at: Date.now() }],
    })),
  alert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, 40) })),
}))
