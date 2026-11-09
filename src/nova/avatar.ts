/**
 * NOVA en el sitio, dibujada con el mismo renderizador de la app de escritorio.
 *
 * Los archivos de `./avatar/` son copia literal del repo de NOVA (`frontend/src/nova/`): la
 * simulación (`novaState`), las emociones y el dibujo en pixel art. Aquí solo se les da un lienzo,
 * un ciclo de animación y los gestos que el sitio usa: saludar, bailar, girar, volar mirando hacia
 * donde va. Con `prefers-reduced-motion`, la simulación corre al mínimo.
 */
import type { Activity, EmotionBlend } from './avatar/emotions'
import { CANVAS_SIZE, createNovaState, startDance, startSpin, startWave, stepNova, type NovaState } from './avatar/novaState'
import { PixelBuffer } from './avatar/pixelBuffer'
import { renderNova } from './avatar/renderNova'

/** Estados que el sitio usa; se traducen a la emoción y actividad reales de NOVA. */
export type Mood = 'idle' | 'speaking' | 'thinking' | 'happy' | 'surprised' | 'curious'

const MOODS: Record<Mood, { blend: EmotionBlend; activity: Activity }> = {
  idle: { blend: [], activity: 'idle' },
  speaking: { blend: [{ name: 'happy', intensity: 0.35 }], activity: 'speaking' },
  thinking: { blend: [{ name: 'curious', intensity: 0.5 }], activity: 'thinking' },
  happy: { blend: [{ name: 'happy', intensity: 0.8 }], activity: 'idle' },
  surprised: { blend: [{ name: 'surprised', intensity: 0.7 }], activity: 'idle' },
  curious: { blend: [{ name: 'curious', intensity: 0.7 }], activity: 'speaking' },
}

export class NovaAvatar {
  private readonly context: CanvasRenderingContext2D
  private readonly buffer = new PixelBuffer(CANVAS_SIZE)
  private readonly state: NovaState = createNovaState()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private mood: Mood = 'idle'
  private level = 0
  private frame = 0
  private last = 0
  private paused = false
  /** Hacia dónde vuela (en píxeles por segundo); `null` si está quieta. */
  private velocity: { x: number; y: number } | null = null
  /** A qué punto del lienzo mira; `null` para mirar al frente. */
  private gaze: { x: number; y: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    this.context = canvas.getContext('2d')!
  }

  setMood(mood: Mood): void {
    this.mood = mood
  }

  /** Intensidad de la voz, de 0 a 1. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level))
  }

  /** Mientras vuela, se inclina y mira hacia donde va, como en la app. */
  setVelocity(velocity: { x: number; y: number } | null): void {
    this.velocity = velocity && Math.hypot(velocity.x, velocity.y) > 8 ? velocity : null
  }

  /**
   * Hacia dónde mira, en fracciones del lienzo (0 a 1 en cada eje); `null` para mirar al frente.
   */
  setGaze(gaze: { x: number; y: number } | null): void {
    this.gaze = gaze ? { x: gaze.x * CANVAS_SIZE, y: gaze.y * CANVAS_SIZE } : null
  }

  wave(): void {
    startWave(this.state)
  }

  dance(): void {
    if (!this.reducedMotion) startDance(this.state)
  }

  spin(): void {
    if (!this.reducedMotion) startSpin(this.state)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (!paused) this.last = 0
  }

  start(): void {
    if (this.frame) return
    const tick = (now: number): void => {
      this.frame = requestAnimationFrame(tick)
      if (this.paused) return
      if (this.reducedMotion && now - this.last < 200) return
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60
      this.last = now
      const { blend, activity } = MOODS[this.mood]
      const flying = this.velocity !== null
      stepNova(this.state, {
        dt,
        blend,
        activity,
        level: this.level,
        pointer: this.gaze,
        lookAtInput: this.gaze !== null,
        reducedMotion: this.reducedMotion,
        grab: {
          held: false,
          vx: flying ? this.velocity!.x : 0,
          vy: flying ? this.velocity!.y : 0,
          heading: flying ? { x: Math.sign(this.velocity!.x), y: Math.sign(this.velocity!.y) } : null,
        },
        excitement: Math.max(0, ...blend.filter((item) => item.name === 'happy' || item.name === 'surprised').map((item) => item.intensity)),
      })
      renderNova(this.buffer, this.state)
      this.context.putImageData(this.buffer.image, 0, 0)
    }
    this.frame = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }
}
