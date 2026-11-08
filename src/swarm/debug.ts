/**
 * Modo de depuración (`?debug=1`): muestra qué agente construye cada tarea, un registro y las
 * mediciones de los criterios de aceptación.
 *
 * - Violaciones: veces que una tarea avanzó sin su agente en su lugar. Debe ser 0.
 * - Cobertura: parte de la pantalla que tapan cursores, estelas y etiquetas. Debe ser ≤ 5 %.
 * - En reposo sobre contenido: agentes en reposo dentro de algo ya construido. Debe ser 0.
 * - Asentado: segundos desde que se detiene el scroll hasta que todo lo visible queda completo.
 * - Texto sin tarea: textos de la página que ningún cursor escribiría. Debe ser 0.
 *
 * Las mismas cifras quedan en `window.__swarmStats` para revisarlas desde la consola.
 */
import type { Agent, Task } from './types'

/** Lo que el motor le pasa al modo de depuración en cada cuadro. */
export interface FrameInfo {
  coverage: number
  zones: DOMRect[]
  boost: number
  queued: number
  pendingInView: number
  /** Segundos desde el último movimiento del scroll. */
  still: number
}

/** Cifras que acumula el modo de depuración. */
export interface SwarmStats {
  violations: number
  coverage: number
  maxCoverage: number
  idleOverText: number
  maxIdleOverText: number
  boost: number
  maxBoost: number
  queued: number
  pendingInView: number
  orphans: number
  fps: number
  worstFrameMs: number
  slowFrames: number
  frames: number
  /** Milisegundos de trabajo por cuadro (script, estilos y layout), promedio y peor caso. */
  workMs: number
  worstWorkMs: number
  /** Segundos que tardó en completarse la pantalla cada vez que se detuvo el scroll. */
  settles: number[]
  log: string[]
}

declare global {
  interface Window {
    __swarmStats?: SwarmStats
  }
}

export class Debug {
  private readonly panel: HTMLElement
  private readonly stats: SwarmStats
  private readonly frameTimes: number[] = []
  private lastFrame = 0
  private lastPaint = 0
  private settling = false

  constructor(orphans: number) {
    this.panel = document.createElement('pre')
    this.panel.setAttribute('aria-hidden', 'true')
    this.panel.style.cssText =
      'position:fixed;top:64px;left:8px;z-index:60;max-width:380px;margin:0;padding:8px 10px;font:11px/1.45 "JetBrains Mono",monospace;color:#EAF2FF;background:rgba(7,14,34,.92);border:1px solid rgba(147,168,202,.3);border-radius:8px;pointer-events:none;white-space:pre-wrap'
    document.body.append(this.panel)
    this.stats = {
      violations: 0,
      coverage: 0,
      maxCoverage: 0,
      idleOverText: 0,
      maxIdleOverText: 0,
      boost: 1,
      maxBoost: 1,
      queued: 0,
      pendingInView: 0,
      orphans,
      fps: 0,
      worstFrameMs: 0,
      slowFrames: 0,
      frames: 0,
      workMs: 0,
      worstWorkMs: 0,
      settles: [],
      log: [],
    }
    window.__swarmStats = this.stats
  }

  /** Mide el tiempo entre cuadros. */
  tick(now: number): void {
    if (this.lastFrame) {
      const ms = now - this.lastFrame
      this.frameTimes.push(ms)
      if (this.frameTimes.length > 120) this.frameTimes.shift()
      this.stats.frames++
      // Los primeros cuadros incluyen la carga de la página.
      if (this.stats.frames > 30) {
        this.stats.worstFrameMs = Math.max(this.stats.worstFrameMs, ms)
        if (ms > 20) this.stats.slowFrames++
      }
      const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length
      this.stats.fps = 1000 / average
    }
    this.lastFrame = now
  }

  /**
   * Cierra la medición de un cuadro: fuerza estilos y layout para incluir su costo.
   *
   * @param start Momento en que empezó el trabajo del cuadro.
   */
  work(start: number): void {
    void document.documentElement.offsetWidth
    const ms = performance.now() - start
    if (this.stats.frames <= 30) return
    this.stats.workMs += (ms - this.stats.workMs) * 0.05
    this.stats.worstWorkMs = Math.max(this.stats.worstWorkMs, ms)
  }

  /** Agrega una línea al registro. */
  log(message: string): void {
    this.stats.log.push(`${(performance.now() / 1000).toFixed(2)}s ${message}`)
    if (this.stats.log.length > 300) this.stats.log.shift()
  }

  /** Registra que una tarea avanzó sin su agente presente. */
  violation(message: string): void {
    this.stats.violations++
    this.log(`⚠ ${message}`)
    console.warn('[swarm]', message)
  }

  /**
   * Dibuja las marcas de depuración y actualiza el panel.
   *
   * @param ctx Lienzo, en coordenadas de pantalla.
   * @param tasks Todas las tareas.
   * @param agents Todos los agentes.
   * @param scrollY Desplazamiento vertical.
   * @param info Mediciones del cuadro.
   */
  frame(ctx: CanvasRenderingContext2D, tasks: Task[], agents: Agent[], scrollY: number, info: FrameInfo): void {
    ctx.save()
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.strokeStyle = '#FFB454'
    ctx.fillStyle = '#FFB454'
    for (const task of tasks) {
      if (task.crew.length === 0) continue
      const x = task.box.x - window.scrollX
      const y = task.box.y - scrollY
      ctx.setLineDash([3, 3])
      ctx.strokeRect(x, y, task.box.w, task.box.h)
      ctx.setLineDash([])
      for (const agent of task.crew) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(agent.x, agent.y)
        ctx.stroke()
      }
      ctx.fillText(`#${task.id} ← ${task.crew.map((agent) => agent.id).join(',')}`, x, y - 4)
    }
    ctx.restore()

    const stats = this.stats
    const overText = agents.filter(
      (agent) =>
        agent.state === 'idle' &&
        info.zones.some((zone) => agent.x > zone.left + 10 && agent.x < zone.right - 10 && agent.y > zone.top + 10 && agent.y < zone.bottom - 10),
    ).length
    stats.coverage = info.coverage
    stats.maxCoverage = Math.max(stats.maxCoverage, info.coverage)
    stats.idleOverText = overText
    stats.maxIdleOverText = Math.max(stats.maxIdleOverText, overText)
    stats.boost = info.boost
    stats.maxBoost = Math.max(stats.maxBoost, info.boost)
    stats.queued = info.queued
    stats.pendingInView = info.pendingInView

    // Tiempo de asentado: desde que se detiene el scroll hasta que no queda nada pendiente a la vista.
    if (info.still === 0) this.settling = true
    if (this.settling && info.still > 0 && info.pendingInView === 0) {
      stats.settles.push(Number(info.still.toFixed(2)))
      this.settling = false
    }

    const now = performance.now()
    if (now - this.lastPaint < 150) return
    this.lastPaint = now
    const count = (state: string): number => agents.filter((agent) => agent.state === state).length
    this.panel.textContent = [
      `multiplicador: ${info.boost.toFixed(2)}× (máx ${stats.maxBoost.toFixed(2)}×) · fps ${stats.fps.toFixed(0)}`,
      `trabajo por cuadro: ${stats.workMs.toFixed(1)} ms (peor ${stats.worstWorkMs.toFixed(1)} ms)`,
      `agentes activos: ${agents.length - count('reserve')} · reposo ${count('idle')} · reserva ${count('reserve')}`,
      `viaje ${count('travel')} · pausa ${count('hover') + count('ready')} · trabajo ${count('work')}`,
      `en cola: ${info.queued} · pendientes a la vista: ${info.pendingInView}`,
      `violaciones: ${stats.violations} · texto sin tarea: ${stats.orphans}`,
      `cobertura: ${(info.coverage * 100).toFixed(2)} % (máx ${(stats.maxCoverage * 100).toFixed(2)} %)`,
      `en reposo sobre contenido: ${overText} (máx ${stats.maxIdleOverText})`,
      `asentado tras scroll: ${stats.settles.slice(-4).join(' s, ') || '—'}${stats.settles.length ? ' s' : ''}`,
      '—',
      ...stats.log.slice(-8),
    ].join('\n')
  }
}
