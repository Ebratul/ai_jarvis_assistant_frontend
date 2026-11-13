// NONO backend client (REST + WebSocket)
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
const KEY = (import.meta.env.VITE_NONO_KEY as string | undefined) ?? ''

export interface NonoState {
  provider: string
  model: string
  voice: string
  voice_name: string
  language: string
  muted: boolean
  city: string
  user_name: string
  timezone: string
  tts: boolean
}

export interface ToolRun {
  tool: string
  args: Record<string, unknown>
  ok: boolean
  result: Record<string, unknown>
  kind: string
}

export interface ChatResult {
  reply: string
  provider: string | null
  model: string | null
  fast_path: boolean
  actions: ToolRun[]
  client_actions: { tool: string; args: Record<string, unknown> }[]
  memory_id: string | null
  state: NonoState
  latency_ms: number
  error?: string
}

export interface Voice {
  id: string
  name: string
  base: string
  gender: string
  style: string
  color: string
  browser: { pitch: number; rate: number; lang: string; prefer: string[] }
}

export interface Provider {
  id: string
  label: string
  configured: boolean
  free: boolean
  default_model: string
  signup: string
}

export interface ModelInfo {
  id: string
  name: string
  free: boolean
  context?: number | null
}

export interface Memory {
  id: string
  text: string
  response: string | null
  category: string
  topics: string[]
  entities: string[]
  tools: string[]
  source: string
  model: string | null
  importance: number
  pinned: boolean
  created_at: string
  color: string
}

export interface GraphNode {
  id: string
  label: string
  type: 'core' | 'category' | 'topic' | 'year' | 'memory'
  color: string
  val: number
  category?: string
  count?: number
  text?: string
  response?: string
  created_at?: string
  source?: string
  model?: string | null
  topics?: string[]
  tools?: string[]
  pinned?: boolean
  x?: number
  y?: number
  z?: number
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'hub' | 'category' | 'topic' | 'time' | 'similar'
  value: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  counts: Record<string, number>
  category_counts: Record<string, number>
  category_colors: Record<string, string>
  top_hubs: { id: string; label: string; count: number; color: string }[]
  total_memories: number
  shown_memories: number
  similar_links: number
  years: string[]
}

export interface BrainStats {
  total: number
  by_category: Record<string, number>
  category_colors: Record<string, string>
  by_year: Record<string, number>
  by_month: { month: string; count: number }[]
  by_day: { day: string; count: number }[]
  by_hour: number[]
  by_source: Record<string, number>
  top_topics: { topic: string; count: number }[]
  first_at: string | null
  last_at: string | null
}

export interface SystemInfo {
  cpu: number
  cores: number
  ram: number
  ram_used_gb: number
  ram_total_gb: number
  disk: number
  battery: number | null
  charging: boolean | null
  uptime_s: number
  nono_uptime_s: number
  host: string
  os: string
}

export interface Reminder {
  id: string
  text: string
  due_at: string
  repeat: string | null
  status: string
}

export interface CalEvent {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  source: string
}

export interface Alert {
  type: string
  at: string
  text?: string
  reply?: string
  source?: string
  sender?: string
  title?: string
  [k: string]: unknown
}

export interface Integrations {
  telegram: { enabled: boolean; paired: boolean; bot: string | null; pair_code: string | null }
  google_calendar: { connected: boolean }
  rag: { online: boolean; memories?: number; embedder?: string }
  tts: { elevenlabs: boolean; model: string }
  stt: { server: boolean }
  providers: Provider[]
}

function url(path: string) {
  return `${BASE}${path}`
}

function headers(extra?: HeadersInit): HeadersInit {
  return { ...(KEY ? { 'X-Nono-Key': KEY } : {}), ...(extra ?? {}) }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: headers(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init.headers } : init.headers),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' })

export async function fetchTTS(text: string, voice: string): Promise<ArrayBuffer> {
  const res = await fetch(url('/api/tts'), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text, voice }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return res.arrayBuffer()
}

export async function transcribe(blob: Blob, language: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', blob, 'speech.webm')
  fd.append('language', language)
  const r = await api<{ text: string }>('/api/stt', { method: 'POST', body: fd })
  return r.text
}

export function exportUrl() {
  return url('/api/brain/export') + (KEY ? `?key=${encodeURIComponent(KEY)}` : '')
}

export function wsUrl() {
  const base = BASE || window.location.origin
  const u = new URL('/ws', base)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  if (KEY) u.searchParams.set('key', KEY)
  return u.toString()
}
