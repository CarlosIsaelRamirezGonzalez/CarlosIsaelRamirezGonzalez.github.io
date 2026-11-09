/**
 * Plano de construcción: prepara el texto para teclearlo y convierte los elementos marcados con
 * `data-build` en tareas.
 *
 * Atributos:
 * - `data-build="rect|media|text|line|dup|network|converge"`: tipo de tarea.
 * - `data-grow`: el texto crece mientras se escribe (títulos).
 *
 * Cada texto se parte en un `span` por carácter dentro de una capa con `aria-hidden`; al lado
 * queda una copia completa visualmente oculta para lectores de pantalla y buscadores.
 */
import type { BuildKind, Box, Glyph, Task } from './types'

const KINDS: readonly BuildKind[] = ['rect', 'media', 'text', 'line', 'dup', 'network', 'converge']
/** Letras por segundo que se usan para estimar la duración antes de crear el guion. */
const ESTIMATED_CPS = 95

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

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

/** Las copias de un grupo `dup` reciben las mismas marcas que su maestra, en la misma posición. */
function mirrorCopies(): void {
  const groups = new Set<HTMLElement>()
  document.querySelectorAll<HTMLElement>('[data-build="dup"]').forEach((el) => el.parentElement && groups.add(el.parentElement))
  for (const group of groups) {
    const items = Array.from(group.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.dataset.build === 'dup',
    )
    const [master, ...copies] = items
    if (!master) continue
    for (const marked of master.querySelectorAll<HTMLElement>('[data-build]')) {
      const path: number[] = []
      for (let node: HTMLElement = marked; node !== master; node = node.parentElement!) {
        path.unshift(Array.from(node.parentElement!.children).indexOf(node))
      }
      for (const copy of copies) {
        let target: Element | undefined = copy
        for (const index of path) target = target?.children[index]
        if (!(target instanceof HTMLElement) || target.tagName !== marked.tagName || target.dataset.build) continue
        target.dataset.build = marked.dataset.build
        if (marked.hasAttribute('data-grow')) target.setAttribute('data-grow', '')
      }
    }
  }
}

/**
 * Parte en caracteres el texto que vive dentro de una tarea (fuera de los SVG).
 *
 * @returns Para cada elemento con `data-build`, las letras que le pertenecen directamente.
 */
function splitText(): Map<Element, Glyph[]> {
  const owners = new Map<Element, Glyph[]>()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (!text.data.trim()) continue
    const parent = text.parentElement
    if (!parent?.closest('[data-build]')) continue
    if (parent.closest('script, style, svg, .sr-only, #nova-dock')) continue
    nodes.push(text)
  }

  for (const text of nodes) {
    const owner = text.parentElement!.closest('[data-build]')!
    const content = text.data.replace(/\s+/g, ' ')
    const readable = document.createElement('span')
    readable.className = 'sr-only'
    readable.textContent = content
    const layer = document.createElement('span')
    layer.setAttribute('aria-hidden', 'true')
    const glyphs = owners.get(owner) ?? []
    for (const char of content) {
      const glyph = document.createElement('span')
      glyph.textContent = char
      glyph.style.visibility = 'hidden'
      layer.append(glyph)
      glyphs.push({ el: glyph, char })
    }
    owners.set(owner, glyphs)
    text.replaceWith(readable, layer)
  }
  return owners
}

/**
 * Segundos (a 1×) de la parte previa al tecleo: arrastre, selección, trazo o reunión.
 * Todo cabe en menos de un segundo por bloque.
 */
function dragTimeOf(task: Task): number {
  const area = (task.box.w * task.box.h) / 900_000
  switch (task.kind) {
    case 'text':
      return 0.12
    case 'line':
      return task.svgPath ? 0.7 : 0.55
    case 'media':
      return clamp(0.5 + area, 0.5, 0.85)
    case 'dup':
      return task.master ? 0.45 : clamp(0.35 + area, 0.35, 0.6)
    case 'network':
      return 1.8
    case 'converge':
      return 0.8
    default:
      return clamp(0.32 + area, 0.32, 0.6)
  }
}

/**
 * Prepara el texto y crea las tareas de toda la página en orden de documento.
 *
 * @param mobile Si es un teléfono: los momentos especiales usan menos agentes.
 * @param maxCrew Agentes que pueden trabajar a la vez; acota las cuadrillas.
 * @returns Las tareas y la cantidad de textos que quedaron fuera de toda tarea.
 */
export function collectTasks(mobile: boolean, maxCrew: number): { tasks: Task[]; orphans: number } {
  mirrorCopies()
  const glyphsByOwner = splitText()
  const hero = document.querySelector('#entrada')

  const tasks: Task[] = []
  const byElement = new Map<Element, Task>()

  for (const node of document.querySelectorAll('[data-build]')) {
    // Los SVG también tienen `style` y `getBoundingClientRect`; se tratan como elementos HTML.
    const el = node as HTMLElement
    const kind = el.getAttribute('data-build') as BuildKind
    if (!KINDS.includes(kind)) continue

    let parent: Task | null = null
    for (let up = el.parentElement; up && !parent; up = up.parentElement) parent = byElement.get(up) ?? null

    let master: Task | null = null
    let previous: Task | null = null
    if (kind === 'dup') {
      const siblings = Array.from(el.parentElement?.children ?? []).filter((item) => item.getAttribute('data-build') === 'dup')
      const index = siblings.indexOf(el)
      if (index > 0) {
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
      grow: el.hasAttribute('data-grow'),
      svgPath: node instanceof SVGPathElement ? node : null,
      glyphs: glyphsByOwner.get(el) ?? [],
      progress: 0,
      dragTime: 0,
      duration: 1,
      script: null,
      crew: [],
      crewSize: kind === 'network' ? Math.min(mobile ? 3 : 4, maxCrew) : kind === 'converge' ? maxCrew : 1,
      running: false,
      visibleSince: -1,
      instant: false,
      hero: hero?.contains(el) ?? false,
    }
    task.dragTime = dragTimeOf(task)
    task.duration = task.dragTime + Math.min(0.9, task.glyphs.length / ESTIMATED_CPS)
    parent?.children.push(task)
    byElement.set(el, task)
    tasks.push(task)
  }

  // Texto visible de la página que ningún cursor escribiría (debe ser 0).
  let orphans = 0
  const main = document.querySelector('main')
  if (main) {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (node.textContent?.trim() && parent && !parent.closest('[data-build]') && !parent.closest('.sr-only, svg')) orphans++
    }
  }
  return { tasks, orphans }
}
