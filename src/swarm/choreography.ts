/**
 * Coreografía de cada tipo de tarea, medida en tiempo.
 *
 * Una tarea tiene una fase previa (arrastrar una caja, mover una copia, trazar una línea, reunir
 * agentes) y una fase de tecleo. El avance (`progress`, de 0 a 1) equivale a un instante de esa
 * línea de tiempo, así que todo es reversible y nada ocurre sin su cursor: las cajas aparecen
 * de golpe al soltar el arrastre y cada letra pasa de oculta a visible cuando el caret llega.
 */
import type { Box, Glyph, Point, Pose, RoleScript, Script, Task } from './types'

const SELECTION = '#46D2E1'
const GUIDE = '#FF7A7A'
const WARM = '#FFB454'
const PLACEHOLDER = 'rgba(147, 168, 202, 0.10)'

/** Segundos que tarda la guía en salir de la regla. */
const GUIDE_TIME = 0.25
/** Letras por segundo de un cursor a 1×; cada agente varía un poco. */
const BASE_CPS = 32
/** Ningún bloque tarda más que esto en teclearse a 1×. */
const MAX_TYPING = 3.0
/** Textos más largos que esto se reparten por líneas entre varios agentes. */
export const LONG_TEXT = 100

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (from: number, to: number, t: number): number => from + (to - from) * t
const span = (t: number, start: number, end: number): number => clamp((t - start) / (end - start))
const random = (min: number, max: number): number => min + Math.random() * (max - min)

/** Teclas vecinas para los errores de tecleo. */
const NEIGHBORS = 'qwertyuiopasdfghjklñzxcvbnm'

// ---------------------------------------------------------------------------
// Línea de tiempo
// ---------------------------------------------------------------------------

/** Momentos clave de una tarea, en segundos a 1×. */
interface Timeline {
  t: number
  dragStart: number
  dragEnd: number
  typeStart: number
}

function timeline(task: Task): Timeline {
  const guide = task.kind === 'text' && task.guide ? GUIDE_TIME : 0
  const dragEnd = guide + task.dragTime
  return { t: task.progress * task.duration, dragStart: guide, dragEnd, typeStart: dragEnd }
}

// ---------------------------------------------------------------------------
// Guion de tecleo
// ---------------------------------------------------------------------------

/** Caja que encierra un grupo de letras, en coordenadas del documento. */
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

/**
 * Agrupa las letras por línea visual.
 *
 * @param glyphs Letras en orden.
 * @returns Una lista de letras por línea.
 */
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
 * @param max Máximo de agentes disponibles para ella.
 * @returns Tamaño de la cuadrilla.
 */
export function textCrew(task: Task, max: number): number {
  if (task.kind !== 'text' || task.glyphs.length <= LONG_TEXT) return 1
  return clamp(visualLines(task.glyphs).length, 1, max)
}

/** Tiempos de aparición de cada letra, con ritmo variable, pausas y a veces un error. */
function typeRole(glyphs: Glyph[], calm: boolean, allowTypo: boolean): Pick<RoleScript, 'times' | 'typo' | 'end'> {
  const cps = BASE_CPS * random(0.88, 1.12)
  const times: number[] = []
  let clock = 0
  let typo: RoleScript['typo'] = null
  const typoAt = allowTypo && calm && glyphs.length >= 60 && Math.random() < glyphs.length / 120 ? Math.floor(random(8, glyphs.length - 4)) : -1

  glyphs.forEach((glyph, index) => {
    if (index === typoAt && /\p{L}/u.test(glyph.char)) {
      // Escribe una letra vecina, se da cuenta y la borra.
      const wrong = NEIGHBORS[Math.floor(Math.random() * NEIGHBORS.length)]
      typo = { index, wrong, show: clock, hide: clock + 0.16 }
      clock += 0.22
    }
    clock += (1 / cps) * random(0.85, 1.15)
    times.push(clock)
    if (calm && glyph.char === ' ') clock += 0.018
    if (calm && /[.,;:!?—]/.test(glyph.char)) clock += 0.06
  })

  // Tope por bloque: si no alcanza, este agente escribe más rápido.
  if (clock > MAX_TYPING) {
    const factor = MAX_TYPING / clock
    for (let i = 0; i < times.length; i++) times[i] *= factor
    if (typo) {
      const current: NonNullable<RoleScript['typo']> = typo
      typo = { ...current, show: current.show * factor, hide: current.hide * factor }
    }
    clock = MAX_TYPING
  }
  return { times, typo, end: clock }
}

/**
 * Crea el guion de una tarea al asignarla: reparte sus letras entre la cuadrilla y fija su duración.
 *
 * @param task Tarea que va a empezar.
 * @param crew Agentes asignados.
 * @param calm Si hay calma para pausas y errores (no aplica cuando el enjambre va muy rápido).
 * @returns Cuántos agentes necesita de verdad (las líneas pueden ser menos que los pedidos).
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

  const allowTypo = task.glyphs.length >= 120
  const roles: RoleScript[] = groups.map((glyphs) => ({
    glyphs,
    ...typeRole(glyphs, calm, allowTypo),
    shown: -1,
    typoVisible: false,
    caret: null,
    box: boxOf(glyphs, task.box),
  }))
  task.script = { roles }

  const typing = Math.max(0, ...roles.map((role) => role.end))
  const { typeStart } = timeline(task)
  if (task.kind === 'network') task.duration = typeStart + typing + 0.35
  else if (task.kind === 'converge') task.duration = typeStart + Math.max(typing, 0.9)
  else task.duration = typeStart + typing + 0.04
  return task.kind === 'text' ? roles.length : crew
}

// ---------------------------------------------------------------------------
// Elemento real
// ---------------------------------------------------------------------------

/** Muestra u oculta todas las letras de una tarea. */
function setAll(task: Task, visible: boolean): void {
  const value = visible ? 'visible' : 'hidden'
  for (const glyph of task.glyphs) {
    if (glyph.el.style.visibility !== value) glyph.el.style.visibility = value
    if (glyph.el.textContent !== glyph.char) glyph.el.textContent = glyph.char
  }
  if (task.script) for (const role of task.script.roles) role.shown = visible ? role.glyphs.length : 0
}

/** Ajusta las letras de un agente al instante `elapsed` de su tecleo y ubica su caret. */
function typeTo(role: RoleScript, elapsed: number): void {
  let count = 0
  while (count < role.times.length && role.times[count] <= elapsed) count++
  const typo = role.typo
  const typoVisible = typo !== null && elapsed >= typo.show && elapsed < typo.hide && count <= typo.index
  if (count === role.shown && typoVisible === role.typoVisible) return

  for (let i = 0; i < role.glyphs.length; i++) {
    const glyph = role.glyphs[i]
    const wrongHere = typoVisible && typo !== null && i === typo.index
    const visible = i < count || wrongHere
    glyph.el.style.visibility = visible ? 'visible' : 'hidden'
    const char = wrongHere && typo ? typo.wrong : glyph.char
    if (glyph.el.textContent !== char) glyph.el.textContent = char
  }
  role.shown = count
  role.typoVisible = typoVisible

  // El caret queda justo después de la última letra visible.
  const lastIndex = typoVisible && typo ? typo.index : count - 1
  const last = role.glyphs[lastIndex]
  if (last) {
    const rect = last.el.getBoundingClientRect()
    role.caret = { x: rect.right + window.scrollX, y: rect.top + window.scrollY, w: 0, h: rect.height }
  } else {
    role.caret = { x: role.box.x, y: role.box.y, w: 0, h: Math.min(role.box.h, 40) }
  }
}

/**
 * Ajusta el elemento real del DOM al avance de la tarea. Sin transiciones: cada cosa está o no está.
 *
 * @param task Tarea cuyo elemento se actualiza.
 */
export function apply(task: Task): void {
  const { el, progress: p } = task
  const style = el.style

  if (p >= 1) {
    setAll(task, true)
    style.opacity = '1'
    style.transform = ''
    style.clipPath = ''
    return
  }

  const { t, dragEnd, typeStart } = timeline(task)
  // La caja (borde y fondo) aparece completa al soltar el arrastre; el texto no tiene caja propia.
  const boxVisible = task.kind === 'text' || (p > 0 && t >= dragEnd)
  style.opacity = boxVisible ? '1' : '0'

  if (p <= 0 || !task.script) {
    setAll(task, false)
  } else {
    for (const role of task.script.roles) typeTo(role, t - typeStart)
  }

  if (task.kind === 'media') {
    // La imagen se barre de arriba hacia abajo siguiendo al cursor.
    const sweep = span(t, dragEnd * 0.4, dragEnd)
    style.clipPath = `inset(0 0 ${(1 - sweep) * 100}% 0)`
  }
  if (task.grow && task.script) {
    // Los títulos crecen a saltos, como si se cambiara el tamaño de letra mientras se escribe.
    const role = task.script.roles[0]
    const fraction = role.glyphs.length ? Math.max(0, role.shown) / role.glyphs.length : 1
    const scale = 0.55 + 0.45 * Math.min(1, Math.floor(fraction * 4) / 3)
    style.transformOrigin = 'left bottom'
    style.transform = `scale(${scale})`
  }
}

// ---------------------------------------------------------------------------
// Pose del cursor
// ---------------------------------------------------------------------------

/** Arrastre en diagonal de una caja. */
function dragPose(box: Box, local: number, pressed: boolean): Pose {
  const k = ease(local)
  return { x: lerp(box.x, box.x + box.w, k), y: lerp(box.y, box.y + box.h, k), tool: 'cross', pressed }
}

/** Pose de tecleo: el cursor de texto sigue al caret. */
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
 * @returns La pose en coordenadas del documento.
 */
export function pose(task: Task, role = 0): Pose {
  const { box } = task
  const { t, dragStart, dragEnd } = timeline(task)
  const script = task.script?.roles[role]
  const corner = { x: box.x + box.w, y: box.y + box.h }

  switch (task.kind) {
    case 'text': {
      const own = script?.box ?? box
      if (t < dragStart) {
        // Arrastra la guía desde la regla izquierda.
        return { x: lerp(8, own.x, ease(span(t, 0, dragStart))), y: own.y + own.h / 2, tool: 'arrow', pressed: true }
      }
      if (t < dragEnd) return dragPose(own, span(t, dragStart, dragEnd), true)
      return caretPose(script, { x: own.x, y: own.y + own.h / 2 })
    }
    case 'line': {
      const y = box.y + box.h / 2
      const local = span(t, 0, dragEnd)
      if (local < 0.16) return { x: box.x, y, tool: 'pen', pressed: local > 0.08 }
      return { x: lerp(box.x, box.x + box.w, ease(span(local, 0.16, 0.86))), y, tool: 'pen', pressed: local > 0.84 }
    }
    case 'dup': {
      if (!task.master) {
        if (t < dragEnd) return dragPose(box, span(t, 0, dragEnd), t > 0.02)
        return caretPose(script, corner)
      }
      const from = task.master.box
      const select = 0.12
      if (t < select) return { x: from.x + from.w / 2, y: from.y + from.h / 2, tool: 'arrow', pressed: t > 0.08 }
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

/** Segundos de la red antes de que el agente principal saque la tarjeta. */
const NETWORK_EDGES = 1.1

/**
 * Nodos de la red de NOVA: un polígono dentro de la tarjeta, uno por agente.
 *
 * @param task Tarea de tipo `network`.
 * @returns Los nodos en coordenadas del documento.
 */
export function networkNodes(task: Task): Point[] {
  const { box } = task
  const count = task.crewSize
  const cx = box.x + box.w / 2
  const cy = box.y + Math.min(box.h, 520) / 2
  const radius = Math.min(box.w, 520) * 0.28
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
    return { x: cx + Math.cos(angle) * radius * 1.35, y: cy + Math.sin(angle) * radius * 0.75 }
  })
}

function networkPose(task: Task, role: number, t: number, dragEnd: number): Pose {
  const nodes = networkNodes(task)
  const node = nodes[role] ?? nodes[0]
  const bob = Math.sin(performance.now() / 260 + role) * 3
  if (role === 0 && t > NETWORK_EDGES) {
    const { box } = task
    if (t < dragEnd) {
      // El agente principal saca la tarjeta del centro de la red.
      const k = ease(span(t, NETWORK_EDGES, dragEnd))
      return { x: lerp(box.x + box.w / 2, box.x + box.w, k), y: lerp(box.y + box.h / 2, box.y + box.h, k), tool: 'cross', pressed: true }
    }
    return caretPose(task.script?.roles[0], { x: box.x + box.w, y: box.y + box.h })
  }
  return { x: node.x, y: node.y + bob, tool: 'arrow', pressed: false }
}

/** Punto a una fracción del perímetro de una caja ampliada. */
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
  if (role === 0 && t >= dragEnd) {
    // El principal escribe el texto del botón; los demás se van.
    return caretPose(task.script?.roles[0], { x: task.box.x, y: task.box.y })
  }
  const count = Math.max(1, task.crew.length || task.crewSize)
  const point = perimeterPoint(task.box, role / count + span(t, 0, dragEnd) * 0.08, 18)
  const k = ease(span(t, dragEnd, task.duration))
  const cx = task.box.x + task.box.w / 2
  const cy = task.box.y + task.box.h / 2
  return {
    x: point.x + (point.x - cx) * k * 1.6,
    y: point.y + (point.y - cy) * k * 2.4,
    tool: 'arrow',
    pressed: t > dragEnd - 0.08 && t < dragEnd + 0.04,
  }
}

// ---------------------------------------------------------------------------
// Dibujo en el lienzo
// ---------------------------------------------------------------------------

/** Etiqueta pequeña con fondo, como las medidas de una herramienta de diseño. */
function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'
  const width = ctx.measureText(text).width + 10
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - width / 2, y, width, 16, 3)
  ctx.fill()
  ctx.fillStyle = '#07101F'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 8.5)
  ctx.textAlign = 'start'
}

/** Ancla cuadrada de la herramienta pluma. */
function anchor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#070E22'
  ctx.strokeStyle = SELECTION
  ctx.lineWidth = 1.5
  ctx.fillRect(x - 3.5, y - 3.5, 7, 7)
  ctx.strokeRect(x - 3.5, y - 3.5, 7, 7)
}

/** Medida roja de la separación entre dos cajas. */
function spacing(ctx: CanvasRenderingContext2D, from: Box, to: Box): void {
  const sameRow = Math.abs(from.y - to.y) < 6
  ctx.globalAlpha = 1
  ctx.strokeStyle = GUIDE
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
  if (Math.abs(gap) > 1) badge(ctx, `${Math.round(gap)}`, labelX, labelY, GUIDE, 1)
}

/** Caja punteada que se arrastra con su medida. */
function dragBox(ctx: CanvasRenderingContext2D, box: Box, local: number, color: string): void {
  const k = ease(local)
  const w = box.w * k
  const h = box.h * k
  ctx.globalAlpha = 0.9
  ctx.fillStyle = PLACEHOLDER
  ctx.fillRect(box.x, box.y, w, h)
  ctx.strokeStyle = color
  ctx.setLineDash([4, 3])
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, w, h)
  ctx.setLineDash([])
  if (w > 24) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, box.x + w / 2, box.y + h + 6, color, 1)
}

/** Caret parpadeante de cada agente que teclea. */
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
 * Dibuja en el lienzo lo que acompaña a la tarea. El contexto ya está trasladado, así que se
 * dibuja en coordenadas del documento.
 *
 * @param ctx Contexto del lienzo.
 * @param task Tarea en construcción.
 * @param viewportHeight Alto de la ventana, para las guías que la cruzan.
 * @param scrollY Desplazamiento vertical actual.
 */
export function draw(ctx: CanvasRenderingContext2D, task: Task, viewportHeight: number, scrollY: number): void {
  const { box } = task
  const { t, dragStart, dragEnd, typeStart } = timeline(task)
  const typing = t >= typeStart
  ctx.save()
  ctx.lineWidth = 1

  switch (task.kind) {
    case 'text': {
      if (task.guide) {
        const x = lerp(0, box.x, ease(span(t, 0, dragStart)))
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = GUIDE
        ctx.beginPath()
        ctx.moveTo(x + 0.5, scrollY)
        ctx.lineTo(x + 0.5, scrollY + viewportHeight)
        ctx.stroke()
      }
      for (const role of task.script?.roles ?? []) {
        if (t < dragStart) continue
        const k = ease(span(t, dragStart, dragEnd))
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = SELECTION
        ctx.strokeRect(role.box.x - 2, role.box.y - 2, role.box.w * k + 4, role.box.h * k + 4)
      }
      break
    }
    case 'line': {
      const y = box.y + box.h / 2
      const local = span(t, 0, dragEnd)
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
    case 'dup':
      if (task.master && t < dragEnd) {
        const from = task.master.box
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.lineWidth = 1.5
        ctx.strokeRect(from.x - 1, from.y - 1, from.w + 2, from.h + 2)
        if (t > 0.12) {
          const k = ease(span(t, 0.12, dragEnd))
          const ghost: Box = { x: lerp(from.x, box.x, k), y: lerp(from.y, box.y, k), w: box.w, h: box.h }
          ctx.fillStyle = PLACEHOLDER
          ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h)
          ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h)
          if (task.previous && k > 0.6) spacing(ctx, task.previous.box, ghost)
        }
      } else if (!task.master && t < dragEnd) {
        dragBox(ctx, box, span(t, 0, dragEnd), SELECTION)
      }
      break
    case 'network':
      drawNetwork(ctx, task, t, dragEnd)
      break
    case 'converge':
      if (t < dragEnd + 0.15) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = WARM
        ctx.lineWidth = 1.5
        ctx.setLineDash(t < dragEnd ? [5, 4] : [])
        ctx.beginPath()
        ctx.roundRect(box.x - 18, box.y - 18, box.w + 36, box.h + 36, 16)
        ctx.stroke()
        ctx.setLineDash([])
      }
      break
    default:
      if (t < dragEnd) dragBox(ctx, box, span(t, 0, dragEnd), SELECTION)
  }
  carets(ctx, task.script, typing)
  ctx.restore()
}

function drawNetwork(ctx: CanvasRenderingContext2D, task: Task, t: number, dragEnd: number): void {
  const nodes = networkNodes(task)
  const reveal = span(t, 0, NETWORK_EDGES)
  const fade = 1 - span(t, task.duration - 0.35, task.duration)
  const now = performance.now() / 1000

  // Aristas: aparecen una por una y llevan pulsos de un nodo a otro.
  const edges: [Point, Point][] = []
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) edges.push([nodes[i], nodes[j]])
  edges.forEach(([a, b], index) => {
    const local = clamp(reveal * edges.length - index)
    if (local <= 0) return
    ctx.globalAlpha = 0.55 * fade
    ctx.strokeStyle = SELECTION
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(lerp(a.x, b.x, local), lerp(a.y, b.y, local))
    ctx.stroke()
    if (local >= 1) {
      const k = (now * 0.6 + index * 0.17) % 1
      ctx.globalAlpha = fade
      ctx.fillStyle = index % 3 === 0 ? WARM : SELECTION
      ctx.beginPath()
      ctx.arc(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  for (const node of nodes) {
    ctx.globalAlpha = fade
    ctx.fillStyle = '#070E22'
    ctx.strokeStyle = SELECTION
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(node.x, node.y, 6, 0, Math.PI * 2)
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
    ctx.globalAlpha = 0.9
    ctx.fillStyle = PLACEHOLDER
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = WARM
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
    ctx.setLineDash([])
    if (w > 40) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, x + w / 2, y + h + 6, WARM, 1)
  }
}

/**
 * Reglas superior e izquierda, como en un editor de diseño. Se dibujan en coordenadas de pantalla.
 *
 * @param ctx Contexto del lienzo, sin trasladar.
 * @param width Ancho de la ventana.
 * @param height Alto de la ventana.
 * @param scrollY Desplazamiento vertical, para que las marcas avancen con la página.
 * @param amount Qué tanto están desplegadas, de 0 a 1.
 */
export function drawRulers(ctx: CanvasRenderingContext2D, width: number, height: number, scrollY: number, amount: number): void {
  if (amount <= 0.01) return
  const size = 18
  const offset = (1 - amount) * -size
  ctx.save()
  ctx.globalAlpha = 0.92
  ctx.fillStyle = '#0C1730'
  ctx.fillRect(0, offset, width, size)
  ctx.fillRect(offset, 0, size, height)
  ctx.strokeStyle = 'rgba(147, 168, 202, 0.45)'
  ctx.fillStyle = 'rgba(147, 168, 202, 0.75)'
  ctx.font = '9px "JetBrains Mono", ui-monospace, monospace'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x < width; x += 10) {
    const long = x % 100 === 0
    ctx.moveTo(x + 0.5, offset + size)
    ctx.lineTo(x + 0.5, offset + size - (long ? 9 : 4))
    if (long && x > 0) ctx.fillText(String(x), x + 3, offset + 9)
  }
  for (let y = -(scrollY % 10); y < height; y += 10) {
    const long = Math.round(y + scrollY) % 100 === 0
    ctx.moveTo(offset + size, y + 0.5)
    ctx.lineTo(offset + size - (long ? 9 : 4), y + 0.5)
  }
  ctx.stroke()
  ctx.restore()
}
