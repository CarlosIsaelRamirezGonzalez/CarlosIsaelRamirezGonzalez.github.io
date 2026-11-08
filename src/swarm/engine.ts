/**
 * Motor del enjambre.
 *
 * Hay un solo grupo fijo de agentes. Cada uno tiene una máquina de estados:
 * reposo → viaje (curva) → pausa → trabajo → regreso → reposo. Una tarea solo avanza mientras
 * su cuadrilla está físicamente en ella, así que nada aparece sin un cursor que lo construya.
 *
 * La velocidad del scroll fija un multiplicador de 1× a 2.5×: acelera a los cursores, el tecleo y
 * suma agentes. Al detener el scroll, todo lo que está en pantalla se termina en menos de un segundo.
 */
import { Sound } from './audio'
import { collectTasks, measure } from './blueprint'
import { apply, draw, drawRulers, pose, prepare, textCrew } from './choreography'
import { COLORS, HOTSPOT, NAMES, sprite } from './cursors'
import { Debug } from './debug'
import type { Agent, Point, Task } from './types'

/** Segundos que el enjambre flota antes de empezar a construir. */
const INTRO = 1.4
/** Multiplicador mínimo mientras se arma el hero, para que quede listo en menos de 4 s. */
const HERO_BOOST = 1
/** Opacidad y escala de los agentes en reposo: quedan en segundo plano. */
const IDLE_ALPHA = 0.4
const IDLE_SCALE = 0.8
/** Segundos que tarda en desarmarse algo que quedó fuera de la pantalla por abajo. */
const UNBUILD_TIME = 0.3
/** Parte de la pantalla que pueden ocupar etiquetas y estelas; con los cursores queda debajo del 5 %. */
const OVERLAY_BUDGET = 0.032
/** Área aproximada de una etiqueta con nombre y de una imagen de estela, en px². */
const LABEL_AREA = 3100
const TRAIL_AREA = 14 * 17
/** Imágenes de la estela por cursor cuando el enjambre va a más de 2.5×. */
const TRAIL_LENGTH = 4
/** A partir de este multiplicador se quitan pausas y errores y aparecen las estelas. */
const FAST = 2.2
/** Ancho máximo del contenido, para ubicar los márgenes donde descansan los agentes. */
const CONTENT_WIDTH = 1200

interface Profile {
  pool: number
  base: number
  workers: number
  maxWorkers: number
  heroWorkers: number
  textCrew: number
}

const DESKTOP: Profile = { pool: 20, base: 14, workers: 6, maxWorkers: 12, heroWorkers: 8, textCrew: 4 }
const MOBILE: Profile = { pool: 10, base: 7, workers: 4, maxWorkers: 7, heroWorkers: 7, textCrew: 3 }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const random = (min: number, max: number): number => min + Math.random() * (max - min)

class Swarm {
  private readonly canvas: HTMLCanvasElement
  private readonly hud: HTMLElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly sound = new Sound()
  private readonly profile: Profile
  private readonly tasks: Task[]
  private readonly heroTasks: Task[]
  private readonly agents: Agent[] = []
  private readonly debug: Debug | null
  private width = 0
  private height = 0
  private ratio = 1
  private speed = 1
  private skipped = false
  private finished = false
  private elapsed = 0
  private lastTime = 0
  private lastScroll = window.scrollY
  /** Velocidad del scroll en px/ms, suavizada. */
  private scrollSpeed = 0
  /** Segundos desde el último movimiento del scroll. */
  private still = 0
  /** Multiplicador de velocidad del enjambre, de 1× a 2.5×. */
  private boost = 1
  private turboUntil = 0
  private rulers = 0
  private mouse: Point | null = null
  private hudTimer = 0
  private wide = false
  private queued = 0
  /** Si hubo scroll y aún falta terminar lo que quedó a la vista. */
  private settling = false

  constructor(canvas: HTMLCanvasElement, hud: HTMLElement) {
    this.canvas = canvas
    this.hud = hud
    this.ctx = canvas.getContext('2d')!
    const mobile = window.matchMedia('(max-width: 767px)').matches
    this.profile = mobile ? MOBILE : DESKTOP
    const { tasks, orphans } = collectTasks(mobile)
    this.tasks = tasks
    const hero = document.querySelector('#inicio')
    this.heroTasks = this.tasks.filter((task) => hero?.contains(task.el))
    this.debug = new URLSearchParams(location.search).has('debug') ? new Debug(orphans) : null
    this.resize()
    this.spawn()
    for (const task of this.tasks) apply(task)
    this.bindEvents()
  }

  /** Crea el grupo fijo de agentes, todos fuera de la pantalla: entran volando. */
  private spawn(): void {
    for (let id = 0; id < this.profile.pool; id++) {
      this.agents.push({
        id,
        name: NAMES[id % NAMES.length],
        color: COLORS[id % COLORS.length],
        state: id < this.profile.base ? 'idle' : 'reserve',
        x: id % 2 ? -40 : this.width + 40,
        y: random(this.height * 0.15, this.height * 0.85),
        vx: 0,
        vy: 0,
        tool: 'arrow',
        pressed: false,
        task: null,
        role: 0,
        path: null,
        wait: 0,
        pace: random(0.85, 1.2),
        home: { x: 0, y: 0 },
        alpha: IDLE_ALPHA,
        scale: IDLE_SCALE,
        phase: Math.random() * Math.PI * 2,
        trail: [],
      })
    }
    this.placeHomes()
  }

  /** Lugares de descanso: en los márgenes a los lados del contenido, o pegados al borde. */
  private placeHomes(): void {
    const gutter = (this.width - CONTENT_WIDTH) / 2
    this.wide = gutter >= 56
    const rows = Math.ceil(this.agents.length / 2)
    this.agents.forEach((agent, index) => {
      const left = index % 2 === 0
      const row = Math.floor(index / 2)
      const y = this.height * (0.14 + (0.72 * (row + 0.5)) / rows) + random(-12, 12)
      const x = this.wide ? (left ? gutter / 2 : this.width - gutter / 2) + random(-14, 14) : left ? 6 : this.width - 14
      agent.home = { x, y }
    })
  }

  // -------------------------------------------------------------------------
  // Eventos y controles
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    let resizeTimer = 0
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => this.resize(true), 150)
    })
    window.addEventListener('pointermove', (event) => {
      this.mouse = { x: event.clientX, y: event.clientY }
    })
    document.addEventListener('pointerleave', () => {
      this.mouse = null
    })
    window.addEventListener('keydown', (event) => {
      // Quien navega con teclado ve la página completa de inmediato.
      if (event.key === 'Tab') this.skip()
    })
    document.addEventListener('visibilitychange', () => {
      this.lastTime = performance.now()
    })
    // Saltar por el menú activa el modo turbo.
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', () => {
        this.turboUntil = performance.now() + 1400
        this.debug?.log(`turbo: salto a ${link.getAttribute('href')}`)
      })
    })

    this.hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        this.speed = Number(button.dataset.speed)
        this.hud.querySelectorAll('[data-speed]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)))
      })
    })
    const soundButton = this.hud.querySelector<HTMLButtonElement>('[data-sound]')!
    soundButton.addEventListener('click', () => {
      const on = this.sound.toggle()
      soundButton.setAttribute('aria-pressed', String(on))
      soundButton.textContent = on ? 'Sonido: sí' : 'Sonido: no'
    })
    this.hud.querySelector('[data-skip]')!.addEventListener('click', () => this.skip())
  }

  private resize(remeasure = false): void {
    this.ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = Math.round(this.width * this.ratio)
    this.canvas.height = Math.round(this.height * this.ratio)
    if (remeasure) {
      for (const task of this.tasks) task.box = measure(task.el)
      this.placeHomes()
    }
  }

  /** Muestra la página completa. Los agentes siguen ahí, en reposo. */
  private skip(): void {
    if (this.skipped) return
    this.skipped = true
    for (const task of this.tasks) {
      this.release(task)
      task.progress = 1
      apply(task)
    }
    this.hud.querySelector('[data-skip]')?.setAttribute('disabled', '')
    this.debug?.log('saltar animación: todo construido')
  }

  // -------------------------------------------------------------------------
  // Ciclo principal
  // -------------------------------------------------------------------------

  start(): void {
    this.lastTime = performance.now()
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000)
      this.lastTime = now
      this.debug?.tick(now)
      const start = performance.now()
      this.update(dt, now)
      this.render()
      this.debug?.work(start)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  /** Tareas que se ven ahora y aún no están terminadas. */
  private pendingInView(scrollY: number): number {
    let pending = 0
    for (const task of this.tasks) {
      if (task.progress >= 1) continue
      if (task.box.y < scrollY + this.height && task.box.y + task.box.h > scrollY) pending++
    }
    return pending
  }

  private update(dt: number, now: number): void {
    const wasIntro = this.elapsed <= INTRO
    this.elapsed += dt
    // Al terminar la intro, cada agente vuela a su lugar sin cruzar el hero en reposo.
    if (wasIntro && this.elapsed > INTRO) {
      for (const agent of this.agents) if (agent.state === 'idle') this.travel(agent, false)
    }

    const scrollY = window.scrollY
    const moved = Math.abs(scrollY - this.lastScroll)
    // Los agentes se movieron con el scroll del cuadro anterior: la verificación usa ese valor.
    const movedAt = this.lastScroll
    this.lastScroll = scrollY
    this.still = moved > 0.5 ? 0 : this.still + dt
    if (moved > 0.5) this.settling = true
    const instant = moved / Math.max(dt * 1000, 1)
    // Inercia: sube rápido y baja despacio.
    this.scrollSpeed += (instant - this.scrollSpeed) * (1 - Math.exp(-dt * (instant > this.scrollSpeed ? 10 : 2.5)))

    // Multiplicador: por la velocidad del scroll, el turbo del menú o para terminar lo que se ve.
    let target = 1 + 1.5 * clamp((this.scrollSpeed - 0.3) / 2.2, 0, 1)
    if (now < this.turboUntil) target = 2.5
    // Al detener el scroll, lo que se ve se termina rápido: nunca queda texto a medias.
    let catchUp = false
    if (this.settling && this.still > 0.08) {
      catchUp = this.pendingInView(scrollY) > 0 && !this.skipped
      if (catchUp) target = 2.5
      else this.settling = false
    }
    if (this.heroTasks.some((task) => task.progress < 1)) target = Math.max(target, HERO_BOOST)
    this.boost += (target - this.boost) * (1 - Math.exp(-dt * (target > this.boost ? 12 : 2)))

    const share = (this.boost - 1) / 1.5
    const reserves = this.profile.pool - this.profile.base
    this.balanceReserve(this.profile.base + Math.round(reserves * share))

    const rate = this.speed * this.boost
    if (this.elapsed > INTRO && !this.skipped) this.schedule(dt, rate, scrollY, movedAt, catchUp ? 1 : share)
    this.moveAgents(dt, rate, scrollY)

    if (!this.finished && this.tasks.every((task) => task.progress >= 1)) {
      this.finished = true
      this.sound.chord()
      this.debug?.log('página completa')
    }
  }

  /** Activa agentes de reserva o manda de vuelta a los que sobran; siempre entran y salen volando. */
  private balanceReserve(wanted: number): void {
    let active = this.agents.filter((agent) => agent.state !== 'reserve').length
    for (const agent of this.agents) {
      if (active < wanted && agent.state === 'reserve') {
        agent.state = 'idle'
        active++
      } else if (active > wanted && agent.state === 'idle' && agent.id >= this.profile.base) {
        agent.state = 'reserve'
        active--
      }
    }
  }

  // -------------------------------------------------------------------------
  // Tareas
  // -------------------------------------------------------------------------

  private schedule(dt: number, rate: number, scrollY: number, movedAt: number, share: number): void {
    // Se desbloquea al acercarse a la pantalla y se desarma ya fuera de ella, por abajo.
    const buildLine = scrollY + this.height + 60
    const unbuildLine = scrollY + this.height + 220
    const waiting: Task[] = []
    // Lo que quedó arriba se completa por partes, para no trabar un cuadro.
    let instantBudget = 40

    for (const task of this.tasks) {
      const before = task.progress
      const parentReady = !task.parent || task.parent.progress >= 1
      const masterReady = !task.master || task.master.progress >= 1
      const below = task.box.y > unbuildLine && task.box.y > this.height
      const above = task.box.y + task.box.h < scrollY - 40

      if (above && task.progress < 1 && parentReady && masterReady) {
        // Quedó arriba, fuera de la pantalla: se completa sin animar para no acumular cola.
        if (instantBudget-- <= 0) continue
        this.release(task)
        task.progress = 1
      } else if (below || !parentReady) {
        this.release(task)
        if (task.children.every((child) => child.progress <= 0)) {
          task.progress = Math.max(0, task.progress - dt / UNBUILD_TIME)
          if (task.progress === 0) task.script = null
        }
      } else if (task.progress < 1 && task.box.y < buildLine && masterReady) {
        if (task.running) {
          this.advance(task, dt, rate, movedAt)
        } else if (task.crew.length === 0) {
          waiting.push(task)
        } else {
          this.startIfReady(task)
        }
      }

      if (task.progress !== before) apply(task)
    }
    this.queued = waiting.length
    this.assign(waiting, scrollY, share)
  }

  /**
   * Avanza una tarea; solo se llama cuando toda su cuadrilla está en su lugar.
   *
   * @param movedAt Scroll con el que se ubicaron los agentes, para comprobar que están ahí.
   */
  private advance(task: Task, dt: number, rate: number, movedAt: number): void {
    if (this.debug) {
      for (const agent of task.crew) {
        const target = pose(task, agent.role)
        const distance = Math.hypot(agent.x - (target.x - window.scrollX), agent.y - (target.y - movedAt))
        if (agent.state !== 'work' || agent.task !== task || distance > 6) {
          this.debug.violation(`#${task.id} avanzó sin ${agent.name} en su lugar (${Math.round(distance)} px)`)
        }
      }
    }
    const before = task.progress
    task.progress = Math.min(1, task.progress + (dt * rate) / task.duration)
    this.cue(task, before)
    if (task.progress >= 1) {
      this.debug?.log(`#${task.id} ${task.kind} lista · ${task.crew.map((agent) => agent.name).join(', ')}`)
      this.release(task)
    }
  }

  /** Reparte las tareas en espera, de arriba hacia abajo, entre los agentes libres más cercanos. */
  private assign(waiting: Task[], scrollY: number, share: number): void {
    const heroDone = this.heroTasks.every((task) => task.progress >= 1)
    const { workers, maxWorkers, heroWorkers } = this.profile
    // Al terminar lo que quedó a la vista (share = 1) trabaja todo el grupo.
    const limit =
      share >= 1 ? this.profile.pool : heroDone ? Math.round(workers + (maxWorkers - workers) * share) : Math.max(heroWorkers, maxWorkers * share)
    const calm = this.boost < FAST
    let busy = this.agents.filter((agent) => agent.task).length

    for (const task of waiting) {
      if (busy >= limit && task.kind !== 'network' && task.kind !== 'converge') break
      // Libres: en reposo o regresando a su lugar (desde ahí mismo cambian de rumbo).
      const free = this.agents.filter((agent) => !agent.task && (agent.state === 'idle' || agent.state === 'travel'))
      if (free.length === 0) break

      let size = 1
      if (task.kind === 'network' || task.kind === 'converge') {
        size = Math.min(task.crewSize, free.length)
        if (size < 3) continue
      } else {
        size = Math.min(textCrew(task, this.profile.textCrew), free.length, Math.max(1, limit - busy))
      }

      size = prepare(task, size, calm)
      const anchor = pose(task, 0)
      const distance = (agent: Agent): number => Math.hypot(agent.x - anchor.x, agent.y - (anchor.y - scrollY))
      free.sort((a, b) => distance(a) - distance(b))
      const crew = free.slice(0, size)
      if (task.kind === 'converge') task.crewSize = crew.length
      task.crew = crew
      crew.forEach((agent, role) => {
        agent.task = task
        agent.role = role
        this.travel(agent, calm && size === 1 && Math.random() < 0.12)
      })
      busy += crew.length
      this.debug?.log(`#${task.id} ${task.kind} → ${crew.map((agent) => `${agent.name}(${agent.id})`).join(', ')}`)
    }
  }

  /** Si toda la cuadrilla ya está en su lugar, la tarea empieza. */
  private startIfReady(task: Task): void {
    if (task.running || !task.crew.every((agent) => agent.state === 'ready')) return
    task.running = true
    for (const agent of task.crew) agent.state = 'work'
  }

  /** Libera a la cuadrilla de una tarea: cada agente regresa volando a su lugar de descanso. */
  private release(task: Task): void {
    for (const agent of task.crew) {
      if (agent.task !== task) continue
      agent.task = null
      this.travel(agent, false)
    }
    task.crew = []
    task.running = false
  }

  /**
   * Inicia un viaje por una curva hacia la tarea del agente (o hacia su lugar si no tiene).
   *
   * @param agent Agente que viaja.
   * @param mistake Si primero se equivoca de lugar y luego corrige.
   */
  private travel(agent: Agent, mistake: boolean): void {
    const target = this.targetOf(agent, window.scrollY)
    const distance = Math.hypot(target.x - agent.x, target.y - agent.y)
    const side = Math.random() < 0.5 ? -1 : 1
    const bend = distance * random(0.12, 0.28) * side
    const nx = distance ? -(target.y - agent.y) / distance : 0
    const ny = distance ? (target.x - agent.x) / distance : 0
    agent.state = 'travel'
    agent.path = {
      from: { x: agent.x, y: agent.y },
      bend: { x: nx * bend, y: ny * bend },
      elapsed: 0,
      duration: clamp(distance / (400 * agent.pace), 0.28, 0.85),
      miss: mistake ? { x: random(-28, 28), y: random(14, 26) * side } : null,
    }
  }

  /** A dónde va un agente, en coordenadas de pantalla. */
  private targetOf(agent: Agent, scrollY: number): Point {
    if (agent.task) {
      const target = pose(agent.task, agent.role)
      return { x: target.x - window.scrollX, y: target.y - scrollY }
    }
    if (agent.state === 'reserve') return { x: agent.home.x < this.width / 2 ? -40 : this.width + 40, y: agent.home.y }
    if (this.elapsed < INTRO) {
      // Intro: el enjambre flota alrededor del centro antes de repartirse.
      const angle = agent.phase + this.elapsed * 0.8
      return {
        x: this.width / 2 + Math.cos(angle) * (90 + (agent.id % 5) * 34),
        y: this.height * 0.5 + Math.sin(angle) * (60 + (agent.id % 4) * 22),
      }
    }
    return agent.home
  }

  /** Sonidos ligados al avance. */
  private cue(task: Task, before: number): void {
    if (!this.sound.enabled) return
    const pan = ((task.box.x + task.box.w / 2) / this.width) * 2 - 1
    const typed = task.script?.roles.some((role) => role.shown > 0 && role.shown < role.glyphs.length)
    if (typed) this.sound.key(pan)
    const dropped = task.dragTime / task.duration
    if (task.kind !== 'text' && before < dropped && task.progress >= dropped) {
      this.sound.note(1 - Math.min(1, (task.box.w * task.box.h) / 300_000), pan)
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento de los agentes
  // -------------------------------------------------------------------------

  private moveAgents(dt: number, rate: number, scrollY: number): void {
    const zones = this.builtZones(scrollY)
    const calm = this.boost < FAST
    for (const agent of this.agents) {
      const working = agent.task !== null
      agent.alpha += ((working ? 1 : IDLE_ALPHA) - agent.alpha) * (1 - Math.exp(-dt * 6))
      agent.scale += ((working ? 1 : IDLE_SCALE) - agent.scale) * (1 - Math.exp(-dt * 6))

      switch (agent.state) {
        case 'travel':
          this.moveAlongPath(agent, dt, rate, scrollY, calm)
          break
        case 'hover':
        case 'ready':
        case 'work': {
          const target = this.targetOf(agent, scrollY)
          if (agent.state === 'work') {
            // Trabajando, el agente es la herramienta: está exactamente donde ocurre la acción.
            agent.x = target.x
            agent.y = target.y
            if (agent.task) {
              const current = pose(agent.task, agent.role)
              agent.tool = current.tool
              agent.pressed = current.pressed
            }
          } else {
            const follow = 1 - Math.exp(-dt * 18)
            agent.x += (target.x - agent.x) * follow
            agent.y += (target.y - agent.y) * follow
          }
          if (agent.state === 'hover') {
            agent.wait -= dt
            if (agent.wait <= 0) {
              agent.state = 'ready'
              agent.pressed = true
              if (this.sound.enabled) this.sound.click((agent.x / this.width) * 2 - 1)
            }
          }
          break
        }
        default:
          this.drift(agent, dt, zones)
      }

      // Estela: últimas posiciones de los cursores ocupados.
      agent.trail.unshift({ x: agent.x, y: agent.y })
      if (agent.trail.length > TRAIL_LENGTH * 2 + 1) agent.trail.pop()
    }
  }

  /** Sigue la curva hacia su destino, con un poco de temblor; al llegar, hace una pausa. */
  private moveAlongPath(agent: Agent, dt: number, rate: number, scrollY: number, calm: boolean): void {
    const path = agent.path
    if (!path) {
      agent.state = agent.task ? 'hover' : 'idle'
      return
    }
    // Con prisa, los viajes se aceleran igual que el resto; en calma, un poco menos.
    path.elapsed += dt * (calm ? Math.sqrt(rate) : rate)
    const t = clamp(path.elapsed / path.duration, 0, 1)
    const target = this.targetOf(agent, scrollY)
    const end = path.miss ? { x: target.x + path.miss.x, y: target.y + path.miss.y } : target
    const k = ease(t)
    const cx = (path.from.x + end.x) / 2 + path.bend.x
    const cy = (path.from.y + end.y) / 2 + path.bend.y
    const shake = calm ? Math.sin(agent.phase + path.elapsed * 23) * 1.2 * (1 - t) : 0
    agent.x = (1 - k) ** 2 * path.from.x + 2 * (1 - k) * k * cx + k * k * end.x + shake
    agent.y = (1 - k) ** 2 * path.from.y + 2 * (1 - k) * k * cy + k * k * end.y + shake * 0.6
    agent.tool = 'arrow'
    agent.pressed = false
    if (t < 1) return

    if (path.miss) {
      // Se equivocó de lugar: pequeña corrección.
      agent.path = { from: { x: agent.x, y: agent.y }, bend: { x: 0, y: 0 }, elapsed: 0, duration: 0.2, miss: null }
      return
    }
    agent.path = null
    agent.vx = agent.vy = 0
    if (agent.task && calm) {
      // Pausa humana antes del clic.
      agent.state = 'hover'
      agent.wait = random(0.08, 0.2)
    } else if (agent.task) {
      // Con prisa no hay pausa: clic al llegar.
      agent.state = 'ready'
      agent.pressed = true
      this.startIfReady(agent.task)
    } else {
      agent.state = 'idle'
    }
  }

  /** Cajas ya construidas y visibles, en pantalla: los agentes en reposo no se meten ahí. */
  private builtZones(scrollY: number): DOMRect[] {
    const zones: DOMRect[] = []
    for (const task of this.tasks) {
      if (task.progress < 0.5 || task.kind === 'line') continue
      const top = task.box.y - scrollY
      if (top > this.height || top + task.box.h < 0) continue
      zones.push(new DOMRect(task.box.x - window.scrollX - 10, top - 10, task.box.w + 20, task.box.h + 20))
    }
    return zones
  }

  /** Reposo: flota cerca de su lugar, se separa de los demás y evita el texto y el mouse. */
  private drift(agent: Agent, dt: number, zones: DOMRect[]): void {
    const rest = this.targetOf(agent, window.scrollY)
    const sway = agent.state === 'reserve' ? 0 : 1
    // Pegados al borde, casi no se mueven a los lados para no invadir el texto.
    const tx = rest.x + Math.cos(agent.phase + this.elapsed * 0.7) * (this.wide ? 14 : 2) * sway
    const ty = rest.y + Math.sin(agent.phase * 1.3 + this.elapsed * 0.5) * 22 * sway

    let ax = (tx - agent.x) * 7 - agent.vx * 4
    let ay = (ty - agent.y) * 7 - agent.vy * 4

    for (const other of this.agents) {
      if (other === agent || other.task) continue
      const dx = agent.x - other.x
      const dy = agent.y - other.y
      const distance = dx * dx + dy * dy
      if (distance < 900 && distance > 0.01) {
        ax += (dx / distance) * 2400
        ay += (dy / distance) * 2400
      }
    }

    // Zonas de exclusión: si está encima de algo construido, sale por el borde más cercano.
    for (const zone of zones) {
      if (agent.x < zone.left || agent.x > zone.right || agent.y < zone.top || agent.y > zone.bottom) continue
      const exits = [agent.x - zone.left, zone.right - agent.x, agent.y - zone.top, zone.bottom - agent.y]
      const nearest = exits.indexOf(Math.min(...exits))
      const push = 2600
      if (nearest === 0) ax -= push
      else if (nearest === 1) ax += push
      else if (nearest === 2) ay -= push
      else ay += push
    }

    if (this.mouse) {
      const dx = agent.x - this.mouse.x
      const dy = agent.y - this.mouse.y
      const distance = Math.hypot(dx, dy)
      if (distance < 90 && distance > 0.01) {
        const push = ((90 - distance) / 90) * 3000
        ax += (dx / distance) * push
        ay += (dy / distance) * push
      }
    }

    agent.vx += ax * dt
    agent.vy += ay * dt
    const speed = Math.hypot(agent.vx, agent.vy)
    const max = 400 * agent.pace
    if (speed > max) {
      agent.vx *= max / speed
      agent.vy *= max / speed
    }
    agent.x += agent.vx * dt
    agent.y += agent.vy * dt
    agent.tool = 'arrow'
    agent.pressed = false
  }

  // -------------------------------------------------------------------------
  // Dibujo
  // -------------------------------------------------------------------------

  private render(): void {
    const { ctx, ratio } = this
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)

    let guides = false
    ctx.save()
    ctx.translate(-scrollX, -scrollY)
    for (const task of this.tasks) {
      if (task.progress <= 0 || task.progress >= 1) continue
      if (task.box.y > scrollY + this.height || task.box.y + task.box.h < scrollY) continue
      if (task.guide) guides = true
      draw(ctx, task, this.height, scrollY)
    }
    ctx.restore()

    this.rulers += ((guides ? 1 : 0) - this.rulers) * 0.12
    drawRulers(ctx, this.width, this.height, scrollY, this.rulers)

    const onScreen = (agent: Agent): boolean =>
      agent.x > -30 && agent.x < this.width + 30 && agent.y > -30 && agent.y < this.height + 30
    let covered = 0
    let budget = OVERLAY_BUDGET * this.width * this.height

    // Estelas de los cursores ocupados cuando el enjambre va a más de 2.5×.
    if (this.boost > FAST) {
      for (const agent of this.agents) {
        if (!agent.task || !onScreen(agent)) continue
        for (let i = 1; i <= TRAIL_LENGTH; i++) {
          const point = agent.trail[i * 2]
          if (!point || budget < TRAIL_AREA) continue
          const image = sprite('arrow', agent.color, null, ratio)
          ctx.globalAlpha = 0.32 * (1 - i / (TRAIL_LENGTH + 1))
          ctx.drawImage(image, point.x - HOTSPOT, point.y - HOTSPOT, image.width / ratio, image.height / ratio)
          budget -= TRAIL_AREA
          covered += TRAIL_AREA
        }
      }
    }

    for (const agent of this.agents) {
      if (!onScreen(agent)) continue
      const hovered = this.mouse !== null && Math.hypot(this.mouse.x - agent.x, this.mouse.y - agent.y) < 18
      // Etiqueta: solo quien trabaja (en cuadrillas, el principal) o el que tiene el mouse encima.
      const wantsLabel = (agent.task !== null && agent.role === 0) || hovered
      const label = wantsLabel && budget >= LABEL_AREA ? agent.name : null
      if (label) budget -= LABEL_AREA
      const image = sprite(agent.tool, agent.color, label, ratio)
      const w = (image.width / ratio) * agent.scale
      const h = (image.height / ratio) * agent.scale
      const press = agent.pressed ? 1 : 0
      ctx.globalAlpha = agent.alpha
      ctx.drawImage(image, agent.x - HOTSPOT * agent.scale + press, agent.y - HOTSPOT * agent.scale + press, w, h)
      covered += label ? (w - 12) * 28 : 14 * 17 * agent.scale * agent.scale
    }
    ctx.globalAlpha = 1

    if (this.debug) {
      this.debug.frame(ctx, this.tasks, this.agents, scrollY, {
        coverage: covered / (this.width * this.height),
        zones: this.builtZones(scrollY),
        boost: this.boost,
        queued: this.queued,
        pendingInView: this.pendingInView(scrollY),
        still: this.still,
      })
    }
    this.updateHud()
  }

  private updateHud(): void {
    const now = performance.now()
    if (now - this.hudTimer < 200) return
    this.hudTimer = now
    const built = this.tasks.filter((task) => task.progress >= 1).length
    const agents = this.agents.filter((agent) => agent.state !== 'reserve').length
    this.hud.querySelector('[data-count]')!.textContent = `agentes: ${agents} · capas: ${built}/${this.tasks.length}`
  }
}

/**
 * Arranca el enjambre cuando las fuentes ya cargaron, para medir la página con su tamaño final.
 */
export async function startSwarm(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#swarm-canvas')
  const hud = document.querySelector<HTMLElement>('#swarm-hud')
  if (!canvas || !hud) throw new Error('Falta el lienzo o el panel del enjambre')

  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))])
  const swarm = new Swarm(canvas, hud)
  document.documentElement.classList.remove('swarm-boot')
  canvas.hidden = false
  hud.hidden = false
  swarm.start()
}
