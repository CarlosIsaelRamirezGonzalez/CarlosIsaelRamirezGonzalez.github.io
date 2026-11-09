/**
 * El recuadro de NOVA en la esquina: un botón con ella flotando que se abre en un panel con
 * saludo, preguntas rápidas y el botón del tour. Cuando aceptan el tour, NOVA sale del recuadro
 * (`guide.ts`) y recorre la página; al terminar, vuelve.
 *
 * - Se ofrece una sola vez; la respuesta se recuerda en `localStorage` (dentro de try/catch).
 * - Nada suena sin un clic de la persona.
 */
import { NovaAvatar } from './avatar'
import { Guide } from './guide'
import { ScriptedProvider, type NovaProvider } from './provider'
import { Speech } from './speech'
import { GREETING, OFFER, QUICK } from './tour'

const STORAGE_KEY = 'nova.offer'

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
  private readonly provider: NovaProvider = new ScriptedProvider()
  private readonly toggle: HTMLButtonElement
  private readonly toggleAvatar: NovaAvatar
  private readonly panel: HTMLElement
  private readonly panelAvatar: NovaAvatar
  private readonly panelSubtitle: HTMLElement
  private readonly speech: Speech
  private readonly guide: Guide
  private offer: HTMLElement | null = null
  private greeted = false

  constructor(dock: HTMLElement) {
    this.dock = dock

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
    this.panel.setAttribute('aria-label', 'NOVA')
    const head = element('div', 'flex items-start gap-3')
    const panelCanvas = document.createElement('canvas')
    panelCanvas.style.width = '96px'
    panelCanvas.style.height = '96px'
    panelCanvas.className = 'shrink-0 rounded-[2px] bg-[#0d0c33]/40'
    this.panelAvatar = new NovaAvatar(panelCanvas)
    const title = element('div', 'min-w-0 flex-1', '<p class="font-semibold">NOVA</p><p class="mono">demo guiada</p>')
    const close = element('button', 'nova-icon', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', 'Cerrar')
    close.addEventListener('click', () => this.close())
    head.append(panelCanvas, title, close)

    this.panelSubtitle = element('div', 'nova-subtitle mt-3')
    this.panelSubtitle.setAttribute('aria-live', 'polite')
    this.panelSubtitle.setAttribute('aria-atomic', 'true')
    this.speech = new Speech(this.panelSubtitle)
    this.speech.attach(this.toggleAvatar)
    this.speech.attach(this.panelAvatar)

    const tourButton = element('button', 'btn mt-3 text-[14px]', 'Dame el tour')
    tourButton.type = 'button'
    tourButton.addEventListener('click', () => this.startTour())

    const chips = element('div', 'mt-3 flex flex-wrap gap-1.5')
    for (const [index, item] of QUICK.entries()) {
      const chip = element('button', 'nova-chip', item.question)
      chip.type = 'button'
      chip.addEventListener('click', () => void this.ask(item.question, `rapida-${index + 1}`))
      chips.append(chip)
    }
    const foot = element(
      'p',
      'mono mt-4 border-t border-rule pt-3',
      'Demo guiada de NOVA. La versión real corre en mi app de escritorio. <a class="underline underline-offset-2 hover:text-bone" rel="noreferrer" href="https://github.com/CarlosIsaelRamirezGonzalez/NOVA">Código</a>',
    )
    this.panel.append(head, this.panelSubtitle, tourButton, chips, foot)
    dock.append(this.panel, this.toggle)

    // La guía habla con la misma voz; sus subtítulos van en su burbuja.
    this.guide = new Guide(this.speech, () => {
      const rect = this.toggle.getBoundingClientRect()
      const size = window.innerWidth < 760 ? 150 : 210
      return { x: rect.left + rect.width / 2 - size / 2, y: rect.top + rect.height / 2 - size / 2 }
    })

    this.toggle.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()))
    document.querySelector('#tour-start')?.addEventListener('click', () => this.startTour())
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden) this.close()
    })
    this.toggleAvatar.start()
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
      yes.addEventListener('click', () => this.startTour())
      no.addEventListener('click', () => {
        remember('declined')
        this.dismissOffer()
      })
      row.append(yes, no)
      this.offer.append(text, row)
      this.dock.prepend(this.offer)
      this.toggleAvatar.setMood('curious')
      window.setTimeout(() => this.toggleAvatar.setMood('idle'), 2500)
      // Si nadie contesta, la oferta se retira sola; se volverá a ofrecer en otra visita.
      window.setTimeout(() => this.dismissOffer(), 25_000)
    }, 2500)
  }

  private dismissOffer(): void {
    this.offer?.remove()
    this.offer = null
  }

  private open(): void {
    this.dismissOffer()
    this.panel.hidden = false
    this.toggle.setAttribute('aria-expanded', 'true')
    this.toggle.setAttribute('aria-label', 'Cerrar a NOVA')
    this.panelAvatar.start()
    this.toggleAvatar.setPaused(true)
    if (!this.greeted) {
      this.greeted = true
      void this.speech.say(GREETING, { mood: 'happy', audioId: 'hola' })
    }
    this.panel.querySelector<HTMLButtonElement>('button')?.focus()
  }

  private close(): void {
    this.speech.stop()
    this.panel.hidden = true
    this.toggle.setAttribute('aria-expanded', 'false')
    this.toggle.setAttribute('aria-label', 'Abrir a NOVA')
    this.panelAvatar.stop()
    this.toggleAvatar.setPaused(false)
    this.toggle.focus()
  }

  private async ask(question: string, audioId: string): Promise<void> {
    this.toggleAvatar.setMood('thinking')
    this.panelAvatar.setMood('thinking')
    // Un clic en la pregunta es la señal para hablar en voz alta.
    this.speech.setVoice(true)
    const reply = await this.provider.ask(question)
    await this.speech.say(reply.text, { mood: reply.mood, audioId })
  }

  /** NOVA sale del recuadro y recorre la página. */
  private startTour(): void {
    remember('done')
    this.dismissOffer()
    this.speech.stop()
    this.panel.hidden = true
    this.toggle.setAttribute('aria-expanded', 'false')
    this.panelAvatar.stop()
    this.dock.hidden = true
    this.toggleAvatar.setPaused(true)
    void this.guide.start(() => {
      this.dock.hidden = false
      this.toggleAvatar.setPaused(false)
      this.toggle.focus()
    })
  }
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
    avatar.start()
    new IntersectionObserver((entries) => avatar.setPaused(!entries[0].isIntersecting)).observe(hero)
  }
}
