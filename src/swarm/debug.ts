/**
 * Modo de depuración (`?debug=1`): muestra qué agente construye cada tarea, un registro y las
 * mediciones de los criterios de aceptación.
 *
 * - Violaciones: veces que una tarea avanzó sin su agente en su lugar. Debe ser 0.
 * - Cursores visibles: nunca más que el límite de trabajadores.
 * - Cobertura: parte de la pantalla que tapan cursores, estelas y etiquetas.
 * - Espera máxima: segundos que algo visible estuvo sin aparecer. Debe ser menor que 1.5.
 * - Instantáneas: tareas completadas sin cursor (quedaron atrás o esperaron demasiado).
 * - Texto sin tarea: textos de la página que ningún cursor escribiría. Debe ser 0.
 *
 * Las mismas cifras quedan en `window.__swarmStats`.
 */
import type { Agent, Task } from './types'

export interface FrameInfo {
  coverage: number
  boost: number
  queued: number
  pendingInView: number
  still: number
  workers: number
}

export interface SwarmStats {
  violations: number
  coverage: number
  maxCoverage: number
  visible: number
  maxVisible: number
  boost: number
  maxBoost: number
  queued: number
  pendingInView: number
  orphans: number
  instant: number
  maxWait: number
  fps: number
  workMs: number
  worstWorkMs: number
  frames: number
  settles: number[]
  log: string[]
}

declare global {
  interface Window {
    __swarmStats?: SwarmStats
    __swarmAgents?: Agent[]
  }
}

export class Debug {
  private readonly panel: HTMLElement
  private readonly stats: SwarmStats
  private readonly frameTimes: number[] = []
  private lastFrame = 0
  private lastPaint = 0
  private settling = false
  private readonly shownAt = new Map<number, number>()

  constructor(orphans: number) {
    this.panel = document.createElement('pre')
    this.panel.setAttribute('aria-hidden', 'true')
    this.panel.style.cssText =
      'position:fixed;top:64px;left:8px;z-index:60;max-width:380px;margin:0;padding:8px 10px;font:11px/1.45 "IBM Plex Mono",monospace;color:#EDE6DA;background:rgba(21,18,15,.94);border:1px solid #3A332C;border-radius:2px;pointer-events:none;white-space:pre-wrap'
    document.body.append(this.panel)
    this.stats = {
      violations: 0,
      coverage: 0,
      maxCoverage: 0,
      visible: 0,
      maxVisible: 0,
      boost: 1,
      maxBoost: 1,
      queued: 0,
      pendingInView: 0,
      orphans,
      instant: 0,
      maxWait: 0,
      fps: 0,
      workMs: 0,
      worstWorkMs: 0,
      frames: 0,
      settles: [],
      log: [],
    }
    window.__swarmStats = this.stats
  }

  tick(now: number): void {
    if (this.lastFrame) {
      const ms = now - this.lastFrame
      this.frameTimes.push(ms)
      if (this.frameTimes.length > 120) this.frameTimes.shift()
      this.stats.frames++
      const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length
      this.stats.fps = 1000 / average
    }
    this.lastFrame = now
  }

  work(start: number): void {
    void document.documentElement.offsetWidth
    const ms = performance.now() - start
    if (this.stats.frames <= 30) return
    this.stats.workMs += (ms - this.stats.workMs) * 0.05
    this.stats.worstWorkMs = Math.max(this.stats.worstWorkMs, ms)
  }

  log(message: string): void {
    this.stats.log.push(`${(performance.now() / 1000).toFixed(2)}s ${message}`)
    if (this.stats.log.length > 300) this.stats.log.shift()
  }

  violation(message: string): void {
    this.stats.violations++
    this.log(`⚠ ${message}`)
    console.warn('[swarm]', message)
  }

  instant(task: Task): void {
    this.stats.instant++
    this.log(`#${task.id} ${task.kind} completada de golpe`)
  }

  frame(ctx: CanvasRenderingContext2D, tasks: Task[], agents: Agent[], scrollY: number, info: FrameInfo): void {
    ctx.save()
    ctx.font = '10px "IBM Plex Mono", monospace'
    ctx.strokeStyle = '#D9A441'
    ctx.fillStyle = '#D9A441'
    for (const task of tasks) {
      if (task.crew.length === 0) continue
      const x = task.box.x - window.scrollX
      const y = task.box.y - scrollY
      ctx.setLineDash([3, 3])
      ctx.strokeRect(x, y, task.box.w, task.box.h)
      ctx.setLineDash([])
      ctx.fillText(`#${task.id} ← ${task.crew.map((agent) => agent.id).join(',')}`, x, y - 4)
    }
    ctx.restore()

    const stats = this.stats
    const now = performance.now() / 1000
    // Espera: desde que una tarea asoma hasta que su elemento es visible.
    for (const task of tasks) {
      if (task.visibleSince >= 0 && !this.shownAt.has(task.id)) this.shownAt.set(task.id, now)
      if (task.progress > 0 && this.shownAt.has(task.id) && this.shownAt.get(task.id)! >= 0) {
        stats.maxWait = Math.max(stats.maxWait, now - this.shownAt.get(task.id)!)
        this.shownAt.set(task.id, -1)
      }
    }
    const visible = agents.filter((agent) => agent.alpha > 0 && agent.x > 0 && agent.x < innerWidth && agent.y > 0 && agent.y < innerHeight).length
    stats.visible = visible
    stats.maxVisible = Math.max(stats.maxVisible, visible)
    stats.coverage = info.coverage
    stats.maxCoverage = Math.max(stats.maxCoverage, info.coverage)
    stats.boost = info.boost
    stats.maxBoost = Math.max(stats.maxBoost, info.boost)
    stats.queued = info.queued
    stats.pendingInView = info.pendingInView
    window.__swarmAgents = agents

    if (info.still === 0) this.settling = true
    if (this.settling && info.still > 0 && info.pendingInView === 0) {
      stats.settles.push(Number(info.still.toFixed(2)))
      this.settling = false
    }

    const paint = performance.now()
    if (paint - this.lastPaint < 150) return
    this.lastPaint = paint
    this.panel.textContent = [
      `multiplicador ${info.boost.toFixed(2)}× · fps ${stats.fps.toFixed(0)} · trabajo ${stats.workMs.toFixed(1)} ms (peor ${stats.worstWorkMs.toFixed(1)})`,
      `cursores visibles ${visible} (máx ${stats.maxVisible}, límite ${info.workers}) · en cola ${info.queued} · pendientes a la vista ${info.pendingInView}`,
      `violaciones ${stats.violations} · instantáneas ${stats.instant} · texto sin tarea ${stats.orphans}`,
      `cobertura ${(info.coverage * 100).toFixed(2)} % (máx ${(stats.maxCoverage * 100).toFixed(2)} %) · espera máx ${stats.maxWait.toFixed(2)} s`,
      '—',
      ...stats.log.slice(-8),
    ].join('\n')
  }
}
