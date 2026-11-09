/**
 * Lo que NOVA dice: subtítulos letra por letra y, si hay voz, el audio grabado con su voz real
 * (`public/audio/nova/<id>.mp3`) o la síntesis del navegador como respaldo.
 *
 * Nunca suena sola: la voz se enciende solo después de un clic de la persona (empezar el tour), y
 * tiene un botón para apagarla.
 */
import type { Mood } from './avatar'

/** Letras por segundo de los subtítulos cuando no hay audio que marque el ritmo. */
const SUBTITLE_CPS = 42

export interface SpeechTarget {
  setMood(mood: Mood): void
  setLevel(level: number): void
}

export interface SayOptions {
  audioId?: string
  mood: Mood
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Recorta un HTML sencillo (texto y `<b>`) a cierta cantidad de caracteres visibles. */
function clipHtml(html: string, count: number): string {
  let shown = 0
  let out = ''
  let inTag = false
  for (const char of html) {
    if (char === '<') inTag = true
    if (inTag) {
      out += char
      if (char === '>') inTag = false
      continue
    }
    if (shown >= count) break
    out += char
    shown++
  }
  const opened = (out.match(/<b>/g) ?? []).length
  const closed = (out.match(/<\/b>/g) ?? []).length
  return opened > closed ? `${out}</b>` : out
}

export class Speech {
  voice = false
  paused = false
  private token = 0
  private audio: HTMLAudioElement | null = null
  private hasAudio: boolean | null = null
  private readonly listeners = new Set<SpeechTarget>()
  private subtitle: HTMLElement

  constructor(subtitle: HTMLElement) {
    this.subtitle = subtitle
  }

  get subtitleElement(): HTMLElement {
    return this.subtitle
  }

  /** Dónde se escriben los subtítulos: el panel de la esquina o la burbuja de la guía. */
  setSubtitle(subtitle: HTMLElement): void {
    this.subtitle = subtitle
  }

  /** Quién se anima mientras habla (el avatar del panel, el que vuela, el del botón). */
  attach(target: SpeechTarget): void {
    this.listeners.add(target)
  }

  detach(target: SpeechTarget): void {
    this.listeners.delete(target)
  }

  private setMood(mood: Mood): void {
    for (const target of this.listeners) target.setMood(mood)
  }

  private setLevel(level: number): void {
    for (const target of this.listeners) target.setLevel(level)
  }

  /** ¿Hay audios grabados? Se comprueba una vez con el primer paso del tour. */
  async audioAvailable(probeId: string): Promise<boolean> {
    if (this.hasAudio === null) {
      try {
        const response = await fetch(`/audio/nova/${probeId}.mp3`, { method: 'HEAD' })
        this.hasAudio = response.ok && (response.headers.get('content-type') ?? '').startsWith('audio')
      } catch {
        this.hasAudio = false
      }
    }
    return this.hasAudio
  }

  /**
   * Dice un texto: escribe el subtítulo y, con la voz encendida, lo reproduce. Si hay audio, los
   * subtítulos van al ritmo del audio.
   *
   * @returns Cuando termina de escribirse y de sonar; antes si llega otra frase.
   */
  async say(html: string, options: SayOptions): Promise<void> {
    const token = ++this.token
    this.stopAudio()
    this.setMood(options.mood === 'idle' ? 'speaking' : options.mood)
    const plain = html.replace(/<[^>]+>/g, '')
    const total = plain.length

    // Duración: la del audio si lo hay; si no, el ritmo de lectura.
    let seconds = total / SUBTITLE_CPS
    let playing: Promise<void> = Promise.resolve()
    if (this.voice && options.audioId && (await this.audioAvailable(options.audioId))) {
      const audio = new Audio(`/audio/nova/${options.audioId}.mp3`)
      this.audio = audio
      const duration = await new Promise<number>((resolve) => {
        audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true })
        audio.addEventListener('error', () => resolve(0), { once: true })
      })
      if (token !== this.token) return
      if (duration > 0) seconds = duration
      playing = new Promise<void>((resolve) => {
        audio.addEventListener('ended', () => resolve(), { once: true })
        audio.addEventListener('error', () => resolve(), { once: true })
        audio.play().catch(() => resolve())
      })
    } else if (this.voice && 'speechSynthesis' in window) {
      playing = new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(plain)
        utterance.lang = 'es-MX'
        utterance.rate = 1.05
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        speechSynthesis.speak(utterance)
      })
    }

    if (reducedMotion()) {
      this.subtitle.innerHTML = html
    } else {
      const cps = total / Math.max(0.5, seconds)
      let elapsed = 0
      let last = performance.now()
      await new Promise<void>((resolve) => {
        const tick = (now: number): void => {
          if (token !== this.token) return resolve()
          if (!this.paused) elapsed += (now - last) / 1000
          last = now
          const shown = Math.min(total, Math.floor(elapsed * cps))
          this.subtitle.innerHTML = clipHtml(html, shown)
          this.setLevel(this.paused ? 0 : 0.45 + 0.35 * Math.abs(Math.sin(now / 90)))
          if (shown < total) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
    }
    await playing
    if (token === this.token) {
      this.setLevel(0)
      this.setMood(options.mood === 'speaking' || options.mood === 'curious' ? 'idle' : options.mood)
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      this.audio?.pause()
      if ('speechSynthesis' in window) speechSynthesis.pause()
    } else {
      this.audio?.play().catch(() => undefined)
      if ('speechSynthesis' in window) speechSynthesis.resume()
    }
  }

  setVoice(on: boolean): void {
    this.voice = on
    if (!on) this.stopAudio()
  }

  /** Corta lo que esté diciendo. */
  stop(): void {
    this.token++
    this.stopAudio()
    this.setLevel(0)
  }

  private stopAudio(): void {
    this.audio?.pause()
    this.audio = null
    if ('speechSynthesis' in window) speechSynthesis.cancel()
  }
}
