/**
 * NOVA en el sitio, dibujada con el mismo renderizador de la app de escritorio.
 *
 * Los archivos de `./avatar/` son copia literal del repo de NOVA (`frontend/src/nova/`): la
 * simulación (`novaState`), las emociones y el dibujo en pixel art. Aquí solo se les da un lienzo
 * y un ciclo de animación. Con `prefers-reduced-motion`, la simulación corre al mínimo y NOVA
 * solo parpadea y flota.
 */
import type { Activity, EmotionBlend } from './avatar/emotions'
import { CANVAS_SIZE, createNovaState, stepNova, type NovaState } from './avatar/novaState'
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

  /**
   * Prepara el lienzo.
   *
   * @param canvas Lienzo de 160 × 160 (el tamaño nativo del renderizador); se escala con CSS.
   */
  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    this.context = canvas.getContext('2d')!
  }

  /** Cambia cómo se siente y qué hace. */
  setMood(mood: Mood): void {
    this.mood = mood
  }

  /** Intensidad de la voz, de 0 a 1; mueve la boca y el cuerpo mientras habla. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level))
  }

  /** Detiene la simulación cuando el lienzo no se ve, para no gastar cuadros. */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (!paused) this.last = 0
  }

  start(): void {
    if (this.frame) return
    const tick = (now: number): void => {
      this.frame = requestAnimationFrame(tick)
      if (this.paused) return
      // Con movimiento reducido basta con unos cuadros por segundo.
      if (this.reducedMotion && now - this.last < 200) return
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60
      this.last = now
      const { blend, activity } = MOODS[this.mood]
      stepNova(this.state, {
        dt,
        blend,
        activity,
        level: this.level,
        pointer: null,
        lookAtInput: false,
        reducedMotion: this.reducedMotion,
        grab: { held: false, vx: 0, vy: 0, heading: null },
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
