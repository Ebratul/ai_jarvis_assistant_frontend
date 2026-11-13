import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Sparkles } from '@react-three/drei'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { audioBus } from '../../lib/audioBus'
import { useNono, type Status } from '../../lib/store'
import {
  beamFragment, beamVertex, discFragment, fresnelFragment, fresnelVertex, particleFragment, particleVertex, streakFragment,
} from './shaders'

const STATUS_COLOR: Record<Status, string> = {
  booting: '#22d3ee',
  idle: '#22d3ee',
  listening: '#5eead4',
  thinking: '#a78bfa',
  speaking: '#60a5fa',
  offline: '#fb7185',
}
const STATUS_ENERGY: Record<Status, number> = { booting: 0.1, idle: 0.08, listening: 0.3, thinking: 0.45, speaking: 0.25, offline: 0.02 }
const STATUS_SPEED: Record<Status, number> = { booting: 1, idle: 1, listening: 1.6, thinking: 3.2, speaking: 1.8, offline: 0.3 }

// Shared per-frame drive values (no React re-render).
const drive = { color: new THREE.Color('#22d3ee'), energy: 0.1, speed: 1, t: 0 }

function Driver() {
  const target = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    const status = useNono.getState().status
    target.set(STATUS_COLOR[status])
    drive.color.lerp(target, Math.min(1, dt * 3))
    const goal = STATUS_ENERGY[status] + audioBus.level * (status === 'speaking' ? 1.4 : 0.9)
    drive.energy += (goal - drive.energy) * Math.min(1, dt * 8)
    drive.speed += (STATUS_SPEED[status] - drive.speed) * Math.min(1, dt * 2)
    drive.t += dt * drive.speed
  })
  return null
}

function fibonacciSphere(n: number, r: number) {
  const pos = new Float32Array(n * 3)
  const rand = new Float32Array(n)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th = golden * i
    const jitter = r * (0.97 + Math.random() * 0.06)
    pos.set([Math.cos(th) * rad * jitter, y * jitter, Math.sin(th) * rad * jitter], i * 3)
    rand[i] = Math.random()
  }
  return { pos, rand }
}

function ParticleSphere({ count = 7000, radius = 1.55 }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const pts = useRef<THREE.Points>(null)
  const { gl } = useThree()
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const { pos, rand } = fibonacciSphere(count, radius)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    return g
  }, [count, radius])
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uEnergy: { value: 0 }, uSize: { value: 22 }, uColor: { value: new THREE.Color() }, uPixelRatio: { value: gl.getPixelRatio() } }),
    [gl],
  )
  useFrame(() => {
    uniforms.uTime.value = drive.t
    uniforms.uEnergy.value = drive.energy
    uniforms.uColor.value.copy(drive.color)
    if (pts.current) {
      pts.current.rotation.y = drive.t * 0.12
      pts.current.rotation.x = Math.sin(drive.t * 0.1) * 0.15
    }
  })
  return (
    <points ref={pts} geometry={geo}>
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={particleVertex} fragmentShader={particleFragment}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function FresnelShell({ radius, power, fill, opacity = 1 }: { radius: number; power: number; fill: number; opacity?: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uEnergy: { value: 0 }, uPower: { value: power }, uFill: { value: fill } }), [power, fill])
  useFrame(() => {
    uniforms.uColor.value.copy(drive.color).multiplyScalar(opacity)
    uniforms.uEnergy.value = drive.energy
  })
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <shaderMaterial uniforms={uniforms} vertexShader={fresnelVertex} fragmentShader={fresnelFragment}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.FrontSide} />
    </mesh>
  )
}

function NeuralShell() {
  const ref = useRef<THREE.LineSegments>(null)
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.05, 2)), [])
  const mat = useMemo(() => new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  useFrame(() => {
    mat.color.copy(drive.color)
    mat.opacity = 0.12 + drive.energy * 0.35
    if (ref.current) {
      ref.current.rotation.y = -drive.t * 0.25
      ref.current.rotation.z = drive.t * 0.1
      const s = 1 + drive.energy * 0.15
      ref.current.scale.setScalar(s)
    }
  })
  return <lineSegments ref={ref} geometry={geo} material={mat} />
}

function CoreLabel() {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)
  const ref = useRef<THREE.Mesh>(null)
  useEffect(() => {
    let alive = true
    document.fonts.load('900 120px Orbitron').finally(() => {
      if (!alive) return
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 320
      const ctx = c.getContext('2d')!
      ctx.font = '900 190px Orbitron, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = '#67e8f9'
      ctx.shadowBlur = 40
      ctx.fillStyle = '#e0faff'
      ctx.fillText('NONO', 512, 170)
      ctx.shadowBlur = 0
      ctx.fillText('NONO', 512, 170)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      setTex(t)
    })
    return () => {
      alive = false
    }
  }, [])
  useFrame(() => {
    if (!ref.current) return
    const s = 1 + drive.energy * 0.12
    ref.current.scale.set(s, s, s)
    ;(ref.current.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.min(0.25, drive.energy)
  })
  if (!tex) return null
  return (
    <Billboard>
      <mesh ref={ref}>
        <planeGeometry args={[1.65, 0.52]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </Billboard>
  )
}

function Ring({ radius, tube = 0.01, tilt, speed, arc = Math.PI * 2, opacity = 0.9, offset = 0 }: {
  radius: number; tube?: number; tilt: [number, number, number]; speed: number; arc?: number; opacity?: number; offset?: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useFrame(() => {
    mat.color.copy(drive.color).multiplyScalar(1.4)
    mat.opacity = opacity * (0.6 + drive.energy * 0.8)
    if (ref.current) ref.current.rotation.z = offset + drive.t * speed
  })
  return (
    <group rotation={tilt}>
      <mesh ref={ref} material={mat}>
        <torusGeometry args={[radius, tube, 8, 220, arc]} />
      </mesh>
    </group>
  )
}

function SegmentedRing({ radius, tilt, speed, segments = 3, arc = 0.8, tube = 0.022 }: {
  radius: number; tilt: [number, number, number]; speed: number; segments?: number; arc?: number; tube?: number
}) {
  return (
    <>
      {Array.from({ length: segments }, (_, i) => (
        <Ring key={i} radius={radius} tube={tube} tilt={tilt} speed={speed} arc={arc} offset={(i / segments) * Math.PI * 2} opacity={1} />
      ))}
    </>
  )
}

function Comet({ a, b, tilt, speed, phase = 0 }: { a: number; b: number; tilt: [number, number, number]; speed: number; phase?: number }) {
  const N = 90
  const head = useRef<THREE.Mesh>(null)
  const { line, geo } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    return { line: new THREE.Line(g, m), geo: g }
  }, [])
  useFrame(() => {
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    const t0 = drive.t * speed + phase
    for (let i = 0; i < N; i++) {
      const t = t0 - i * 0.028
      pos.setXYZ(i, Math.cos(t) * a, Math.sin(t) * b, 0)
      const k = Math.pow(1 - i / N, 2) * 1.8
      col.setXYZ(i, drive.color.r * k, drive.color.g * k, drive.color.b * k)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    head.current?.position.set(Math.cos(t0) * a, Math.sin(t0) * b, 0)
  })
  return (
    <group rotation={tilt}>
      <primitive object={line} />
      <mesh ref={head}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Lightning() {
  const count = 5
  const lines = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3))
        const m = new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
        return new THREE.Line(g, m)
      }),
    [],
  )
  const timer = useRef(0)
  useFrame((_, dt) => {
    timer.current += dt
    const active = drive.energy > 0.22
    lines.forEach((l) => {
      const m = l.material as THREE.LineBasicMaterial
      m.color.copy(drive.color).multiplyScalar(2)
      m.opacity = active ? Math.max(0, m.opacity - dt * 4) : 0
    })
    if (!active || timer.current < 0.07) return
    timer.current = 0
    const l = lines[Math.floor(Math.random() * count)]
    const pos = l.geometry.attributes.position as THREE.BufferAttribute
    const dir = new THREE.Vector3().randomDirection()
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(dir, side)
    for (let i = 0; i < 14; i++) {
      const r = 1.6 + (i / 13) * (0.8 + Math.random() * 0.9)
      const j = i === 0 ? 0 : 0.12
      const p = dir.clone().multiplyScalar(r).addScaledVector(side, (Math.random() - 0.5) * j * 2).addScaledVector(up, (Math.random() - 0.5) * j * 2)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    pos.needsUpdate = true
    ;(l.material as THREE.LineBasicMaterial).opacity = Math.min(1, drive.energy * 1.6)
  })
  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  )
}

function Streaks() {
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uEnergy: { value: 0 } }), [])
  useFrame(() => {
    uniforms.uColor.value.copy(drive.color)
    uniforms.uTime.value = drive.t
    uniforms.uEnergy.value = drive.energy
  })
  const mat = (
    <shaderMaterial uniforms={uniforms} vertexShader={beamVertex} fragmentShader={streakFragment}
      transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
  )
  return (
    <group position={[0, 0.05, -0.4]}>
      <mesh position={[3.4, 0, 0]}>
        <planeGeometry args={[5, 0.9]} />
        {mat}
      </mesh>
      <mesh position={[-3.4, 0, 0]} rotation={[0, 0, Math.PI]}>
        <planeGeometry args={[5, 0.9]} />
        {mat}
      </mesh>
      <mesh position={[3.0, -0.35, 0]} rotation={[0, 0, -0.08]}>
        <planeGeometry args={[4, 0.5]} />
        {mat}
      </mesh>
      <mesh position={[-3.0, 0.32, 0]} rotation={[0, 0, Math.PI - 0.08]}>
        <planeGeometry args={[4, 0.5]} />
        {mat}
      </mesh>
    </group>
  )
}

function Platform() {
  const y = -2.45
  const discUniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uEnergy: { value: 0 } }), [])
  const beamUniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uEnergy: { value: 0 } }), [])
  const spin = useRef<THREE.Group>(null)
  const spin2 = useRef<THREE.Group>(null)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), [])
  const ticks = useMemo(() => {
    const g = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.005, 0.16), ringMat, 120)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2
      const len = i % 10 === 0 ? 1.8 : 1
      m.compose(new THREE.Vector3(Math.cos(a) * 3.35, 0, Math.sin(a) * 3.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)), new THREE.Vector3(1, 1, len))
      g.setMatrixAt(i, m)
    }
    return g
  }, [ringMat])
  useFrame(() => {
    for (const u of [discUniforms, beamUniforms]) {
      u.uColor.value.copy(drive.color)
      u.uTime.value = drive.t
      u.uEnergy.value = drive.energy
    }
    ringMat.color.copy(drive.color).multiplyScalar(1.3)
    ringMat.opacity = 0.55 + drive.energy * 0.5
    if (spin.current) spin.current.rotation.y = drive.t * 0.25
    if (spin2.current) spin2.current.rotation.y = -drive.t * 0.4
  })
  const rings = [1.35, 1.9, 2.5, 3.05, 3.7]
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.5, 8.5]} />
        <shaderMaterial uniforms={discUniforms} vertexShader={beamVertex} fragmentShader={discFragment}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {rings.map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
          <ringGeometry args={[r, r + (i % 2 ? 0.012 : 0.025), 160]} />
        </mesh>
      ))}
      <group ref={spin}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]} material={ringMat}>
            <ringGeometry args={[2.15, 2.24, 64, 1, 0, Math.PI / 3]} />
          </mesh>
        ))}
      </group>
      <group ref={spin2}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, (i * Math.PI * 2) / 3]} material={ringMat}>
            <ringGeometry args={[2.75, 2.8, 64, 1, 0, Math.PI / 2.2]} />
          </mesh>
        ))}
        <primitive object={ticks} />
      </group>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[1.05, 1.5, 2.3, 64, 1, true]} />
        <shaderMaterial uniforms={beamUniforms} vertexShader={beamVertex} fragmentShader={beamFragment}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Starfield() {
  const geo = useMemo(() => {
    const n = 1400
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 30)
      p.set([v.x, v.y, v.z], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  const ref = useRef<THREE.Points>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.06} color="#7dd3fc" transparent opacity={0.55} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function Rig() {
  const { camera, size, pointer } = useThree()
  useFrame((_, dt) => {
    const portrait = size.width / size.height < 1
    const baseZ = portrait ? 12.5 : 8.6
    const tx = pointer.x * 0.45
    const ty = 0.35 + pointer.y * 0.25
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 2)
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 2)
    camera.position.z += (baseZ - camera.position.z) * Math.min(1, dt * 2)
    camera.lookAt(0, -0.25, 0)
  })
  return null
}

function Core() {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.position.y = Math.sin(drive.t * 0.8) * 0.06
  })
  return (
    <group ref={group}>
      <ParticleSphere />
      <FresnelShell radius={1.62} power={2.6} fill={0.0} opacity={0.9} />
      <FresnelShell radius={0.78} power={1.6} fill={0.03} opacity={0.45} />
      <NeuralShell />
      <CoreLabel />
      <Ring radius={2.05} tube={0.012} tilt={[1.25, 0.25, 0]} speed={0.4} />
      <Ring radius={2.35} tube={0.008} tilt={[1.55, -0.5, 0.2]} speed={-0.3} opacity={0.7} />
      <SegmentedRing radius={1.9} tilt={[Math.PI / 2, 0, 0]} speed={0.9} segments={3} arc={0.9} />
      <SegmentedRing radius={2.65} tilt={[1.9, 0.6, 0]} speed={-0.55} segments={4} arc={0.45} tube={0.014} />
      <Comet a={3.3} b={1.25} tilt={[0.35, 0.2, 0.18]} speed={0.55} />
      <Comet a={2.9} b={2.2} tilt={[1.2, -0.7, 0]} speed={-0.4} phase={2} />
      <Lightning />
    </group>
  )
}

export default function CoreScene() {
  return (
    <Canvas
      className="core-canvas"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.4, 8.6], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
    >
      <Driver />
      <Rig />
      <Starfield />
      <Streaks />
      <Core />
      <Platform />
      <Sparkles count={140} scale={[11, 6, 6]} size={2.2} speed={0.35} color="#7dd3fc" opacity={0.6} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.14} luminanceSmoothing={0.4} radius={0.72} />
        <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.0007, 0.0005)} radialModulation={false} modulationOffset={0} />
        <Noise opacity={0.035} />
        <Vignette eskil={false} offset={0.18} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  )
}
