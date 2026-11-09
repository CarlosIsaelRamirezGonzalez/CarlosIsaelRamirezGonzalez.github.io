/**
 * NOVA fuera del recuadro: cuando aceptan el tour, sale del botón de la esquina, vuela hasta cada
 * apartado de la página y lo presenta con una burbuja al lado, punto por punto.
 *
 * - Vuela como en la app: se inclina y mira hacia donde va; al llegar, mira lo que presenta.
 * - Saluda al empezar, gira al llegar a su propio proyecto y baila al despedirse.
 * - Controles en la burbuja y teclado: Esc sale, flechas cambian de paso, espacio pausa.
 */
import { NovaAvatar } from './avatar'
import type { Speech } from './speech'
import { TOUR, type TourStep } from './tour'
import { lightComponents } from './wires'

/** Segundos de lectura después de terminar una frase antes de seguir. */
const READ_PAUSE = 1.6
/** Píxeles por segundo a los que vuela. */
const FLY_SPEED = 900

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const narrow = (): boolean => window.innerWidth < 760

interface Point {
  x: number
  y: number
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html) node.innerHTML = html
  return node
}

export class Guide {
  private readonly root: HTMLElement
  private readonly canvas: HTMLCanvasElement
  readonly avatar: NovaAvatar
  private readonly bubble: HTMLElement
  readonly subtitle: HTMLElement
  private readonly status: HTMLElement
  private readonly buttons: Record<'prev' | 'pause' | 'next' | 'voice' | 'exit', HTMLButtonElement>
  private step = -1
  private position: Point
  private goal: Point
  private frame = 0
  private lastTime = 0
  private advanceTimer = 0
  private focused: Element | null = null
  private arrived = false
  private onExit: () => void = () => undefined
  /** Dónde escribía los subtítulos antes del tour, para devolvérselos al panel. */
  private panelSubtitle: HTMLElement | null = null
  /** Dónde va la burbuja respecto a NOVA (desplazamiento en píxeles). */
  private bubbleOffset: Point = { x: 0, y: 0 }

  /**
   * @param speech Quien habla; la guía le presta sus subtítulos y su avatar.
   * @param from Dónde está el botón de la esquina: NOVA sale volando desde ahí y regresa ahí.
   */
  private readonly speech: Speech
  private readonly from: () => Point

  constructor(speech: Speech, from: () => Point) {
    this.speech = speech
    this.from = from
    this.root = element('div', '')
    this.root.id = 'nova-guide'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', 'Tour guiado por NOVA')

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'nova-guide-canvas'
    this.avatar = new NovaAvatar(this.canvas)

    this.bubble = element('div', 'nova-bubble')
    this.subtitle = element('div', '')
    this.subtitle.id = 'nova-subtitle'
    this.subtitle.setAttribute('aria-live', 'polite')
    this.subtitle.setAttribute('aria-atomic', 'true')
    this.status = element('p', 'mono mt-2')
    this.buttons = {
      prev: this.icon('‹', 'Paso anterior'),
      pause: this.icon('⏸', 'Pausar'),
      next: this.icon('›', 'Paso siguiente'),
      voice: this.icon('voz', 'Voz'),
      exit: this.icon('✕', 'Salir del tour'),
    }
    const controls = element('div', 'mt-2 flex items-center gap-1')
    controls.append(this.buttons.prev, this.buttons.pause, this.buttons.next, this.buttons.voice, this.buttons.exit)
    const foot = element('p', 'mono mt-3 text-[11.5px]', 'Demo guiada de NOVA. La real corre en la app de escritorio de Carlos.')
    this.bubble.append(this.subtitle, this.status, controls, foot)
    this.root.append(this.canvas, this.bubble)
    document.body.append(this.root)

    const start = this.from()
    this.position = { ...start }
    this.goal = { ...start }
    this.bind()
  }

  private icon(label: string, title: string): HTMLButtonElement {
    const button = element('button', 'nova-icon', label)
    button.type = 'button'
    button.title = title
    button.setAttribute('aria-label', title)
    return button
  }

  private bind(): void {
    this.buttons.exit.addEventListener('click', () => this.exit())
    this.buttons.next.addEventListener('click', () => void this.go(this.step + 1))
    this.buttons.prev.addEventListener('click', () => void this.go(this.step - 1))
    this.buttons.pause.addEventListener('click', () => this.setPaused(!this.speech.paused))
    this.buttons.voice.addEventListener('click', () => this.setVoice(!this.speech.voice))
    document.addEventListener('keydown', (event) => {
      if (this.root.hidden) return
      if (event.key === 'Escape') this.exit()
      else if (event.key === 'ArrowRight') void this.go(this.step + 1)
      else if (event.key === 'ArrowLeft') void this.go(this.step - 1)
      else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        this.setPaused(!this.speech.paused)
      }
    })
    window.addEventListener('resize', () => this.aim())
    window.addEventListener('scroll', () => this.aim(), { passive: true })
  }

  /** Empieza el tour: NOVA sale del recuadro. */
  async start(onExit: () => void): Promise<void> {
    this.onExit = onExit
    this.position = { ...this.from() }
    this.root.hidden = false
    this.panelSubtitle = this.speech.subtitleElement
    this.speech.setSubtitle(this.subtitle)
    this.speech.attach(this.avatar)
    this.avatar.start()
    this.lastTime = 0
    this.loop()
    // La voz se enciende aquí porque el tour empieza con un clic; si no hay audios ni síntesis, queda apagada.
    const hasAudio = await this.speech.audioAvailable(TOUR[0].id)
    this.setVoice(hasAudio || 'speechSynthesis' in window)
    await this.go(0)
  }

  private setVoice(on: boolean): void {
    this.speech.setVoice(on)
    this.buttons.voice.setAttribute('aria-pressed', String(on))
    this.buttons.voice.title = on ? 'Voz encendida' : 'Voz apagada'
    this.buttons.voice.setAttribute('aria-label', this.buttons.voice.title)
  }

  private setPaused(paused: boolean): void {
    this.speech.setPaused(paused)
    window.clearTimeout(this.advanceTimer)
    if (!paused) this.scheduleAdvance()
    this.buttons.pause.textContent = paused ? '▶' : '⏸'
    this.buttons.pause.title = paused ? 'Continuar' : 'Pausar'
    this.buttons.pause.setAttribute('aria-label', this.buttons.pause.title)
  }

  private updateControls(): void {
    this.buttons.prev.disabled = this.step <= 0
    this.buttons.next.disabled = this.step >= TOUR.length - 1
    this.status.textContent = `${this.step + 1} de ${TOUR.length}`
  }

  private async go(index: number): Promise<void> {
    if (index >= TOUR.length) return this.exit()
    if (index < 0) return
    window.clearTimeout(this.advanceTimer)
    this.step = index
    this.updateControls()
    const step = TOUR[index]
    this.point(step)
    await this.flyTo(step)
    if (this.step !== index) return
    if (step.gesture === 'wave') this.avatar.wave()
    if (step.gesture === 'spin') this.avatar.spin()
    if (step.gesture === 'dance') this.avatar.dance()
    await this.speech.say(step.text, { mood: step.mood, audioId: step.id })
    if (this.step === index) this.scheduleAdvance()
  }

  private scheduleAdvance(): void {
    window.clearTimeout(this.advanceTimer)
    if (this.speech.paused || this.step < 0) return
    this.advanceTimer = window.setTimeout(() => void this.go(this.step + 1), READ_PAUSE * 1000)
  }

  /** Lleva la página al objetivo, lo resalta y manda al enjambre a armarlo de inmediato. */
  private point(step: TourStep): void {
    const target = document.querySelector<HTMLElement>(step.target)
    this.focused?.removeAttribute('data-nova-focus')
    this.focused = null
    lightComponents(step.components ?? [])
    if (!target) return
    window.dispatchEvent(new Event('swarm:turbo'))
    target.setAttribute('data-nova-focus', '')
    this.focused = target
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: narrow() ? 'start' : 'center' })
  }

  /** Espera a que NOVA llegue junto al objetivo (o un máximo razonable). */
  private flyTo(step: TourStep): Promise<void> {
    this.arrived = false
    this.aim(step)
    return new Promise((resolve) => {
      const started = performance.now()
      const check = (): void => {
        if (this.arrived || performance.now() - started > 2200 || this.root.hidden) resolve()
        else requestAnimationFrame(check)
      }
      check()
    })
  }

  /** Caja del contenido real del objetivo (el texto, no el bloque completo). */
  private contentRect(target: HTMLElement): DOMRect {
    const range = document.createRange()
    range.selectNodeContents(target)
    const rect = range.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 ? rect : target.getBoundingClientRect()
  }

  /** Calcula a dónde debe volar: junto al objetivo, dentro de la pantalla, sin taparlo. */
  private aim(step: TourStep | undefined = TOUR[this.step]): void {
    if (!step || this.root.hidden) return
    const anchorSelector = step.place === 'below' || !step.components?.length ? step.target : `[data-component="${step.components[0]}"]`
    const target = document.querySelector<HTMLElement>(anchorSelector)
    if (!target) return
    const rect = step.place === 'below' ? target.getBoundingClientRect() : this.contentRect(target)
    const size = this.size()
    const margin = 12
    const bubbleWidth = 340
    const bubbleHeight = this.bubble.offsetHeight || 200
    if (step.place === 'below' && !narrow()) {
      // Debajo del bloque, pegada a su lado derecho, con la burbuja a su izquierda.
      this.goal = {
        x: Math.min(rect.right - size, window.innerWidth - size - margin),
        y: Math.min(rect.bottom + 12, window.innerHeight - size - margin),
      }
      this.bubbleOffset = { x: -(bubbleWidth + 8), y: 8 }
      return
    }
    if (narrow()) {
      // En celular, NOVA y la burbuja forman una franja fija abajo; la página deja ese espacio libre.
      this.goal = { x: margin, y: window.innerHeight - size - margin }
      this.bubbleOffset = { x: size + 8, y: 0 }
      return
    }
    const y = Math.min(Math.max(rect.top + rect.height / 2 - size / 2, 72), window.innerHeight - size - margin)
    const roomRight = window.innerWidth - rect.right - margin
    const roomLeft = rect.left - margin
    const below = y + size + 8 + bubbleHeight <= window.innerHeight - margin
    const stacked = { x: 0, y: below ? size + 8 : -(bubbleHeight + 8) }
    if (roomRight >= size + bubbleWidth + 40) {
      this.goal = { x: rect.right + 24, y }
      this.bubbleOffset = { x: size + 8, y: 16 }
    } else if (roomRight >= size + 24) {
      this.goal = { x: rect.right + 24, y }
      this.bubbleOffset = stacked
    } else if (roomLeft >= size + bubbleWidth + 40) {
      this.goal = { x: rect.left - size - 24, y }
      this.bubbleOffset = { x: -(bubbleWidth + 8), y: 16 }
    } else if (roomLeft >= size + 24) {
      this.goal = { x: rect.left - size - 24, y }
      this.bubbleOffset = stacked
    } else {
      // Ocupa todo el ancho: NOVA se pone en la esquina derecha y la burbuja debajo o encima.
      this.goal = { x: window.innerWidth - size - margin, y }
      this.bubbleOffset = stacked
    }
  }

  private size(): number {
    return narrow() ? 116 : 210
  }

  /** Alto de la franja de abajo en celular: NOVA o la burbuja, lo que sea más alto, más margen. */
  private sheetHeight(): number {
    return Math.max(this.size(), this.bubble.offsetHeight) + 24
  }

  /** En celular, la página reserva la franja de abajo para que nada quede tapado. */
  private reserveSheet(on: boolean): void {
    const height = on && narrow() ? `${this.sheetHeight()}px` : ''
    document.body.style.paddingBottom = height
    document.documentElement.style.scrollPaddingBottom = height
  }

  private loop(): void {
    const tick = (now: number): void => {
      if (this.root.hidden) return
      this.frame = requestAnimationFrame(tick)
      const dt = this.lastTime ? Math.min(0.05, (now - this.lastTime) / 1000) : 1 / 60
      this.lastTime = now
      const dx = this.goal.x - this.position.x
      const dy = this.goal.y - this.position.y
      const distance = Math.hypot(dx, dy)
      if (reducedMotion()) {
        this.position = { ...this.goal }
      } else if (distance > 1) {
        const stepLength = Math.min(distance, FLY_SPEED * dt * Math.min(1, 0.25 + distance / 300))
        this.position.x += (dx / distance) * stepLength
        this.position.y += (dy / distance) * stepLength
        this.avatar.setVelocity({ x: (dx / distance) * stepLength / dt, y: (dy / distance) * stepLength / dt })
      } else {
        this.avatar.setVelocity(null)
      }
      if (distance < 6 && !this.arrived) this.arrived = true
      this.place()
    }
    this.frame = requestAnimationFrame(tick)
  }

  /** Coloca el lienzo, la burbuja y la mirada. */
  private place(): void {
    const size = this.size()
    const { x, y } = this.position
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`

    const step = TOUR[this.step]
    const target = step ? document.querySelector<HTMLElement>(step.components?.length ? `[data-component="${step.components[0]}"]` : step.target) : null
    if (target) {
      // Mira hacia lo que presenta, en coordenadas del lienzo.
      const rect = target.getBoundingClientRect()
      const gx = (rect.left + rect.width / 2 - x) / size
      const gy = (rect.top + rect.height / 2 - y) / size
      this.avatar.setGaze({ x: Math.min(1.2, Math.max(-0.2, gx)), y: Math.min(1.2, Math.max(-0.2, gy)) })
    } else {
      this.avatar.setGaze(null)
    }

    if (narrow()) {
      // Franja de abajo: NOVA a la izquierda, la burbuja ocupa el resto, y la página no pasa por debajo.
      const left = 12 + size + 8
      this.bubble.style.left = `${left}px`
      this.bubble.style.width = `${window.innerWidth - left - 12}px`
      this.bubble.style.top = `${Math.round(window.innerHeight - this.bubble.offsetHeight - 12)}px`
      this.reserveSheet(true)
      return
    }
    const bubbleWidth = 340
    const left = Math.min(Math.max(12, x + this.bubbleOffset.x), window.innerWidth - bubbleWidth - 12)
    const top = Math.min(Math.max(64, y + this.bubbleOffset.y), window.innerHeight - this.bubble.offsetHeight - 12)
    this.bubble.style.left = `${Math.round(left)}px`
    this.bubble.style.top = `${Math.round(top)}px`
    this.bubble.style.width = `${bubbleWidth}px`
  }

  /** Termina el tour: NOVA regresa volando a su recuadro y se apaga la guía. */
  exit(): void {
    if (this.root.hidden) return
    window.clearTimeout(this.advanceTimer)
    this.speech.stop()
    this.speech.detach(this.avatar)
    this.speech.setPaused(false)
    if (this.panelSubtitle) this.speech.setSubtitle(this.panelSubtitle)
    this.focused?.removeAttribute('data-nova-focus')
    this.focused = null
    lightComponents()
    this.step = -1
    this.subtitle.textContent = ''
    this.bubble.style.visibility = 'hidden'
    this.goal = { ...this.from() }
    const started = performance.now()
    const finish = (): void => {
      const distance = Math.hypot(this.goal.x - this.position.x, this.goal.y - this.position.y)
      if (distance > 4 && performance.now() - started < 1500) {
        requestAnimationFrame(finish)
        return
      }
      cancelAnimationFrame(this.frame)
      this.root.hidden = true
      this.bubble.style.visibility = ''
      this.reserveSheet(false)
      this.avatar.stop()
      this.onExit()
    }
    finish()
  }
}
