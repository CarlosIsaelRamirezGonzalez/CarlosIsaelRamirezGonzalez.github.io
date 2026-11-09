/**
 * Motor del enjambre.
 *
 * Un grupo fijo y pequeño de agentes construye la página mientras se hace scroll. Cada agente
 * tiene una máquina de estados (fuera → viaje → pausa → trabajo → salida) y una tarea solo avanza
 * mientras su cuadrilla está físicamente en ella: nada aparece de la nada.
 *
 * Reglas:
 * - Cada sección se construye una sola vez al asomar en pantalla y queda estática.
 * - Nunca hay más de `workers` cursores en pantalla; los demás están fuera y son invisibles.
 * - Ningún bloque tarda más de un segundo. Lo que lleva más de `MAX_WAIT` s a la vista sin su
 *   cursor, o quedó arriba con scroll rápido, se completa de golpe para no esconder contenido.
 * - Si la tasa de cuadros baja, el enjambre se reduce solo.
 */
import { Sound } from './audio'
import { collectTasks, measure } from './blueprint'
import { apply, draw, pose, prepare, textCrew } from './choreography'
import { COLORS, HOTSPOT, NAMES, sprite } from './cursors'
import { Debug } from './debug'
import type { Agent, Point, Task } from './types'

/** Segundos que puede esperar algo visible antes de completarse sin cursor. */
const MAX_WAIT = 2.0
/** A partir de este multiplicador aparecen las estelas y se quitan las pausas. */
const FAST = 2.2
/** Parte de la pantalla que pueden ocupar etiquetas y estelas. */
const OVERLAY_BUDGET = 0.03
const LABEL_AREA = 3100
const TRAIL_AREA = 14 * 17
const TRAIL_LENGTH = 4
/** Milisegundos por cuadro a partir de los que el enjambre se reduce. */
const SLOW_FRAME = 24

interface Profile {
  pool: number
  workers: number
}

const DESKTOP: Profile = { pool: 8, workers: 4 }
const MOBILE: Profile = { pool: 6, workers: 3 }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const random = (min: number, max: number): number => min + Math.random() * (max - min)

/** Detalle del evento `swarm:assign`, que alimenta el log del hero. */
export interface AssignDetail {
  agent: string
  color: string
  kind: string
  label: string
}

class Swarm {
  private readonly canvas: HTMLCanvasElement
  private readonly hud: HTMLElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly sound = new Sound()
  private readonly tasks: Task[]
  private readonly agents: Agent[] = []
  private readonly debug: Debug | null
  private workers: number
  private width = 0
  private height = 0
  private ratio = 1
  private speed = 1
  private skipped = false
  private finished = false
  private elapsed = 0
  private lastTime = 0
  private lastScroll = window.scrollY
  private scrollSpeed = 0
  private still = 0
  private settling = false
  private boost = 1
  private turboUntil = 0
  private mouse: Point | null = null
  private hudTimer = 0
  private queued = 0
  private frameCost: number[] = []
  private reduced = false

  constructor(canvas: HTMLCanvasElement, hud: HTMLElement) {
    this.canvas = canvas
    this.hud = hud
    this.ctx = canvas.getContext('2d')!
    const mobile = window.matchMedia('(max-width: 767px)').matches
    const profile = mobile ? MOBILE : DESKTOP
    this.workers = profile.workers
    const { tasks, orphans } = collectTasks(mobile, profile.workers)
    this.tasks = tasks
    this.debug = new URLSearchParams(location.search).has('debug') ? new Debug(orphans) : null
    this.resize()
    for (let id = 0; id < profile.pool; id++) {
      this.agents.push({
        id,
        name: NAMES[id % NAMES.length],
        color: COLORS[id % COLORS.length],
        state: 'away',
        x: id % 2 ? -40 : this.width + 40,
        y: random(this.height * 0.2, this.height * 0.8),
        tool: 'arrow',
        pressed: false,
        task: null,
        role: 0,
        path: null,
        wait: 0,
        pace: random(0.9, 1.15),
        alpha: 0,
        phase: Math.random() * Math.PI * 2,
        trail: [],
      })
    }
    for (const task of this.tasks) apply(task)
    this.bindEvents()
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
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') this.skip()
    })
    document.addEventListener('visibilitychange', () => {
      this.lastTime = performance.now()
    })
    // Saltar por el menú, o que NOVA lleve la página a una sección, arma esa sección de inmediato.
    const turbo = (): void => {
      this.turboUntil = performance.now() + 1400
    }
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => link.addEventListener('click', turbo))
    window.addEventListener('swarm:turbo', turbo)
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
    document.querySelector('#swarm-skip')?.addEventListener('click', () => this.skip())
  }

  private resize(remeasure = false): void {
    this.ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = Math.round(this.width * this.ratio)
    this.canvas.height = Math.round(this.height * this.ratio)
    if (remeasure) for (const task of this.tasks) task.box = measure(task.el)
  }

  /** Muestra toda la página de inmediato. */
  skip(): void {
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
      const begin = performance.now()
      this.update(dt, now)
      this.render()
      this.watchPerformance(performance.now() - begin, dt)
      this.debug?.work(begin)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  /** Si el navegador no sostiene 60 fps, el enjambre trabaja con menos cursores. */
  private watchPerformance(_cost: number, dt: number): void {
    if (this.reduced || this.elapsed < 1.5) return
    this.frameCost.push(dt * 1000)
    if (this.frameCost.length < 60) return
    const average = this.frameCost.reduce((sum, value) => sum + value, 0) / this.frameCost.length
    this.frameCost = []
    if (average > SLOW_FRAME) {
      this.reduced = true
      this.workers = Math.max(2, this.workers - 2)
      this.debug?.log(`cuadros lentos (${average.toFixed(0)} ms): el enjambre baja a ${this.workers} cursores`)
    }
  }

  private pendingInView(scrollY: number): number {
    let pending = 0
    for (const task of this.tasks) {
      if (task.progress >= 1) continue
      if (task.box.y < scrollY + this.height - 8 && task.box.y + task.box.h > scrollY) pending++
    }
    return pending
  }

  private update(dt: number, now: number): void {
    this.elapsed += dt
    const scrollY = window.scrollY
    const moved = Math.abs(scrollY - this.lastScroll)
    const movedAt = this.lastScroll
    this.lastScroll = scrollY
    this.still = moved > 0.5 ? 0 : this.still + dt
    if (moved > 0.5) this.settling = true
    const instant = moved / Math.max(dt * 1000, 1)
    this.scrollSpeed += (instant - this.scrollSpeed) * (1 - Math.exp(-dt * (instant > this.scrollSpeed ? 10 : 2.5)))

    let target = 1 + 2.5 * clamp((this.scrollSpeed - 0.3) / 2.2, 0, 1)
    if (now < this.turboUntil) target = 3.5
    if (this.settling && this.still > 0.08) {
      if (this.pendingInView(scrollY) > 0 && !this.skipped) target = Math.max(target, 3)
      else this.settling = false
    }
    this.boost += (target - this.boost) * (1 - Math.exp(-dt * (target > this.boost ? 12 : 2)))

    const rate = this.speed * this.boost
    if (!this.skipped) this.schedule(dt, rate, scrollY, movedAt)
    this.moveAgents(dt, rate, scrollY)

    if (!this.finished && this.tasks.every((task) => task.progress >= 1)) {
      this.finished = true
      this.sound.chord()
      this.debug?.log('página completa')
    }
  }

  // -------------------------------------------------------------------------
  // Tareas
  // -------------------------------------------------------------------------

  private schedule(dt: number, rate: number, scrollY: number, movedAt: number): void {
    const viewportBottom = scrollY + this.height
    const waiting: Task[] = []
    let instantBudget = 40

    for (const task of this.tasks) {
      if (task.progress >= 1) continue
      const before = task.progress
      const parentReady = !task.parent || task.parent.progress >= 1
      const masterReady = !task.master || task.master.progress >= 1
      const visible = task.box.y < viewportBottom - 8 && task.box.y + task.box.h > scrollY
      const above = task.box.y + task.box.h <= scrollY
      const empty = task.box.w < 1 && task.box.h < 1

      if (visible && task.visibleSince < 0) task.visibleSince = this.elapsed

      if ((above || empty) && parentReady && masterReady) {
        // Quedó atrás con scroll rápido, o no ocupa lugar: se completa sin animar.
        if (instantBudget-- <= 0) continue
        this.complete(task)
      } else if (visible && parentReady && masterReady) {
        if (task.running) {
          this.advance(task, dt, rate, movedAt)
        } else if (task.crew.length === 0) {
          // Garantía de legibilidad: si lleva demasiado esperando su turno, aparece de golpe.
          if (this.elapsed - task.visibleSince > MAX_WAIT) this.complete(task)
          else waiting.push(task)
        } else {
          this.startIfReady(task)
        }
      }
      if (task.progress !== before) apply(task)
    }

    this.queued = waiting.length
    // Primero lo que se lee: títulos y párrafos antes que etiquetas y copias.
    waiting.sort((a, b) => priority(a) - priority(b) || a.id - b.id)
    this.assign(waiting, scrollY)
  }

  /** Completa una tarea sin cursor y lo anota. */
  private complete(task: Task): void {
    this.release(task)
    task.progress = 1
    task.instant = true
    apply(task)
    this.debug?.instant(task)
  }

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

  private startIfReady(task: Task): void {
    if (task.running || !task.crew.every((agent) => agent.state === 'ready')) return
    task.running = true
    for (const agent of task.crew) agent.state = 'work'
  }

  /** Reparte las tareas en espera; nunca hay más de `workers` agentes dentro de la pantalla. */
  private assign(waiting: Task[], scrollY: number): void {
    const calm = this.boost < FAST
    // Cuentan los que trabajan y los que todavía se ven saliendo: nunca más de `workers` en pantalla.
    let busy = this.agents.filter((agent) => agent.task || (agent.state === 'travel' && this.inside(agent))).length

    for (const task of waiting) {
      if (busy >= this.workers) break
      const free = this.agents.filter((agent) => !agent.task)
      if (free.length === 0) break
      const room = this.workers - busy

      let size = 1
      if (task.kind === 'network' || task.kind === 'converge') {
        size = Math.min(task.crewSize, free.length, room)
        if (size < 3) {
          if (room < 3) break
          continue
        }
      } else {
        size = Math.min(textCrew(task, 3), free.length, room)
      }

      size = prepare(task, size, calm)
      const anchor = pose(task, 0)
      // Entran por el borde más cercano a su tarea.
      for (const agent of free) {
        if (agent.state !== 'away') continue
        agent.x = anchor.x - window.scrollX < this.width / 2 ? -30 : this.width + 30
        agent.y = clamp(anchor.y - scrollY + random(-80, 80), 20, this.height - 20)
      }
      const distance = (agent: Agent): number => Math.hypot(agent.x - anchor.x, agent.y - (anchor.y - scrollY))
      free.sort((a, b) => distance(a) - distance(b))
      const crew = free.slice(0, size)
      task.crew = crew
      crew.forEach((agent, role) => {
        agent.task = task
        agent.role = role
        this.travel(agent)
      })
      busy += crew.length
      this.debug?.log(`#${task.id} ${task.kind} → ${crew.map((agent) => `${agent.name}(${agent.id})`).join(', ')}`)
      if (task.hero) this.announce(task, crew[0])
    }
  }

  private inside(agent: Agent): boolean {
    return agent.x > -10 && agent.x < this.width + 10
  }

  /** Avisa de una asignación del hero, para el log que se ve en la entrada. */
  private announce(task: Task, agent: Agent): void {
    const text = task.glyphs.map((glyph) => glyph.char).join('').trim()
    const label = task.kind === 'text' ? `«${text.slice(0, 28)}${text.length > 28 ? '…' : ''}»` : task.kind
    const detail: AssignDetail = { agent: agent.name, color: agent.color, kind: task.kind, label }
    window.dispatchEvent(new CustomEvent<AssignDetail>('swarm:assign', { detail }))
  }

  private release(task: Task): void {
    for (const agent of task.crew) {
      if (agent.task !== task) continue
      agent.task = null
      this.travel(agent)
    }
    task.crew = []
    task.running = false
  }

  /** Viaje por una curva hacia la tarea del agente, o hacia fuera de la pantalla si no tiene. */
  private travel(agent: Agent): void {
    const target = this.targetOf(agent, window.scrollY)
    const distance = Math.hypot(target.x - agent.x, target.y - agent.y)
    const side = Math.random() < 0.5 ? -1 : 1
    const bend = distance * random(0.1, 0.22) * side
    const nx = distance ? -(target.y - agent.y) / distance : 0
    const ny = distance ? (target.x - agent.x) / distance : 0
    agent.state = 'travel'
    agent.path = {
      from: { x: agent.x, y: agent.y },
      bend: { x: nx * bend, y: ny * bend },
      elapsed: 0,
      duration: clamp(distance / (420 * agent.pace), 0.4, 0.9),
    }
  }

  /** A dónde va un agente, en pantalla: a su tarea, o al borde más cercano para salir. */
  private targetOf(agent: Agent, scrollY: number): Point {
    if (agent.task) {
      const target = pose(agent.task, agent.role)
      return { x: target.x - window.scrollX, y: target.y - scrollY }
    }
    return { x: agent.x < this.width / 2 ? -40 : this.width + 40, y: agent.y }
  }

  private cue(task: Task, before: number): void {
    if (!this.sound.enabled) return
    const pan = ((task.box.x + task.box.w / 2) / this.width) * 2 - 1
    if (task.script?.roles.some((role) => role.shown > 0 && role.shown < role.glyphs.length)) this.sound.key(pan)
    const dropped = task.dragTime / task.duration
    if (task.kind !== 'text' && before < dropped && task.progress >= dropped) {
      this.sound.note(1 - Math.min(1, (task.box.w * task.box.h) / 300_000), pan)
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento de los agentes
  // -------------------------------------------------------------------------

  private moveAgents(dt: number, rate: number, scrollY: number): void {
    const calm = this.boost < FAST
    for (const agent of this.agents) {
      const target = this.targetOf(agent, scrollY)
      switch (agent.state) {
        case 'travel':
          this.moveAlongPath(agent, dt, rate, target, calm)
          break
        case 'hover':
        case 'ready':
        case 'work':
          if (agent.state === 'work') {
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
        default:
          break
      }
      // Visible solo mientras tiene trabajo o va saliendo; afuera, nada.
      const inside = agent.x > -20 && agent.x < this.width + 20
      agent.alpha = agent.task || (agent.state === 'travel' && inside) ? 1 : 0
      agent.trail.unshift({ x: agent.x, y: agent.y })
      if (agent.trail.length > TRAIL_LENGTH * 2 + 1) agent.trail.pop()
    }
  }

  private moveAlongPath(agent: Agent, dt: number, rate: number, target: Point, calm: boolean): void {
    const path = agent.path
    if (!path) {
      agent.state = agent.task ? 'hover' : 'away'
      return
    }
    path.elapsed += dt * (calm ? Math.sqrt(rate) : rate)
    const t = clamp(path.elapsed / path.duration, 0, 1)
    const k = ease(t)
    const cx = (path.from.x + target.x) / 2 + path.bend.x
    const cy = (path.from.y + target.y) / 2 + path.bend.y
    const shake = calm ? Math.sin(agent.phase + path.elapsed * 23) * 1.2 * (1 - t) : 0
    agent.x = (1 - k) ** 2 * path.from.x + 2 * (1 - k) * k * cx + k * k * target.x + shake
    agent.y = (1 - k) ** 2 * path.from.y + 2 * (1 - k) * k * cy + k * k * target.y + shake * 0.6
    agent.tool = 'arrow'
    agent.pressed = false
    if (t < 1) return
    agent.path = null
    if (!agent.task) {
      agent.state = 'away'
      return
    }
    if (calm) {
      agent.state = 'hover'
      agent.wait = random(0.15, 0.3)
    } else {
      agent.state = 'ready'
      agent.pressed = true
      this.startIfReady(agent.task)
    }
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

    ctx.save()
    ctx.translate(-scrollX, -scrollY)
    for (const task of this.tasks) {
      if (!task.running || task.progress <= 0 || task.progress >= 1) continue
      if (task.box.y > scrollY + this.height || task.box.y + task.box.h < scrollY) continue
      draw(ctx, task)
    }
    ctx.restore()

    const onScreen = (agent: Agent): boolean => agent.x > -30 && agent.x < this.width + 30 && agent.y > -30 && agent.y < this.height + 30
    let covered = 0
    let budget = OVERLAY_BUDGET * this.width * this.height

    if (this.boost > FAST) {
      for (const agent of this.agents) {
        if (!agent.task || !onScreen(agent)) continue
        for (let i = 1; i <= TRAIL_LENGTH; i++) {
          const point = agent.trail[i * 2]
          if (!point || budget < TRAIL_AREA) continue
          const image = sprite('arrow', agent.color, null, ratio)
          ctx.globalAlpha = 0.3 * (1 - i / (TRAIL_LENGTH + 1))
          ctx.drawImage(image, point.x - HOTSPOT, point.y - HOTSPOT, image.width / ratio, image.height / ratio)
          budget -= TRAIL_AREA
          covered += TRAIL_AREA
        }
      }
    }

    for (const agent of this.agents) {
      if (agent.alpha < 0.02 || !onScreen(agent)) continue
      const hovered = this.mouse !== null && Math.hypot(this.mouse.x - agent.x, this.mouse.y - agent.y) < 18
      const wantsLabel = (agent.task !== null && agent.role === 0) || hovered
      const label = wantsLabel && budget >= LABEL_AREA ? agent.name : null
      if (label) budget -= LABEL_AREA
      const image = sprite(agent.tool, agent.color, label, ratio)
      const w = image.width / ratio
      const h = image.height / ratio
      const press = agent.pressed ? 1 : 0
      ctx.globalAlpha = agent.alpha
      ctx.drawImage(image, agent.x - HOTSPOT + press, agent.y - HOTSPOT + press, w, h)
      covered += label ? (w - 12) * 28 : 14 * 17
    }
    ctx.globalAlpha = 1

    if (this.debug) {
      this.debug.frame(ctx, this.tasks, this.agents, scrollY, {
        coverage: covered / (this.width * this.height),
        boost: this.boost,
        queued: this.queued,
        pendingInView: this.pendingInView(scrollY),
        still: this.still,
        workers: this.workers,
      })
    }
    this.updateHud()
  }

  private updateHud(): void {
    const now = performance.now()
    if (now - this.hudTimer < 200) return
    this.hudTimer = now
    const skip = document.querySelector<HTMLButtonElement>('#swarm-skip')
    // El botón de saltar solo se ve mientras algo se construye en pantalla.
    if (skip) skip.hidden = this.skipped || this.finished || this.pendingInView(window.scrollY) === 0
    const built = this.tasks.filter((task) => task.progress >= 1).length
    const visible = this.agents.filter((agent) => agent.alpha > 0).length
    this.hud.querySelector('[data-count]')!.textContent = `cursores: ${visible} · capas: ${built}/${this.tasks.length}`
  }
}

/** Orden de construcción dentro de lo visible: lo que se lee va primero. */
function priority(task: Task): number {
  if (task.kind === 'network' || task.kind === 'converge') return 0
  if (task.kind === 'text') return task.grow ? 1 : 2
  if (task.kind === 'rect' || task.kind === 'media' || task.kind === 'line') return 3
  return 4
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
  if (new URLSearchParams(location.search).has('debug')) hud.hidden = false
  const skip = document.querySelector<HTMLButtonElement>('#swarm-skip')
  if (skip) skip.hidden = false
  swarm.start()
}
