/**
 * Coreografía de cada tipo de tarea, medida en tiempo.
 *
 * Una tarea tiene una fase previa (arrastrar una caja, mover una copia, trazar una línea, reunir
 * agentes) y una fase de tecleo. El avance (`progress`, de 0 a 1) es un instante de esa línea de
 * tiempo. Nada ocurre sin su cursor: la caja aparece al soltar el arrastre, la imagen se barre
 * con el cursor, la línea sigue a la pluma y cada letra aparece cuando el caret llega.
 *
 * Gestos por tipo:
 * - `text`: caja de texto breve y tecleo con I-beam; los títulos crecen a saltos.
 * - `rect`: cruz que arrastra una caja punteada con su medida; al soltar, aparece el bloque.
 * - `media`: igual, pero el contenido se revela de arriba hacia abajo siguiendo al cursor.
 * - `line`: pluma con anclas; en SVG, el trazo se dibuja por su longitud.
 * - `dup`: se selecciona la maestra y se arrastra una copia con la separación medida.
 * - `network`: varios agentes forman una red de nodos y de ahí sale el bloque.
 * - `converge`: todo el enjambre rodea el elemento y luego se dispersa.
 */
import type { Box, Glyph, Point, Pose, RoleScript, Script, Task } from './types'

const SELECTION = '#ABA8E8'
const PLACEHOLDER = 'rgba(238, 237, 248, 0.06)'
const NODE_FILL = '#11101F'

/** Letras por segundo de un cursor a 1×; cada agente varía un poco. */
const BASE_CPS = 95
/** Ningún bloque tarda más que esto en teclearse a 1×. */
const MAX_TYPING = 0.9
/** Textos más largos que esto se reparten por líneas entre varios agentes. */
export const LONG_TEXT = 120

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (from: number, to: number, t: number): number => from + (to - from) * t
const span = (t: number, start: number, end: number): number => clamp((t - start) / (end - start))
const random = (min: number, max: number): number => min + Math.random() * (max - min)

interface Timeline {
  t: number
  dragEnd: number
}

function timeline(task: Task): Timeline {
  return { t: task.progress * task.duration, dragEnd: task.dragTime }
}

// ---------------------------------------------------------------------------
// Guion de tecleo
// ---------------------------------------------------------------------------

function boxOf(glyphs: Glyph[], fallback: Box): Box {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const glyph of glyphs) {
    const rect = glyph.el.getBoundingClientRect()
    if (!rect.width && !rect.height) continue
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  if (left === Infinity) return fallback
  return { x: left + window.scrollX, y: top + window.scrollY, w: right - left, h: bottom - top }
}

function visualLines(glyphs: Glyph[]): Glyph[][] {
  const lines: Glyph[][] = []
  let lastTop = -Infinity
  for (const glyph of glyphs) {
    const top = glyph.el.getBoundingClientRect().top
    if (lines.length === 0 || (Math.abs(top - lastTop) > 4 && glyph.char !== ' ')) {
      lines.push([])
      lastTop = top
    }
    lines[lines.length - 1].push(glyph)
  }
  return lines
}

/**
 * Cuántos agentes conviene para teclear una tarea.
 *
 * @param task Tarea.
 * @param max Máximo disponible.
 */
export function textCrew(task: Task, max: number): number {
  if (task.kind !== 'text' || task.glyphs.length <= LONG_TEXT) return 1
  return clamp(visualLines(task.glyphs).length, 1, max)
}

function typeRole(glyphs: Glyph[], calm: boolean): Pick<RoleScript, 'times' | 'end'> {
  const cps = BASE_CPS * random(0.9, 1.1)
  const times: number[] = []
  let clock = 0
  for (const glyph of glyphs) {
    clock += (1 / cps) * random(0.85, 1.15)
    times.push(clock)
    if (calm && /[.,;:!?]/.test(glyph.char)) clock += 0.04
  }
  if (clock > MAX_TYPING) {
    const factor = MAX_TYPING / clock
    for (let i = 0; i < times.length; i++) times[i] *= factor
    clock = MAX_TYPING
  }
  return { times, end: clock }
}

/**
 * Crea el guion de una tarea al asignarla: reparte sus letras entre la cuadrilla y fija su duración.
 *
 * @returns Cuántos agentes necesita de verdad.
 */
export function prepare(task: Task, crew: number, calm: boolean): number {
  let groups: Glyph[][]
  if (task.kind === 'text' && crew > 1) {
    const lines = visualLines(task.glyphs)
    groups = Array.from({ length: crew }, (_, role) =>
      lines.slice(Math.floor((role * lines.length) / crew), Math.floor(((role + 1) * lines.length) / crew)).flat(),
    ).filter((group) => group.length > 0)
  } else {
    groups = [task.glyphs]
  }
  const roles: RoleScript[] = groups.map((glyphs) => ({
    glyphs,
    ...typeRole(glyphs, calm),
    shown: -1,
    caret: null,
    box: boxOf(glyphs, task.box),
  }))
  task.script = { roles }
  const typing = Math.max(0, ...roles.map((role) => role.end))
  if (task.kind === 'network') task.duration = task.dragTime + typing + 0.3
  else if (task.kind === 'converge') task.duration = task.dragTime + Math.max(typing, 0.8)
  else task.duration = task.dragTime + typing + 0.03
  return task.kind === 'text' ? roles.length : crew
}

// ---------------------------------------------------------------------------
// Elemento real
// ---------------------------------------------------------------------------

function setAll(task: Task, visible: boolean): void {
  const value = visible ? 'visible' : 'hidden'
  for (const glyph of task.glyphs) if (glyph.el.style.visibility !== value) glyph.el.style.visibility = value
  if (task.script) for (const role of task.script.roles) role.shown = visible ? role.glyphs.length : 0
}

function typeTo(role: RoleScript, elapsed: number): void {
  let count = 0
  while (count < role.times.length && role.times[count] <= elapsed) count++
  if (count === role.shown) return
  for (let i = 0; i < role.glyphs.length; i++) {
    role.glyphs[i].el.style.visibility = i < count ? 'visible' : 'hidden'
  }
  role.shown = count
  const last = role.glyphs[count - 1]
  if (last) {
    const rect = last.el.getBoundingClientRect()
    role.caret = { x: rect.right + window.scrollX, y: rect.top + window.scrollY, w: 0, h: rect.height }
  } else {
    role.caret = { x: role.box.x, y: role.box.y, w: 0, h: Math.min(role.box.h, 40) }
  }
}

/** Dibuja un trazo SVG hasta cierta fracción de su longitud. */
function strokeTo(path: SVGPathElement, fraction: number): void {
  const length = path.getTotalLength()
  path.style.strokeDasharray = `${length}`
  path.style.strokeDashoffset = `${length * (1 - fraction)}`
}

/**
 * Ajusta el elemento real al avance de la tarea. Sin transiciones: cada cosa está o no está.
 */
export function apply(task: Task): void {
  const { el, progress: p } = task
  const style = el.style

  if (p >= 1) {
    setAll(task, true)
    style.opacity = '1'
    style.transform = ''
    style.clipPath = ''
    if (task.svgPath) {
      task.svgPath.style.strokeDasharray = ''
      task.svgPath.style.strokeDashoffset = ''
    }
    return
  }

  const { t, dragEnd } = timeline(task)
  if (task.svgPath) {
    // El trazo se dibuja mientras la pluma avanza; el elemento es visible desde el primer punto.
    style.opacity = p > 0 ? '1' : '0'
    strokeTo(task.svgPath, ease(span(t, 0, dragEnd)))
    return
  }

  const boxVisible = task.kind === 'text' || task.kind === 'line' ? p > 0 && t >= dragEnd : p > 0 && t >= dragEnd
  style.opacity = boxVisible || task.kind === 'media' ? '1' : '0'

  if (p <= 0 || !task.script) setAll(task, false)
  else for (const role of task.script.roles) typeTo(role, t - dragEnd)

  if (task.kind === 'media') {
    // El contenido se revela de arriba hacia abajo siguiendo al cursor.
    const sweep = p > 0 ? ease(span(t, 0, dragEnd)) : 0
    style.clipPath = `inset(0 0 ${(1 - sweep) * 100}% 0)`
  }
  if (task.grow && task.script) {
    const role = task.script.roles[0]
    const fraction = role.glyphs.length ? Math.max(0, role.shown) / role.glyphs.length : 1
    const scale = 0.7 + 0.3 * Math.min(1, Math.floor(fraction * 4) / 3)
    style.transformOrigin = 'left bottom'
    style.transform = `scale(${scale})`
  }
}

// ---------------------------------------------------------------------------
// Pose del cursor
// ---------------------------------------------------------------------------

function dragPose(box: Box, local: number, pressed: boolean): Pose {
  const k = ease(local)
  return { x: lerp(box.x, box.x + box.w, k), y: lerp(box.y, box.y + box.h, k), tool: 'cross', pressed }
}

function caretPose(role: RoleScript | undefined, fallback: Point): Pose {
  const caret = role?.caret
  if (caret) return { x: caret.x + 2, y: caret.y + caret.h * 0.55, tool: 'ibeam', pressed: false }
  return { x: fallback.x, y: fallback.y, tool: 'arrow', pressed: false }
}

/**
 * Dónde está y qué herramienta usa un agente en un punto de la tarea.
 *
 * @param task Tarea en construcción.
 * @param role Posición del agente en la cuadrilla.
 */
export function pose(task: Task, role = 0): Pose {
  const { box } = task
  const { t, dragEnd } = timeline(task)
  const script = task.script?.roles[role]
  const corner = { x: box.x + box.w, y: box.y + box.h }

  switch (task.kind) {
    case 'text': {
      const own = script?.box ?? box
      if (t < dragEnd) return dragPose(own, span(t, 0, dragEnd), true)
      return caretPose(script, { x: own.x, y: own.y + own.h / 2 })
    }
    case 'line': {
      const local = span(t, 0, dragEnd)
      if (task.svgPath) {
        const length = task.svgPath.getTotalLength()
        const point = task.svgPath.getPointAtLength(length * ease(local))
        const matrix = task.svgPath.getScreenCTM()
        const screen = matrix ? new DOMPoint(point.x, point.y).matrixTransform(matrix) : { x: box.x, y: box.y }
        return { x: screen.x + window.scrollX, y: screen.y + window.scrollY, tool: 'pen', pressed: local > 0.04 && local < 0.97 }
      }
      const y = box.y + box.h / 2
      if (local < 0.16) return { x: box.x, y, tool: 'pen', pressed: local > 0.08 }
      return { x: lerp(box.x, box.x + box.w, ease(span(local, 0.16, 0.86))), y, tool: 'pen', pressed: local > 0.84 }
    }
    case 'media': {
      // La cruz baja por el borde derecho mientras barre la imagen.
      const k = ease(span(t, 0, dragEnd))
      if (t < dragEnd) return { x: box.x + box.w, y: lerp(box.y, box.y + box.h, k), tool: 'cross', pressed: true }
      return caretPose(script, corner)
    }
    case 'dup': {
      if (!task.master) {
        if (t < dragEnd) return dragPose(box, span(t, 0, dragEnd), t > 0.02)
        return caretPose(script, corner)
      }
      const from = task.master.box
      const select = 0.08
      if (t < select) return { x: from.x + from.w / 2, y: from.y + from.h / 2, tool: 'arrow', pressed: t > 0.04 }
      if (t < dragEnd) {
        const k = ease(span(t, select, dragEnd))
        return { x: lerp(from.x, box.x, k) + box.w / 2, y: lerp(from.y, box.y, k) + box.h / 2, tool: 'move', pressed: true }
      }
      return caretPose(script, { x: box.x + box.w / 2, y: box.y + box.h / 2 })
    }
    case 'network':
      return networkPose(task, role, t, dragEnd)
    case 'converge':
      return convergePose(task, role, t, dragEnd)
    default:
      if (t < dragEnd) return dragPose(box, span(t, 0, dragEnd), t > 0.02)
      return caretPose(script, corner)
  }
}

// ---------------------------------------------------------------------------
// Momentos de varios agentes
// ---------------------------------------------------------------------------

/** Segundos de la red antes de que el agente principal saque el bloque. */
const NETWORK_EDGES = 0.8

/** Nodos de la red: un polígono dentro de la caja, uno por agente. */
export function networkNodes(task: Task): Point[] {
  const { box } = task
  const count = Math.max(1, task.crew.length || task.crewSize)
  const cx = box.x + box.w / 2
  const cy = box.y + Math.min(box.h, 480) / 2
  const radius = Math.min(box.w, 480) * 0.26
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
    return { x: cx + Math.cos(angle) * radius * 1.3, y: cy + Math.sin(angle) * radius * 0.75 }
  })
}

function networkPose(task: Task, role: number, t: number, dragEnd: number): Pose {
  const nodes = networkNodes(task)
  const node = nodes[role] ?? nodes[0]
  const bob = Math.sin(performance.now() / 260 + role) * 3
  if (role === 0 && t > NETWORK_EDGES) {
    const { box } = task
    if (t < dragEnd) {
      const k = ease(span(t, NETWORK_EDGES, dragEnd))
      return { x: lerp(box.x + box.w / 2, box.x + box.w, k), y: lerp(box.y + box.h / 2, box.y + box.h, k), tool: 'cross', pressed: true }
    }
    return caretPose(task.script?.roles[0], { x: box.x + box.w, y: box.y + box.h })
  }
  return { x: node.x, y: node.y + bob, tool: 'arrow', pressed: false }
}

function perimeterPoint(box: Box, fraction: number, margin: number): Point {
  const x = box.x - margin
  const y = box.y - margin
  const w = box.w + margin * 2
  const h = box.h + margin * 2
  let d = (((fraction % 1) + 1) % 1) * (2 * (w + h))
  if (d < w) return { x: x + d, y }
  d -= w
  if (d < h) return { x: x + w, y: y + d }
  d -= h
  if (d < w) return { x: x + w - d, y: y + h }
  return { x, y: y + h - (d - w) }
}

function convergePose(task: Task, role: number, t: number, dragEnd: number): Pose {
  if (role === 0 && t >= dragEnd) return caretPose(task.script?.roles[0], { x: task.box.x, y: task.box.y })
  const count = Math.max(1, task.crew.length || task.crewSize)
  const point = perimeterPoint(task.box, role / count + span(t, 0, dragEnd) * 0.08, 16)
  const k = ease(span(t, dragEnd, task.duration))
  const cx = task.box.x + task.box.w / 2
  const cy = task.box.y + task.box.h / 2
  return { x: point.x + (point.x - cx) * k * 1.6, y: point.y + (point.y - cy) * k * 2.4, tool: 'arrow', pressed: t > dragEnd - 0.06 && t < dragEnd + 0.03 }
}

// ---------------------------------------------------------------------------
// Dibujo en el lienzo (solo mientras la tarea está en construcción)
// ---------------------------------------------------------------------------

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.globalAlpha = 1
  ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'
  const width = ctx.measureText(text).width + 10
  ctx.fillStyle = SELECTION
  ctx.beginPath()
  ctx.roundRect(x - width / 2, y, width, 16, 2)
  ctx.fill()
  ctx.fillStyle = NODE_FILL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 8.5)
  ctx.textAlign = 'start'
}

function anchor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = NODE_FILL
  ctx.strokeStyle = SELECTION
  ctx.lineWidth = 1.5
  ctx.fillRect(x - 3.5, y - 3.5, 7, 7)
  ctx.strokeRect(x - 3.5, y - 3.5, 7, 7)
}

function spacing(ctx: CanvasRenderingContext2D, from: Box, to: Box): void {
  const sameRow = Math.abs(from.y - to.y) < 6
  ctx.globalAlpha = 1
  ctx.strokeStyle = SELECTION
  ctx.lineWidth = 1
  ctx.beginPath()
  let gap: number
  let labelX: number
  let labelY: number
  if (sameRow) {
    const y = to.y + to.h / 2
    const start = from.x + from.w
    gap = to.x - start
    ctx.moveTo(start, y)
    ctx.lineTo(to.x, y)
    labelX = start + gap / 2
    labelY = y + 6
  } else {
    const x = to.x + to.w / 2
    const start = from.y + from.h
    gap = to.y - start
    ctx.moveTo(x, start)
    ctx.lineTo(x, to.y)
    labelX = x + 22
    labelY = start + gap / 2 - 8
  }
  ctx.stroke()
  if (Math.abs(gap) > 1) badge(ctx, `${Math.round(gap)}`, labelX, labelY)
}

function dragBox(ctx: CanvasRenderingContext2D, box: Box, local: number): void {
  const k = ease(local)
  const w = box.w * k
  const h = box.h * k
  ctx.globalAlpha = 1
  ctx.fillStyle = PLACEHOLDER
  ctx.fillRect(box.x, box.y, w, h)
  ctx.strokeStyle = SELECTION
  ctx.setLineDash([4, 3])
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, w, h)
  ctx.setLineDash([])
  if (w > 24) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, box.x + w / 2, box.y + h + 6)
}

function carets(ctx: CanvasRenderingContext2D, script: Script | null, typing: boolean): void {
  if (!script || !typing || Math.floor(performance.now() / 420) % 2 !== 0) return
  ctx.globalAlpha = 1
  ctx.fillStyle = SELECTION
  for (const role of script.roles) {
    const caret = role.caret
    if (caret && role.shown < role.glyphs.length) ctx.fillRect(caret.x + 1, caret.y + 2, 1.5, caret.h - 4)
  }
}

/**
 * Dibuja lo que acompaña a la tarea mientras se construye. El contexto ya está trasladado al
 * documento. Al terminar la tarea no se vuelve a llamar: no queda nada.
 */
export function draw(ctx: CanvasRenderingContext2D, task: Task): void {
  const { box } = task
  const { t, dragEnd } = timeline(task)
  const typing = t >= dragEnd
  ctx.save()
  ctx.lineWidth = 1

  switch (task.kind) {
    case 'text':
      for (const role of task.script?.roles ?? []) {
        if (t >= dragEnd) continue
        const k = ease(span(t, 0, dragEnd))
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = SELECTION
        ctx.strokeRect(role.box.x - 2, role.box.y - 2, role.box.w * k + 4, role.box.h * k + 4)
      }
      break
    case 'line': {
      const local = span(t, 0, dragEnd)
      if (task.svgPath) {
        const length = task.svgPath.getTotalLength()
        const matrix = task.svgPath.getScreenCTM()
        if (matrix && local > 0.02) {
          const start = new DOMPoint(task.svgPath.getPointAtLength(0).x, task.svgPath.getPointAtLength(0).y).matrixTransform(matrix)
          anchor(ctx, start.x + window.scrollX, start.y + window.scrollY)
          if (local > 0.96) {
            const end = new DOMPoint(task.svgPath.getPointAtLength(length).x, task.svgPath.getPointAtLength(length).y).matrixTransform(matrix)
            anchor(ctx, end.x + window.scrollX, end.y + window.scrollY)
          }
        }
        break
      }
      const y = box.y + box.h / 2
      if (local > 0.08) anchor(ctx, box.x, y)
      if (local > 0.16) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.beginPath()
        ctx.moveTo(box.x, y)
        ctx.lineTo(lerp(box.x, box.x + box.w, ease(span(local, 0.16, 0.86))), y)
        ctx.stroke()
      }
      if (local > 0.84) anchor(ctx, box.x + box.w, y)
      break
    }
    case 'media':
      if (t < dragEnd) {
        const k = ease(span(t, 0, dragEnd))
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.setLineDash([4, 3])
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h)
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(box.x, box.y + box.h * k)
        ctx.lineTo(box.x + box.w, box.y + box.h * k)
        ctx.stroke()
      }
      break
    case 'dup':
      if (task.master && t < dragEnd) {
        const from = task.master.box
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.lineWidth = 1.5
        ctx.strokeRect(from.x - 1, from.y - 1, from.w + 2, from.h + 2)
        if (t > 0.08) {
          const k = ease(span(t, 0.08, dragEnd))
          const ghost: Box = { x: lerp(from.x, box.x, k), y: lerp(from.y, box.y, k), w: box.w, h: box.h }
          ctx.fillStyle = PLACEHOLDER
          ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h)
          ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h)
          if (task.previous && k > 0.6) spacing(ctx, task.previous.box, ghost)
        }
      } else if (!task.master && t < dragEnd) {
        dragBox(ctx, box, span(t, 0, dragEnd))
      }
      break
    case 'network':
      drawNetwork(ctx, task, t, dragEnd)
      break
    case 'converge':
      if (t < dragEnd + 0.12) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.lineWidth = 1.5
        ctx.setLineDash(t < dragEnd ? [5, 4] : [])
        ctx.strokeRect(box.x - 14, box.y - 14, box.w + 28, box.h + 28)
        ctx.setLineDash([])
      }
      break
    default:
      if (t < dragEnd) dragBox(ctx, box, span(t, 0, dragEnd))
  }
  carets(ctx, task.script, typing)
  ctx.restore()
}

function drawNetwork(ctx: CanvasRenderingContext2D, task: Task, t: number, dragEnd: number): void {
  const nodes = networkNodes(task)
  const reveal = span(t, 0, NETWORK_EDGES)
  const fade = 1 - span(t, task.duration - 0.3, task.duration)
  const now = performance.now() / 1000

  const edges: [Point, Point][] = []
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) edges.push([nodes[i], nodes[j]])
  edges.forEach(([a, b], index) => {
    const local = clamp(reveal * edges.length - index)
    if (local <= 0) return
    ctx.globalAlpha = 0.6 * fade
    ctx.strokeStyle = SELECTION
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(lerp(a.x, b.x, local), lerp(a.y, b.y, local))
    ctx.stroke()
    if (local >= 1) {
      const k = (now * 0.6 + index * 0.17) % 1
      ctx.globalAlpha = fade
      ctx.fillStyle = SELECTION
      ctx.beginPath()
      ctx.arc(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 2, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  for (const node of nodes) {
    ctx.globalAlpha = fade
    ctx.fillStyle = NODE_FILL
    ctx.strokeStyle = SELECTION
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(node.x, node.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (t > NETWORK_EDGES && t < dragEnd) {
    const { box } = task
    const k = ease(span(t, NETWORK_EDGES, dragEnd))
    const x = lerp(box.x + box.w / 2, box.x, k)
    const y = lerp(box.y + box.h / 2, box.y, k)
    const w = box.w * k
    const h = box.h * k
    ctx.globalAlpha = 1
    ctx.fillStyle = PLACEHOLDER
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = SELECTION
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
    ctx.setLineDash([])
    if (w > 40) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, x + w / 2, y + h + 6)
  }
}
