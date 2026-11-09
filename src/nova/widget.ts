/**
 * El widget de NOVA: un botón compacto en la esquina que se abre en un panel con subtítulos,
 * controles del tour y preguntas rápidas. NOVA guía la página: la desplaza, resalta elementos y
 * los señala con su propio cursor.
 *
 * - Se ofrece una sola vez; la respuesta se recuerda en `localStorage` (dentro de try/catch).
 * - Voz opcional y apagada por defecto: audios de `public/audio/nova/<paso>.mp3` si existen, y si
 *   no, la síntesis del navegador. Nunca suena sola.
 * - Operable con teclado: Esc sale, flechas cambian de paso, espacio pausa.
 */
import { NovaAvatar, type Mood } from './avatar'
import { ScriptedProvider, type NovaProvider } from './provider'
import { OFFER, QUICK, TOUR, type TourStep } from './tour'
import { lightComponents } from './wires'

const STORAGE_KEY = 'nova.offer'
/** Letras por segundo de los subtítulos. */
const SUBTITLE_CPS = 55
/** Segundos de lectura después de terminar un subtítulo antes de pasar al siguiente paso. */
const READ_PAUSE = 2.8

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function remember(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Sin almacenamiento (modo privado, por ejemplo): se ofrece de nuevo la próxima vez.
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html) node.innerHTML = html
  return node
}

class NovaWidget {
  private readonly dock: HTMLElement
  private readonly pointer: SVGSVGElement | null
  private readonly provider: NovaProvider = new ScriptedProvider()
  private readonly toggle: HTMLButtonElement
  private readonly toggleAvatar: NovaAvatar
  private readonly panel: HTMLElement
  private readonly panelAvatar: NovaAvatar
  private readonly subtitle: HTMLElement
  private readonly status: HTMLElement
  private readonly buttons: Record<'prev' | 'pause' | 'next' | 'exit' | 'voice' | 'tour', HTMLButtonElement>
  private offer: HTMLElement | null = null
  private chips: HTMLElement | null = null
  private step = -1
  private paused = false
  private voice = false
  private hasAudio: boolean | null = null
  private typing = 0
  private audio: HTMLAudioElement | null = null
  private advanceTimer = 0
  private focused: Element | null = null

  constructor(dock: HTMLElement) {
    this.dock = dock
    this.pointer = document.querySelector<SVGSVGElement>('#nova-pointer')

    // Botón compacto con NOVA flotando.
    this.toggle = element('button', '')
    this.toggle.id = 'nova-toggle'
    this.toggle.type = 'button'
    this.toggle.setAttribute('aria-label', 'Abrir a NOVA')
    this.toggle.setAttribute('aria-expanded', 'false')
    const toggleCanvas = document.createElement('canvas')
    this.toggle.append(toggleCanvas)
    this.toggleAvatar = new NovaAvatar(toggleCanvas)

    // Panel.
    this.panel = element('section', 'p-4')
    this.panel.id = 'nova-panel'
    this.panel.hidden = true
    this.panel.setAttribute('aria-label', 'NOVA, demo guiada')
    const head = element('div', 'flex items-start gap-3')
    const panelCanvas = document.createElement('canvas')
    panelCanvas.style.width = '96px'
    panelCanvas.style.height = '96px'
    panelCanvas.className = 'shrink-0 rounded-[2px] bg-[#0d0c33]/40'
    this.panelAvatar = new NovaAvatar(panelCanvas)
    const title = element('div', 'min-w-0 flex-1')
    title.innerHTML = '<p class="font-semibold">NOVA</p>'
    this.status = element('p', 'mono')
    this.status.textContent = 'demo guiada'
    title.append(this.status)
    this.buttons = {
      prev: this.icon('‹', 'Paso anterior'),
      pause: this.icon('⏸', 'Pausar'),
      next: this.icon('›', 'Paso siguiente'),
      exit: this.icon('✕', 'Cerrar'),
      voice: this.icon('voz', 'Voz: apagada'),
      tour: element('button', 'btn mt-3 text-[14px]', 'Dame el tour'),
    }
    this.buttons.tour.type = 'button'
    this.buttons.voice.setAttribute('aria-pressed', 'false')
    const controls = element('div', 'flex items-center gap-1')
    controls.append(this.buttons.prev, this.buttons.pause, this.buttons.next, this.buttons.voice, this.buttons.exit)
    head.append(panelCanvas, title, controls)

    this.subtitle = element('div', 'mt-3')
    this.subtitle.id = 'nova-subtitle'
    this.subtitle.setAttribute('aria-live', 'polite')
    this.subtitle.setAttribute('aria-atomic', 'true')

    const chips = element('div', 'mt-3 flex flex-wrap gap-1.5')
    this.chips = chips
    for (const item of QUICK) {
      const chip = element('button', 'nova-chip', item.question)
      chip.type = 'button'
      chip.addEventListener('click', () => void this.ask(item.question))
      chips.append(chip)
    }

    const foot = element(
      'p',
      'mono mt-4 border-t border-rule pt-3',
      'Demo guiada de NOVA. La versión real corre en mi app de escritorio. <a class="underline underline-offset-2 hover:text-bone" rel="noreferrer" href="https://github.com/CarlosIsaelRamirezGonzalez/NOVA">Código</a>',
    )
    this.panel.append(head, this.subtitle, this.buttons.tour, chips, foot)

    dock.append(this.panel, this.toggle)
    this.bind()
    this.toggleAvatar.start()
    this.setMood('idle')
  }

  private icon(label: string, title: string): HTMLButtonElement {
    const button = element('button', 'nova-icon', label)
    button.type = 'button'
    button.title = title
    button.setAttribute('aria-label', title)
    return button
  }

  private bind(): void {
    this.toggle.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()))
    this.buttons.exit.addEventListener('click', () => this.close())
    this.buttons.tour.addEventListener('click', () => this.startTour())
    this.buttons.next.addEventListener('click', () => this.go(this.step + 1))
    this.buttons.prev.addEventListener('click', () => this.go(this.step - 1))
    this.buttons.pause.addEventListener('click', () => this.setPaused(!this.paused))
    this.buttons.voice.addEventListener('click', () => this.setVoice(!this.voice))
    document.querySelector('#tour-start')?.addEventListener('click', () => this.startTour())

    document.addEventListener('keydown', (event) => {
      if (this.panel.hidden) return
      if (event.key === 'Escape') this.close()
      else if (this.step >= 0 && event.key === 'ArrowRight') this.go(this.step + 1)
      else if (this.step >= 0 && event.key === 'ArrowLeft') this.go(this.step - 1)
      else if (this.step >= 0 && event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        this.setPaused(!this.paused)
      }
    })
  }

  /** Ofrece el tour una sola vez, un momento después de cargar. */
  offerOnce(): void {
    if (remembered()) return
    window.setTimeout(() => {
      if (remembered() || !this.panel.hidden) return
      this.offer = element('div', '')
      this.offer.id = 'nova-offer'
      this.offer.setAttribute('role', 'dialog')
      this.offer.setAttribute('aria-label', 'NOVA te ofrece un tour')
      const text = element('p', '', OFFER)
      const row = element('div', 'mt-3 flex gap-2')
      const yes = element('button', 'btn text-[14px]', 'Dame el tour')
      yes.type = 'button'
      const no = element('button', 'btn-quiet text-[14px]', 'Ahora no')
      no.type = 'button'
      yes.addEventListener('click', () => {
        this.dismissOffer()
        this.startTour()
      })
      no.addEventListener('click', () => {
        remember('declined')
        this.dismissOffer()
      })
      row.append(yes, no)
      this.offer.append(text, row)
      this.dock.prepend(this.offer)
      this.setMood('curious')
      window.setTimeout(() => this.setMood('idle'), 2500)
      // Si nadie contesta, la oferta se retira sola; se volverá a ofrecer en otra visita.
      window.setTimeout(() => this.dismissOffer(), 25_000)
    }, 2500)
  }

  private dismissOffer(): void {
    this.offer?.remove()
    this.offer = null
  }

  // -------------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------------

  private open(): void {
    this.dismissOffer()
    this.panel.hidden = false
    this.toggle.setAttribute('aria-expanded', 'true')
    this.toggle.setAttribute('aria-label', 'Cerrar a NOVA')
    this.panelAvatar.start()
    this.toggleAvatar.setPaused(true)
    if (this.step < 0) {
      this.say('Hola. Puedo darte el tour del sitio o contestar las preguntas de abajo.', 'happy')
      this.updateControls()
    }
    this.buttons.exit.focus()
  }

  private close(): void {
    this.stopTour()
    this.panel.hidden = true
    this.toggle.setAttribute('aria-expanded', 'false')
    this.toggle.setAttribute('aria-label', 'Abrir a NOVA')
    this.panelAvatar.stop()
    this.toggleAvatar.setPaused(false)
    this.toggle.focus()
  }

  private setMood(mood: Mood): void {
    this.toggleAvatar.setMood(mood)
    this.panelAvatar.setMood(mood)
  }

  private setLevel(level: number): void {
    this.toggleAvatar.setLevel(level)
    this.panelAvatar.setLevel(level)
  }

  private updateControls(): void {
    const inTour = this.step >= 0
    for (const key of ['prev', 'pause', 'next'] as const) this.buttons[key].hidden = !inTour
    this.buttons.tour.hidden = inTour
    // Durante el tour el panel se encoge: sin preguntas rápidas, tapa menos página.
    if (this.chips) this.chips.hidden = inTour
    this.buttons.prev.disabled = this.step <= 0
    this.buttons.next.disabled = this.step >= TOUR.length - 1
    this.buttons.pause.textContent = this.paused ? '▶' : '⏸'
    this.buttons.pause.title = this.paused ? 'Continuar' : 'Pausar'
    this.buttons.pause.setAttribute('aria-label', this.buttons.pause.title)
    this.status.textContent = inTour ? `paso ${this.step + 1} de ${TOUR.length}` : 'demo guiada'
  }

  // -------------------------------------------------------------------------
  // Hablar: subtítulos y voz opcional
  // -------------------------------------------------------------------------

  /**
   * Escribe un subtítulo letra por letra y, si la voz está encendida, lo dice.
   *
   * @returns Cuando termina de escribirse y de sonar.
   */
  private async say(html: string, mood: Mood, audioId?: string): Promise<void> {
    const token = ++this.typing
    this.setMood(mood === 'idle' ? 'speaking' : mood)
    const plain = html.replace(/<[^>]+>/g, '')
    const spoken = this.voice ? this.speak(plain, audioId) : Promise.resolve()

    if (reducedMotion()) {
      this.subtitle.innerHTML = html
    } else {
      // Se revela por caracteres sobre el HTML final, para conservar las negritas.
      const total = plain.length
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          if (token !== this.typing) return resolve()
          const shown = Math.min(total, Math.floor(((performance.now() - start) / 1000) * SUBTITLE_CPS))
          this.subtitle.innerHTML = clipHtml(html, shown)
          this.setLevel(0.45 + 0.35 * Math.abs(Math.sin(performance.now() / 90)))
          if (shown < total && !this.paused) requestAnimationFrame(tick)
          else if (shown < total) {
            const wait = (): void => {
              if (this.paused && token === this.typing) setTimeout(wait, 100)
              else tick()
            }
            setTimeout(wait, 100)
          } else resolve()
        }
        tick()
      })
    }
    await spoken
    if (token === this.typing) {
      this.setLevel(0)
      this.setMood(mood === 'speaking' || mood === 'curious' ? 'idle' : mood)
    }
  }

  /** Dice un texto con el audio grabado si existe, o con la síntesis del navegador. */
  private async speak(text: string, audioId?: string): Promise<void> {
    this.stopSpeaking()
    if (audioId && (await this.audioAvailable())) {
      await new Promise<void>((resolve) => {
        this.audio = new Audio(`/audio/nova/${audioId}.mp3`)
        this.audio.addEventListener('ended', () => resolve())
        this.audio.addEventListener('error', () => resolve())
        this.audio.play().catch(() => resolve())
      })
      return
    }
    if (!('speechSynthesis' in window)) return
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-MX'
      utterance.rate = 1.05
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      speechSynthesis.speak(utterance)
    })
  }

  private async audioAvailable(): Promise<boolean> {
    if (this.hasAudio === null) {
      try {
        const response = await fetch(`/audio/nova/${TOUR[0].id}.mp3`, { method: 'HEAD' })
        this.hasAudio = response.ok && (response.headers.get('content-type') ?? '').startsWith('audio')
      } catch {
        this.hasAudio = false
      }
    }
    return this.hasAudio
  }

  private stopSpeaking(): void {
    this.audio?.pause()
    this.audio = null
    if ('speechSynthesis' in window) speechSynthesis.cancel()
  }

  private setVoice(on: boolean): void {
    this.voice = on
    this.buttons.voice.setAttribute('aria-pressed', String(on))
    this.buttons.voice.title = on ? 'Voz: encendida' : 'Voz: apagada'
    this.buttons.voice.setAttribute('aria-label', this.buttons.voice.title)
    if (!on) this.stopSpeaking()
  }

  private async ask(question: string): Promise<void> {
    this.stopTour(false)
    this.setMood('thinking')
    const reply = await this.provider.ask(question)
    await this.say(reply.text, reply.mood)
  }

  // -------------------------------------------------------------------------
  // Tour
  // -------------------------------------------------------------------------

  private startTour(): void {
    remember('done')
    this.dismissOffer()
    if (this.panel.hidden) this.open()
    this.paused = false
    this.go(0)
  }

  private stopTour(resetText = true): void {
    window.clearTimeout(this.advanceTimer)
    this.typing++
    this.stopSpeaking()
    this.step = -1
    this.paused = false
    this.clearFocus()
    lightComponents()
    this.pointer?.setAttribute('hidden', '')
    this.setLevel(0)
    this.setMood('idle')
    if (resetText) this.subtitle.textContent = ''
    this.updateControls()
  }

  private setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      window.clearTimeout(this.advanceTimer)
      this.audio?.pause()
      if ('speechSynthesis' in window) speechSynthesis.pause()
    } else {
      this.audio?.play().catch(() => undefined)
      if ('speechSynthesis' in window) speechSynthesis.resume()
      this.scheduleAdvance()
    }
    this.updateControls()
  }

  private async go(index: number): Promise<void> {
    if (index < 0 || index >= TOUR.length) {
      if (index >= TOUR.length) this.finish()
      return
    }
    window.clearTimeout(this.advanceTimer)
    this.step = index
    const step = TOUR[index]
    this.updateControls()
    this.point(step)
    await this.say(step.text, step.mood, step.id)
    if (this.step === index) this.scheduleAdvance()
  }

  private scheduleAdvance(): void {
    window.clearTimeout(this.advanceTimer)
    if (this.paused || this.step < 0) return
    this.advanceTimer = window.setTimeout(() => void this.go(this.step + 1), READ_PAUSE * 1000)
  }

  private finish(): void {
    this.stopTour(false)
    this.setMood('happy')
  }

  /** Lleva la página al objetivo del paso, lo resalta y lo señala con el cursor de NOVA. */
  private point(step: TourStep): void {
    const target = document.querySelector<HTMLElement>(step.target)
    this.clearFocus()
    lightComponents(step.components ?? [])
    if (!target) return
    // El enjambre arma de inmediato la sección a la que NOVA lleva la página.
    window.dispatchEvent(new Event('swarm:turbo'))
    // En pantallas angostas el panel ocupa la parte baja: el objetivo va arriba para que se vea.
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: window.innerWidth < 640 ? 'start' : 'center' })
    target.setAttribute('data-nova-focus', '')
    this.focused = target
    if (!this.pointer) return
    // El cursor se coloca cuando el scroll termina, para apuntar al lugar correcto en pantalla.
    window.setTimeout(() => {
      if (this.step < 0 || !this.pointer) return
      const anchor = step.components?.length
        ? document.querySelector<HTMLElement>(`[data-component="${step.components[0]}"]`) ?? target
        : target
      const rect = anchor.getBoundingClientRect()
      this.pointer.removeAttribute('hidden')
      this.pointer.style.transform = `translate(${Math.round(rect.left + Math.min(rect.width * 0.5, 160))}px, ${Math.round(rect.top + 10)}px)`
    }, reducedMotion() ? 50 : 650)
  }

  private clearFocus(): void {
    this.focused?.removeAttribute('data-nova-focus')
    this.focused = null
  }
}

/**
 * Recorta un HTML sencillo (texto y `<b>`) a cierta cantidad de caracteres visibles.
 */
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
  // Cierra una negrita abierta a medias.
  const opened = (out.match(/<b>/g) ?? []).length
  const closed = (out.match(/<\/b>/g) ?? []).length
  return opened > closed ? `${out}</b>` : out
}

/** Arma el widget de NOVA y, si hace falta, ofrece el tour. */
export function mountNova(): void {
  const dock = document.querySelector<HTMLElement>('#nova-dock')
  if (!dock) return
  const widget = new NovaWidget(dock)
  widget.offerOnce()

  // NOVA en el caso de estudio: el mismo renderizador, en calma, y en pausa cuando no se ve.
  const hero = document.querySelector<HTMLCanvasElement>('#nova-hero')
  if (hero) {
    const avatar = new NovaAvatar(hero)
    avatar.setMood('idle')
    avatar.start()
    new IntersectionObserver((entries) => avatar.setPaused(!entries[0].isIntersecting)).observe(hero)
  }
}
