/**
 * Modo de depuración (`?debug=1`): muestra qué agente construye cada tarea, un registro de
 * asignaciones y las mediciones de los criterios de aceptación.
 *
 * - Violaciones: veces que una tarea avanzó sin su agente en su lugar. Debe quedarse en 0.
 * - Cobertura: porcentaje de la pantalla que tapan cursores y etiquetas. Debe ser ≤ 5 %.
 * - Encima de texto: agentes en reposo dentro de algo ya construido. Debe ser 0.
 *
 * Las mismas cifras quedan en `window.__swarmStats` para revisarlas desde la consola.
 */
import type { Agent, Task } from './types'

/** Cifras que acumula el modo de depuración. */
export interface SwarmStats {
  violations: number
  maxCoverage: number
  coverage: number
  idleOverText: number
  maxIdleOverText: number
  log: string[]
}

declare global {
  interface Window {
    __swarmStats?: SwarmStats
  }
}

export class Debug {
  private readonly panel: HTMLElement
  private readonly stats: SwarmStats = {
    violations: 0,
    maxCoverage: 0,
    coverage: 0,
    idleOverText: 0,
    maxIdleOverText: 0,
    log: [],
  }
  private lastPaint = 0

  constructor() {
    this.panel = document.createElement('pre')
    this.panel.setAttribute('aria-hidden', 'true')
    this.panel.style.cssText =
      'position:fixed;top:64px;left:8px;z-index:60;max-width:360px;margin:0;padding:8px 10px;font:11px/1.45 "JetBrains Mono",monospace;color:#EAF2FF;background:rgba(7,14,34,.92);border:1px solid rgba(147,168,202,.3);border-radius:8px;pointer-events:none;white-space:pre-wrap'
    document.body.append(this.panel)
    window.__swarmStats = this.stats
  }

  /** Agrega una línea al registro. */
  log(message: string): void {
    const time = (performance.now() / 1000).toFixed(2)
    this.stats.log.push(`${time}s ${message}`)
    if (this.stats.log.length > 200) this.stats.log.shift()
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
   * @param coverage Fracción de la pantalla que tapan los cursores.
   * @param zones Zonas ya construidas.
   */
  frame(ctx: CanvasRenderingContext2D, tasks: Task[], agents: Agent[], scrollY: number, coverage: number, zones: DOMRect[]): void {
    // Cada tarea con cuadrilla: línea hasta su agente e id.
    ctx.save()
    ctx.font = '10px "JetBrains Mono", monospace'
    for (const task of tasks) {
      if (task.crew.length === 0) continue
      const x = task.box.x - window.scrollX
      const y = task.box.y - scrollY
      ctx.strokeStyle = '#FFB454'
      ctx.setLineDash([3, 3])
      ctx.strokeRect(x, y, task.box.w, task.box.h)
      ctx.setLineDash([])
      for (const agent of task.crew) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(agent.x, agent.y)
        ctx.stroke()
      }
      ctx.fillStyle = '#FFB454'
      ctx.fillText(`#${task.id} ← ${task.crew.map((agent) => agent.id).join(',')}`, x, y - 4)
    }
    ctx.restore()

    const overText = agents.filter(
      (agent) => agent.state === 'idle' && zones.some((zone) => agent.x > zone.left + 10 && agent.x < zone.right - 10 && agent.y > zone.top + 10 && agent.y < zone.bottom - 10),
    ).length
    this.stats.coverage = coverage
    this.stats.maxCoverage = Math.max(this.stats.maxCoverage, coverage)
    this.stats.idleOverText = overText
    this.stats.maxIdleOverText = Math.max(this.stats.maxIdleOverText, overText)

    const now = performance.now()
    if (now - this.lastPaint < 150) return
    this.lastPaint = now
    const count = (state: string): number => agents.filter((agent) => agent.state === state).length
    this.panel.textContent = [
      `agentes: ${agents.length} · reposo ${count('idle')} · reserva ${count('reserve')}`,
      `viaje ${count('travel')} · pausa ${count('hover') + count('ready')} · trabajo ${count('work')}`,
      `violaciones: ${this.stats.violations}`,
      `cobertura: ${(coverage * 100).toFixed(2)} % (máx ${(this.stats.maxCoverage * 100).toFixed(2)} %)`,
      `en reposo sobre contenido: ${overText} (máx ${this.stats.maxIdleOverText})`,
      '—',
      ...this.stats.log.slice(-10),
    ].join('\n')
  }
}
