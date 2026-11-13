// NONO voice engine: wake word + push-to-talk speech recognition, ElevenLabs playback, browser fallbacks.
import { fetchTTS, transcribe, type Voice } from './api'
import { audioBus, setAnalyser, startAudioBus } from './audioBus'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any

const WAKE = /\b(?:hey\s+|ok\s+|okay\s+)?(?:no[\s-]?no|nonu|nono|nano|nonnah?|noh?no)\b[,.!?]?|নোনো|নো নো|নুনু/i

export interface VoiceCallbacks {
  onCommand: (text: string) => void
  onInterim: (text: string) => void
  onListening: (on: boolean) => void
  onWake: () => void
  onError: (msg: string) => void
}

export type TtsEngine = 'eleven' | 'browser'

export class VoiceEngine {
  ctx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private micAnalyser: AnalyserNode | null = null
  private ttsAnalyser: AnalyserNode | null = null
  private recognition: Recognition | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mode: 'off' | 'ptt' | 'wake' = 'off'
  private awaiting = false
  private awaitTimer = 0
  private current: AudioBufferSourceNode | null = null
  private fakeLevel = 0
  speaking = false
  lang = 'en-US'
  cb: VoiceCallbacks

  constructor(cb: VoiceCallbacks) {
    this.cb = cb
  }

  get sttSupported() {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }

  get wakeActive() {
    return this.mode === 'wake'
  }

  async init() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.ttsAnalyser = this.ctx.createAnalyser()
      this.ttsAnalyser.fftSize = 512
      this.ttsAnalyser.smoothingTimeConstant = 0.6
      this.ttsAnalyser.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    startAudioBus()
  }

  private async openMic() {
    await this.init()
    if (this.micStream) return
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const src = this.ctx!.createMediaStreamSource(this.micStream)
    this.micAnalyser = this.ctx!.createAnalyser()
    this.micAnalyser.fftSize = 512
    src.connect(this.micAnalyser)
    if (!this.speaking) setAnalyser(this.micAnalyser, 'mic')
  }

  private closeMic() {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    if (audioBus.source === 'mic') setAnalyser(null, null)
    this.micAnalyser = null
  }

  private makeRecognition(continuous: boolean): Recognition {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const r = new SR()
    r.lang = this.lang
    r.continuous = continuous
    r.interimResults = true
    r.maxAlternatives = 1
    return r
  }

  // ------------------------------------------------------------------ push to talk
  async startPushToTalk() {
    this.stopSpeaking()
    if (this.mode === 'wake') this.pauseWake()
    this.mode = 'ptt'
    try {
      await this.openMic()
    } catch {
      this.cb.onError('Microphone permission denied')
      this.mode = 'off'
      return
    }
    this.cb.onListening(true)
    this.chime(880)
    if (this.sttSupported) {
      const r = this.makeRecognition(false)
      this.recognition = r
      let finalText = ''
      r.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t
          else interim += t
        }
        this.cb.onInterim((finalText + ' ' + interim).trim())
      }
      r.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') this.cb.onError(`Speech error: ${e.error}`)
      }
      r.onend = () => {
        this.recognition = null
        this.finishPtt(finalText.replace(WAKE, '').trim())
      }
      r.start()
    } else {
      this.chunks = []
      this.recorder = new MediaRecorder(this.micStream!)
      this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
      this.recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' })
        this.recorder = null
        try {
          const text = await transcribe(blob, this.lang)
          this.finishPtt(text.replace(WAKE, '').trim())
        } catch (err) {
          this.cb.onError(`Speech-to-text unavailable: ${(err as Error).message}`)
          this.finishPtt('')
        }
      }
      this.recorder.start()
    }
  }

  stopPushToTalk() {
    if (this.mode !== 'ptt') return
    if (this.recognition) this.recognition.stop()
    else if (this.recorder?.state === 'recording') this.recorder.stop()
  }

  private finishPtt(text: string) {
    this.cb.onListening(false)
    this.cb.onInterim('')
    this.mode = 'off'
    if (!this.wakeWanted) this.closeMic()
    if (text) this.cb.onCommand(text)
    if (this.wakeWanted && !this.speaking) this.startWake()
  }

  // ------------------------------------------------------------------ wake word ("nono ...")
  private wakeWanted = false

  async startWake() {
    this.wakeWanted = true
    if (!this.sttSupported) {
      this.cb.onError('Hands-free wake word needs Chrome or Edge. Use push-to-talk instead.')
      return
    }
    if (this.mode === 'wake' || this.mode === 'ptt' || this.speaking) return
    try {
      await this.openMic()
    } catch {
      this.wakeWanted = false
      this.cb.onError('Microphone permission denied. Allow the mic for hands-free mode.')
      return
    }
    this.mode = 'wake'
    const r = this.makeRecognition(true)
    this.recognition = r
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text: string = e.results[i][0].transcript.trim()
        const isFinal = e.results[i].isFinal
        const m = text.match(WAKE)
        if (this.awaiting) {
          this.cb.onInterim(text.replace(WAKE, '').trim())
          if (isFinal && text.replace(WAKE, '').trim()) this.command(text.replace(WAKE, '').trim())
        } else if (m) {
          const after = text.slice((m.index ?? 0) + m[0].length).trim()
          this.cb.onInterim(after || '…')
          if (isFinal) {
            if (after.length > 1) this.command(after)
            else this.armFollowUp(true)
          }
        }
      }
    }
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        this.wakeWanted = false
        this.cb.onError('Microphone blocked for speech recognition')
      }
    }
    r.onend = () => {
      if (this.recognition === r) this.recognition = null
      if (this.mode === 'wake') {
        this.mode = 'off'
        if (this.wakeWanted && !this.speaking) setTimeout(() => this.startWake(), 250)
      }
    }
    try {
      r.start()
    } catch {
      /* already started */
    }
  }

  stopWake() {
    this.wakeWanted = false
    this.pauseWake()
    this.closeMic()
    this.cb.onListening(false)
  }

  private pauseWake() {
    if (this.mode === 'wake') {
      this.mode = 'off'
      try {
        this.recognition?.abort()
      } catch {
        /* noop */
      }
      this.recognition = null
    }
  }

  private armFollowUp(fromWake: boolean) {
    this.awaiting = true
    if (fromWake) {
      this.chime(988)
      this.cb.onWake()
    }
    this.cb.onListening(true)
    clearTimeout(this.awaitTimer)
    this.awaitTimer = window.setTimeout(() => {
      this.awaiting = false
      this.cb.onListening(false)
      this.cb.onInterim('')
    }, fromWake ? 8000 : 6000)
  }

  private command(text: string) {
    this.awaiting = false
    clearTimeout(this.awaitTimer)
    this.cb.onListening(false)
    this.cb.onInterim('')
    this.cb.onCommand(text)
  }

  // ------------------------------------------------------------------ speaking
  async speak(text: string, voice: Voice | undefined, engine: TtsEngine): Promise<void> {
    if (!text.trim()) return
    await this.init()
    this.stopSpeaking()
    const token = ++this.speakToken
    this.speaking = true
    if (this.mode === 'wake') this.pauseWake() // don't let NONO hear itself
    try {
      if (engine === 'eleven' && voice) await this.playEleven(text, voice)
      else await this.playBrowser(text, voice)
    } catch {
      if (token === this.speakToken && this.speaking) await this.playBrowser(text, voice)
    } finally {
      if (token === this.speakToken) this.afterSpeech()
    }
  }

  private speakToken = 0

  private async afterSpeech() {
    {
      this.speaking = false
      setAnalyser(this.micAnalyser, this.micAnalyser ? 'mic' : null)
      if (this.wakeWanted) {
        await this.startWake()
        if (this.mode === 'wake') this.armFollowUp(false) // natural follow-up without saying "nono" again
      }
    }
  }

  private async playEleven(text: string, voice: Voice) {
    const buf = await fetchTTS(text, voice.id)
    const token = this.speakToken
    const audio = await this.ctx!.decodeAudioData(buf)
    if (!this.speaking || token !== this.speakToken) return
    const src = this.ctx!.createBufferSource()
    src.buffer = audio
    src.connect(this.ttsAnalyser!)
    setAnalyser(this.ttsAnalyser, 'tts')
    this.current = src
    await new Promise<void>((resolve) => {
      src.onended = () => resolve()
      src.start()
    })
    this.current = null
  }

  private playBrowser(text: string, voice?: Voice) {
    return new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window)) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      const bengali = /[ঀ-৿]/.test(text)
      u.lang = bengali ? 'bn-BD' : voice?.browser.lang ?? 'en-US'
      u.pitch = voice?.browser.pitch ?? 1
      u.rate = voice?.browser.rate ?? 1
      const all = speechSynthesis.getVoices()
      const pick =
        (bengali && all.find((v) => v.lang.startsWith('bn'))) ||
        voice?.browser.prefer.map((p) => all.find((v) => v.name.includes(p) && v.lang.startsWith(u.lang.slice(0, 2)))).find(Boolean) ||
        all.find((v) => v.lang === u.lang)
      if (pick) u.voice = pick
      setAnalyser(null, 'tts')
      const timer = window.setInterval(() => {
        this.fakeLevel = 0.25 + Math.random() * 0.55
        audioBus.level = this.fakeLevel
      }, 90)
      const done = () => {
        clearInterval(timer)
        resolve()
      }
      u.onend = done
      u.onerror = done
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    })
  }

  stopSpeaking() {
    try {
      this.current?.stop()
    } catch {
      /* noop */
    }
    this.current = null
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    this.speaking = false
  }

  chime(freq = 880) {
    if (!this.ctx) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + 0.12)
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25)
    o.connect(g).connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + 0.3)
  }
}
