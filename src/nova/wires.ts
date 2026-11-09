/**
 * Conexiones del diagrama de NOVA: trazos SVG entre los nodos reales del repo. Cada trazo lleva
 * `data-build="line"` para que el enjambre lo dibuje con la pluma, y `data-edge` para que el tour
 * lo resalte junto con sus nodos.
 */

/** Pares de componentes conectados, en el orden del flujo de un turno. */
const EDGES: [string, string][] = [
  ['voice-in', 'server'],
  ['server', 'claude'],
  ['server', 'voice-out'],
  ['server', 'memory'],
  ['memory', 'qdrant'],
  ['memory', 'obsidian'],
  ['server', 'vision'],
  ['server', 'desktop'],
  ['server', 'writer'],
  ['writer', 'claude'],
]

/**
 * Dibuja (o redibuja) las conexiones según la posición actual de los nodos.
 *
 * @returns Si se dibujó algo.
 */
export function drawWires(): boolean {
  const svg = document.querySelector<SVGSVGElement>('#nova-wires')
  const container = document.querySelector<HTMLElement>('#nova-diagram')
  if (!svg || !container) return false

  const base = container.getBoundingClientRect()
  svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`)
  const center = (name: string): { x: number; y: number } | null => {
    const node = container.querySelector<HTMLElement>(`[data-component="${name}"]`)
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { x: rect.left - base.left + rect.width / 2, y: rect.top - base.top + rect.height / 2 }
  }

  const existing = new Map(Array.from(svg.querySelectorAll<SVGPathElement>('path')).map((path) => [path.dataset.edge!, path]))
  for (const [from, to] of EDGES) {
    const a = center(from)
    const b = center(to)
    if (!a || !b) continue
    const key = `${from}-${to}`
    const path = existing.get(key) ?? document.createElementNS('http://www.w3.org/2000/svg', 'path')
    // Curva suave: sale en horizontal de un nodo y entra en horizontal al otro.
    const dx = (b.x - a.x) / 2
    path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`)
    if (!existing.has(key)) {
      path.dataset.edge = key
      path.setAttribute('data-build', 'line')
      svg.append(path)
    }
  }
  return true
}

/**
 * Resalta componentes y las conexiones entre ellos; sin argumentos, apaga todo.
 *
 * @param names Componentes a resaltar.
 */
export function lightComponents(names: string[] = []): void {
  document.querySelectorAll<HTMLElement>('[data-component]').forEach((node) => {
    if (names.includes(node.dataset.component!)) node.setAttribute('data-lit', '')
    else node.removeAttribute('data-lit')
  })
  document.querySelectorAll<SVGPathElement>('#nova-wires path').forEach((path) => {
    const [from, to] = path.dataset.edge!.split('-')
    if (names.includes(from) && names.includes(to)) path.setAttribute('data-lit', '')
    else path.removeAttribute('data-lit')
  })
}
