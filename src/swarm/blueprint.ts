/**
 * Plano de construcción: lee los elementos marcados con `data-build` y los convierte en tareas.
 *
 * Atributos:
 * - `data-build="rect|media|text|line|dup|network|converge"`: tipo de tarea.
 * - `data-guide`: antes de escribir el texto, se arrastra una guía desde la regla.
 * - `data-grow`: el texto empieza pequeño y crece.
 *
 * En un grupo de `dup`, el primero es la maestra y el resto son copias; lo que está dentro de una
 * copia aparece con ella. `network` reúne a varios agentes en una red antes de sacar la tarjeta, y
 * `converge` junta a todo el enjambre alrededor del elemento.
 */
import type { BuildKind, Box, Task } from './types'

const KINDS: readonly BuildKind[] = ['rect', 'media', 'text', 'line', 'dup', 'network', 'converge']

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * Segundos que tarda una tarea a velocidad 1×: entre 0.4 y 1.4, salvo los momentos especiales.
 *
 * @param task Tarea ya medida.
 * @returns Duración en segundos.
 */
function durationOf(task: Task): number {
  const area = (task.box.w * task.box.h) / 500_000
  switch (task.kind) {
    case 'text': {
      const characters = task.el.textContent?.length ?? 0
      return clamp((task.guide ? 0.35 : 0) + 0.35 + characters * 0.011, 0.4, 1.4)
    }
    case 'line':
      return 0.6
    case 'dup':
      return task.master ? 0.75 : clamp(0.55 + area, 0.5, 1.1)
    case 'network':
      return 3.2
    case 'converge':
      return 2.6
    default:
      return clamp(0.5 + area, 0.45, 1.2)
  }
}

/**
 * Mide un elemento en coordenadas del documento, sin las transformaciones de la animación.
 *
 * @param el Elemento que se mide.
 * @returns Su caja.
 */
export function measure(el: HTMLElement): Box {
  const transform = el.style.transform
  el.style.transform = ''
  const rect = el.getBoundingClientRect()
  el.style.transform = transform
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, w: rect.width, h: rect.height }
}

/**
 * Crea las tareas de toda la página en orden de documento.
 *
 * @param mobile Si es un teléfono: los momentos especiales usan menos agentes.
 * @returns Las tareas, con sus dependencias resueltas.
 */
export function collectTasks(mobile: boolean): Task[] {
  const tasks: Task[] = []
  const byElement = new Map<HTMLElement, Task>()

  for (const el of document.querySelectorAll<HTMLElement>('[data-build]')) {
    const kind = el.dataset.build as BuildKind
    if (!KINDS.includes(kind)) continue
    if (el.parentElement?.closest('[data-copy]')) continue

    let parent: Task | null = null
    for (let node = el.parentElement; node && !parent; node = node.parentElement) {
      parent = byElement.get(node) ?? null
    }

    let master: Task | null = null
    let previous: Task | null = null
    if (kind === 'dup') {
      const siblings = Array.from(el.parentElement?.children ?? []).filter(
        (node): node is HTMLElement => node instanceof HTMLElement && node.dataset.build === 'dup',
      )
      const index = siblings.indexOf(el)
      if (index > 0) {
        el.dataset.copy = ''
        master = byElement.get(siblings[0]) ?? null
        previous = byElement.get(siblings[index - 1]) ?? null
      }
    }

    const task: Task = {
      id: tasks.length,
      el,
      kind,
      box: measure(el),
      parent,
      master,
      previous,
      children: [],
      guide: el.hasAttribute('data-guide'),
      grow: el.hasAttribute('data-grow'),
      progress: 0,
      duration: 1,
      crew: [],
      crewSize: kind === 'network' ? (mobile ? 3 : 5) : kind === 'converge' ? (mobile ? 6 : 12) : 1,
      running: false,
      typing: null,
    }
    task.duration = durationOf(task)
    parent?.children.push(task)
    byElement.set(el, task)
    tasks.push(task)
  }
  return tasks
}
