import { ArrowLeft, Download, Focus, Pause, Pin, Play, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import SpriteText from 'three-spritetext'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { api, del, exportUrl, patch, type GraphData, type GraphLink, type GraphNode, type Memory } from '../../lib/api'
import { useNono } from '../../lib/store'
import { MiniCore } from './MiniCore'

type Link = GraphLink & { source: string | GraphNode; target: string | GraphNode }
const lid = (v: string | GraphNode) => (typeof v === 'object' ? v.id : v)

const TYPE_LABEL: Record<string, string> = { core: 'Core', category: 'Categories', topic: 'Topics', year: 'Years', memory: 'Instructions' }
const LINK_COLOR: Record<string, string> = {
  hub: 'rgba(125,211,252,0.55)', category: 'rgba(148,197,255,0.22)', topic: 'rgba(234,179,8,0.22)',
  time: 'rgba(168,85,247,0.12)', similar: 'rgba(94,234,212,0.5)',
}

function heat(t: number) {
  // 0 = oldest (violet) → 1 = newest (cyan/white)
  const c = new THREE.Color().setHSL(0.75 - t * 0.27, 0.85, 0.45 + t * 0.2)
  return `#${c.getHexString()}`
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ago(iso?: string) {
  if (!iso) return ''
  const days = (Date.now() - Date.parse(iso)) / 86400000
  if (days < 1) return 'today'
  if (days < 30) return `${Math.floor(days)} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${(days / 365).toFixed(1)} years ago`
}

export default function BrainView() {
  const set = useNono((s) => s.set)
  const fg = useRef<ForceGraphMethods<GraphNode, Link> | undefined>(undefined)
  const [raw, setRaw] = useState<GraphData | null>(null)
  const [error, setError] = useState('')
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [disabledCats, setDisabledCats] = useState<Set<string>>(new Set())
  const [showTopics, setShowTopics] = useState(true)
  const [showYears, setShowYears] = useState(true)
  const [labels, setLabels] = useState(true)
  const [particles, setParticles] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const [stars, setStars] = useState(true)
  const [theme, setTheme] = useState<'type' | 'heat'>('type')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [pathEnd, setPathEnd] = useState<GraphNode | null>(null)
  const [detail, setDetail] = useState<(Memory & { related: { memory: Memory; score: number }[] }) | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [playing, setPlaying] = useState(false)
  const [sidebar, setSidebar] = useState(window.innerWidth > 760)
  const starsRef = useRef<THREE.Points | null>(null)

  const load = useCallback(() => {
    api<GraphData>('/api/brain/graph?limit=4000&similarity=0.32&k=3')
      .then((g) => {
        setRaw(g)
        setError('')
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    load()
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [load])

  // time bounds
  const bounds = useMemo<[number, number]>(() => {
    const ts = (raw?.nodes ?? []).filter((n) => n.created_at).map((n) => Date.parse(n.created_at!))
    if (!ts.length) return [Date.now() - 86400000, Date.now()]
    return [Math.min(...ts), Math.max(Date.now(), ...ts)]
  }, [raw])
  const [from, to] = range ?? bounds

  // visible graph
  const data = useMemo(() => {
    if (!raw) return { nodes: [] as GraphNode[], links: [] as Link[] }
    const mem = raw.nodes.filter((n) => n.type === 'memory' && !disabledCats.has(n.category ?? '') &&
      Date.parse(n.created_at!) >= from && Date.parse(n.created_at!) <= to + 1)
    const visible = new Set(mem.map((n) => n.id))
    const connected = new Set<string>()
    for (const l of raw.links) {
      const s = lid(l.source)
      const t = lid(l.target)
      if (visible.has(s)) connected.add(t)
      if (visible.has(t)) connected.add(s)
    }
    const hubs = raw.nodes.filter((n) => {
      if (n.type === 'core') return true
      if (n.type === 'memory') return false
      if (n.type === 'topic' && !showTopics) return false
      if (n.type === 'year' && !showYears) return false
      if (n.type === 'category' && disabledCats.has(n.category ?? '')) return false
      return connected.has(n.id)
    })
    hubs.forEach((n) => visible.add(n.id))
    const links = raw.links
      .filter((l) => visible.has(lid(l.source)) && visible.has(lid(l.target)))
      .map((l) => ({ ...l, source: lid(l.source), target: lid(l.target) }))
    return { nodes: [...hubs, ...mem], links }
  }, [raw, disabledCats, showTopics, showYears, from, to])

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const l of data.links) {
      const s = lid(l.source)
      const t = lid(l.target)
      if (!m.has(s)) m.set(s, new Set())
      if (!m.has(t)) m.set(t, new Set())
      m.get(s)!.add(t)
      m.get(t)!.add(s)
    }
    return m
  }, [data])

  // highlight: selection neighbours, traced path, or search matches
  const { hiNodes, hiLinks } = useMemo(() => {
    const nodes = new Set<string>()
    const links = new Set<string>()
    if (selected && pathEnd) {
      const prev = new Map<string, string | null>([[selected.id, null]])
      const queue = [selected.id]
      while (queue.length) {
        const cur = queue.shift()!
        if (cur === pathEnd.id) break
        for (const nb of adjacency.get(cur) ?? []) if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb) }
      }
      let cur: string | null | undefined = pathEnd.id
      while (cur) {
        nodes.add(cur)
        const p = prev.get(cur)
        if (p) {
          links.add(`${p}|${cur}`)
          links.add(`${cur}|${p}`)
        }
        cur = p
      }
    } else if (selected) {
      nodes.add(selected.id)
      for (const nb of adjacency.get(selected.id) ?? []) {
        nodes.add(nb)
        links.add(`${selected.id}|${nb}`)
        links.add(`${nb}|${selected.id}`)
      }
    } else if (query.trim().length > 1) {
      const q = query.toLowerCase()
      for (const n of data.nodes) if ((n.text ?? n.label).toLowerCase().includes(q)) nodes.add(n.id)
    }
    return { hiNodes: nodes, hiLinks: links }
  }, [selected, pathEnd, adjacency, query, data.nodes])

  const anyHi = hiNodes.size > 0

  const nodeColor = useCallback((n: GraphNode) => {
    const base = theme === 'heat' && n.created_at ? heat((Date.parse(n.created_at) - bounds[0]) / Math.max(1, bounds[1] - bounds[0])) : n.color
    if (!anyHi) return base
    return hiNodes.has(n.id) ? base : 'rgba(40,60,80,0.25)'
  }, [theme, bounds, anyHi, hiNodes])

  const linkColor = useCallback((l: Link) => {
    const key = `${lid(l.source)}|${lid(l.target)}`
    if (anyHi) return hiLinks.has(key) ? 'rgba(125,211,252,0.55)' : 'rgba(30,50,70,0.05)'
    return LINK_COLOR[l.type] ?? 'rgba(148,163,184,0.2)'
  }, [anyHi, hiLinks])

  const nodeObject = useCallback((n: GraphNode) => {
    if (!labels) return undefined as unknown as THREE.Object3D
    const important = n.type === 'core' || n.type === 'category' || n.type === 'year' || (n.type === 'topic' && (n.count ?? 0) >= 3)
    if (!important && !(n.type === 'memory' && hiNodes.has(n.id) && hiNodes.size < 30)) return undefined as unknown as THREE.Object3D
    const s = new SpriteText(n.type === 'memory' ? n.label : n.label)
    s.color = n.type === 'core' ? '#e0faff' : n.type === 'topic' ? '#fde68a' : '#e2f3ff'
    s.textHeight = n.type === 'core' ? 7 : n.type === 'category' || n.type === 'year' ? 4.2 : 2.6
    s.fontFace = n.type === 'core' ? 'Orbitron' : 'Rajdhani'
    s.fontWeight = '700'
    s.backgroundColor = false as unknown as string
    s.position.set(0, (Math.cbrt(n.val) * 4) + 3, 0)
    return s
  }, [labels, hiNodes])

  // one-time scene setup: bloom, stars, controls
  const setup = useRef(false)
  useEffect(() => {
    const g = fg.current
    if (!g || setup.current || !raw) return
    setup.current = true
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 0.85, 0.35, 0.22)
    g.postProcessingComposer().addPass(bloom)
    const n = 1200
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 1600)
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#9bdcff', size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.45, depthWrite: false }))
    starsRef.current = pts
    g.scene().add(pts)
    g.d3Force('charge')?.strength(-38)
    const linkForce = g.d3Force('link') as unknown as { distance: (fn: (l: Link) => number) => void } | undefined
    linkForce?.distance((l: Link) => (l.type === 'hub' ? 120 : l.type === 'category' ? 55 : l.type === 'time' ? 140 : l.type === 'similar' ? 26 : 45))
    setTimeout(() => g.zoomToFit(1200, 80), 1800)
  }, [raw, size.w, size.h])

  useEffect(() => {
    const c = fg.current?.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number } | undefined
    if (c) {
      c.autoRotate = autoRotate && !selected
      c.autoRotateSpeed = 0.45
    }
  }, [autoRotate, selected, raw])

  useEffect(() => {
    if (starsRef.current) starsRef.current.visible = stars
  }, [stars])

  // detail fetch
  useEffect(() => {
    setDetail(null)
    if (selected?.type !== 'memory') return
    api<Memory & { related: { memory: Memory; score: number }[] }>(`/api/brain/memories/${selected.id}`).then(setDetail).catch(() => {})
  }, [selected])

  // timeline replay
  useEffect(() => {
    if (!playing) return
    const span = bounds[1] - bounds[0]
    let cur = range ? range[1] : bounds[0]
    if (cur >= bounds[1]) cur = bounds[0] + span * 0.02
    const t = setInterval(() => {
      cur += span / 160
      if (cur >= bounds[1]) {
        cur = bounds[1]
        setPlaying(false)
      }
      setRange([bounds[0], cur])
    }, 70)
    return () => clearInterval(t)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (n: GraphNode) => {
    const g = fg.current
    if (!g || n.x == null) return
    const dist = n.type === 'memory' ? 90 : 320
    const r = 1 + dist / Math.max(1, Math.hypot(n.x, n.y ?? 0, n.z ?? 0))
    g.cameraPosition({ x: n.x * r, y: (n.y ?? 0) * r, z: (n.z ?? 0) * r }, { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }, 1300)
  }

  const onNodeClick = (n: GraphNode, e: MouseEvent) => {
    if (e.shiftKey && selected && selected.id !== n.id) {
      setPathEnd(n)
      return
    }
    setPathEnd(null)
    setSelected(n)
    focus(n)
  }

  const flyToSearch = () => {
    const first = data.nodes.find((n) => hiNodes.has(n.id))
    if (first) {
      setSelected(first)
      focus(first)
    }
  }

  const togglePin = async () => {
    if (!detail) return
    const m = await patch<Memory>(`/api/brain/memories/${detail.id}`, { pinned: !detail.pinned })
    setDetail({ ...detail, ...m })
  }

  const remove = async () => {
    if (!detail || !confirm('Delete this memory forever?')) return
    await del(`/api/brain/memories/${detail.id}`)
    setSelected(null)
    load()
  }

  const counts = raw?.category_counts ?? {}
  const memCount = data.nodes.filter((n) => n.type === 'memory').length
  const hubNeighbours = selected && selected.type !== 'memory'
    ? data.nodes.filter((n) => n.type === 'memory' && adjacency.get(selected.id)?.has(n.id)).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 8)
    : []

  return (
    <div className="brain">
      {raw && (
        <ForceGraph3D<GraphNode, Link>
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="#01040c"
          controlType="orbit"
          showNavInfo={false}
          nodeId="id"
          nodeVal={(n) => n.val}
          nodeRelSize={3.2}
          nodeColor={nodeColor}
          nodeOpacity={0.95}
          nodeResolution={14}
          nodeLabel={(n) => `<div class="tip"><b>${escapeHtml(n.type === 'memory' ? n.text ?? '' : n.label)}</b>${n.created_at ? `<br/><span>${fmtDate(n.created_at)}</span>` : ''}</div>`}
          nodeThreeObject={nodeObject}
          nodeThreeObjectExtend
          linkColor={linkColor}
          linkOpacity={0.5}
          linkWidth={(l) => (anyHi && hiLinks.has(`${lid(l.source)}|${lid(l.target)}`) ? 0.45 : 0)}
          linkDirectionalParticles={(l) => (particles && (l.type === 'similar' || l.type === 'hub' || hiLinks.has(`${lid(l.source)}|${lid(l.target)}`)) ? 2 : 0)}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleColor={() => '#a5f3fc'}
          onNodeClick={onNodeClick}
          onBackgroundClick={() => { setSelected(null); setPathEnd(null) }}
          enableNodeDrag={false}
          warmupTicks={60}
          cooldownTime={12000}
        />
      )}

      {/* left sidebar */}
      <aside className={`brain-side ${sidebar ? '' : 'collapsed'}`}>
        <button className="collapse" onClick={() => setSidebar(!sidebar)} aria-label="Toggle sidebar">{sidebar ? '«' : '»'}</button>
        <div className="brain-title">NONO BRAIN</div>
        <div className="brain-sub">{raw?.total_memories ?? 0} memories · {data.links.length} connections</div>
        <button className="back" onClick={() => set({ view: 'hud' })}><ArrowLeft size={14} /> back to console</button>
        <div className="search">
          <Search size={14} />
          <input placeholder="Search the brain…" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
            onKeyDown={(e) => e.key === 'Enter' && flyToSearch()} />
        </div>

        <h5>Inspector</h5>
        <div className="inspector">
          {!selected && <p className="hint">Click a node to focus it. Only that node and its connections light up, and its details show here. Shift-click a second node to trace the path between them.</p>}
          {selected && selected.type === 'memory' && (
            <>
              <div className="ins-cat" style={{ color: selected.color }}>● {selected.category} · {selected.source}</div>
              <div className="ins-text">“{selected.text}”</div>
              <div className="ins-meta">{fmtDate(selected.created_at)} · {ago(selected.created_at)}</div>
              {selected.response && <div className="ins-resp"><span>NONO</span> {selected.response}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                {(selected.topics ?? []).map((t) => <span className="tool-tag" key={t}>#{t}</span>)}
                {(selected.tools ?? []).map((t) => <span className="tool-tag" key={t} style={{ color: '#fde68a' }}>{t}</span>)}
                {selected.model && <span className="tool-tag" style={{ color: '#c4b5fd' }}>{selected.model.split('/').pop()}</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="mini" onClick={() => focus(selected)}><Focus size={12} /> focus</button>
                <button className="mini" onClick={togglePin}><Pin size={12} /> {detail?.pinned ? 'unpin' : 'pin'}</button>
                <button className="mini danger" onClick={remove}><Trash2 size={12} /> delete</button>
              </div>
              {detail && detail.related.length > 0 && (
                <>
                  <h6>Related memories</h6>
                  {detail.related.slice(0, 5).map((r) => (
                    <button key={r.memory.id} className="rel" onClick={() => { const n = data.nodes.find((x) => x.id === r.memory.id); if (n) { setSelected(n); focus(n) } }}>
                      <i style={{ background: r.memory.color }} />{r.memory.text}<em>{Math.round(r.score * 100)}%</em>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
          {selected && selected.type !== 'memory' && (
            <>
              <div className="ins-cat" style={{ color: selected.color }}>● {TYPE_LABEL[selected.type]}</div>
              <div className="ins-text">{selected.label}</div>
              <div className="ins-meta">{selected.count ?? adjacency.get(selected.id)?.size ?? 0} linked instructions</div>
              {hubNeighbours.map((n) => (
                <button key={n.id} className="rel" onClick={() => { setSelected(n); focus(n) }}>
                  <i style={{ background: n.color }} />{n.text}<em>{n.created_at?.slice(0, 10)}</em>
                </button>
              ))}
            </>
          )}
          {pathEnd && <div className="ins-meta" style={{ marginTop: 8 }}>Path traced to “{pathEnd.label}” · {hiNodes.size} hops</div>}
        </div>

        <h5>Top hubs</h5>
        <ul className="hubs">
          {(raw?.top_hubs ?? []).slice(0, 7).map((h) => (
            <li key={h.id} onClick={() => { const n = data.nodes.find((x) => x.id === h.id); if (n) { setSelected(n); focus(n) } }}>
              <i style={{ background: h.color }} />{h.label}<em>{h.count}</em>
            </li>
          ))}
        </ul>

        <h5>Display</h5>
        <label className="switch"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />Labels</label>
        <label className="switch"><input type="checkbox" checked={particles} onChange={(e) => setParticles(e.target.checked)} />Synapse particles</label>
        <label className="switch"><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />Auto-rotate</label>
        <label className="switch"><input type="checkbox" checked={stars} onChange={(e) => setStars(e.target.checked)} />Starfield</label>

        <h5>Theme</h5>
        <div className="row">
          <button className={`mini ${theme === 'type' ? 'on' : ''}`} onClick={() => setTheme('type')}>By type</button>
          <button className={`mini ${theme === 'heat' ? 'on' : ''}`} onClick={() => setTheme('heat')}>Time heatmap</button>
        </div>
        <a className="mini" style={{ marginTop: 12, display: 'inline-flex' }} href={exportUrl()} download><Download size={12} /> Export brain (JSONL)</a>
      </aside>

      {/* right: filters + mini core */}
      <aside className="brain-filter">
        <h5>Filter</h5>
        {Object.entries(raw?.category_colors ?? {}).filter(([c]) => counts[c]).map(([c, color]) => (
          <label key={c} className={`flt ${disabledCats.has(c) ? 'off' : ''}`}>
            <input type="checkbox" checked={!disabledCats.has(c)} onChange={() => {
              const next = new Set(disabledCats)
              if (next.has(c)) next.delete(c)
              else next.add(c)
              setDisabledCats(next)
            }} />
            <i style={{ background: color, boxShadow: `0 0 8px ${color}` }} />{c}<em>{counts[c]}</em>
          </label>
        ))}
        <label className={`flt ${showTopics ? '' : 'off'}`}><input type="checkbox" checked={showTopics} onChange={(e) => setShowTopics(e.target.checked)} /><i style={{ background: '#eab308' }} />topics<em>{raw?.counts.topic ?? 0}</em></label>
        <label className={`flt ${showYears ? '' : 'off'}`}><input type="checkbox" checked={showYears} onChange={(e) => setShowYears(e.target.checked)} /><i style={{ background: '#a855f7' }} />years<em>{raw?.counts.year ?? 0}</em></label>
      </aside>
      <MiniCore />

      {/* timeline */}
      <div className="timeline">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label="Replay brain growth">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <div className="tl-body">
          <div className="tl-labels">
            <span>{new Date(from).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            <b>{memCount} neurons in view</b>
            <span>{new Date(to).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="tl-range">
            <input type="range" min={bounds[0]} max={bounds[1]} value={from} step={(bounds[1] - bounds[0]) / 400 || 1}
              onChange={(e) => setRange([Math.min(Number(e.target.value), to), to])} aria-label="From date" />
            <input type="range" min={bounds[0]} max={bounds[1]} value={to} step={(bounds[1] - bounds[0]) / 400 || 1}
              onChange={(e) => setRange([from, Math.max(Number(e.target.value), from)])} aria-label="To date" />
          </div>
          <div className="tl-years">
            {(raw?.years ?? []).map((y) => (
              <button key={y} onClick={() => setRange([Date.parse(`${y}-01-01`), Math.min(bounds[1], Date.parse(`${Number(y) + 1}-01-01`) - 1)])}>{y}</button>
            ))}
            <button onClick={() => setRange(null)}>all time</button>
          </div>
        </div>
      </div>

      {error && <div className="brain-empty">Brain offline: {error}<br /><button className="btn" onClick={load}>Retry</button></div>}
      {raw && raw.total_memories === 0 && <div className="brain-empty">Your neural memory is empty.<br />Every instruction you give NONO becomes a glowing neuron here, kept for decades.</div>}
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
