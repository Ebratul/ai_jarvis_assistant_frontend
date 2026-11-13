// Shared, non-React audio telemetry read every frame by the 3D core and the waveform panel.
export const audioBus = {
  level: 0, // smoothed 0..1 loudness
  source: null as null | 'mic' | 'tts',
  wave: new Uint8Array(256),
  freq: new Uint8Array(128),
  analyser: null as AnalyserNode | null,
}

let raf = 0

function tick() {
  const a = audioBus.analyser
  if (a) {
    if (audioBus.wave.length !== a.fftSize) audioBus.wave = new Uint8Array(a.fftSize)
    if (audioBus.freq.length !== a.frequencyBinCount) audioBus.freq = new Uint8Array(a.frequencyBinCount)
    a.getByteTimeDomainData(audioBus.wave)
    a.getByteFrequencyData(audioBus.freq)
    let sum = 0
    for (let i = 0; i < audioBus.wave.length; i++) {
      const v = (audioBus.wave[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.min(1, Math.sqrt(sum / audioBus.wave.length) * 3.2)
    audioBus.level += (rms - audioBus.level) * 0.35
  } else {
    audioBus.level *= 0.9
  }
  raf = requestAnimationFrame(tick)
}

export function startAudioBus() {
  if (!raf) raf = requestAnimationFrame(tick)
}

export function setAnalyser(analyser: AnalyserNode | null, source: 'mic' | 'tts' | null) {
  audioBus.analyser = analyser
  audioBus.source = source
}
