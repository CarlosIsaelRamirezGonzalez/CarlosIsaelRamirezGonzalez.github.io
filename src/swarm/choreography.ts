/**
 * Coreografía de cada tipo de tarea.
 *
 * Todo depende solo del avance (`progress`, de 0 a 1): dónde está el cursor, qué se dibuja en
 * el lienzo y cómo se ve el elemento real. Por eso la animación es reversible: si el avance
 * baja, la tarea se desarma por el mismo camino.
 */
import type { Box, Point, Pose, Task, Typing } from './types'

const SELECTION = '#46D2E1'
const GUIDE = '#FF7A7A'
const WARM = '#FFB454'
const PLACEHOLDER = 'rgba(147, 168, 202, 0.10)'

/** Fin del arrastre en cajas e imágenes: el relleno aparece justo después, con el cursor ahí. */
const DRAG_END = 0.68
/** Fin del relleno. */
const FILL_END = 0.82

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (from: number, to: number, t: number): number => from + (to - from) * t
/** Avance local dentro del tramo [start, end] del avance total. */
const span = (p: number, start: number, end: number): number => clamp((p - start) / (end - start))

/** Tramos de una tarea de texto: guía opcional, caja y tecleo. */
function textPhases(task: Task): { guide: number; box: number } {
  const guide = task.guide ? 0.22 : 0
  return { guide, box: guide + 0.14 }
}

// ---------------------------------------------------------------------------
// Tecleo
// ---------------------------------------------------------------------------

/** Si el texto se puede teclear letra por letra (no tiene otros elementos adentro). */
const isPlainText = (el: HTMLElement): boolean => el.children.length === 0

/**
 * Prepara un texto para teclearlo: la parte no escrita sigue ocupando su lugar, invisible,
 * así la página no se mueve mientras se escribe.
 */
function startTyping(task: Task): Typing {
  const full = task.el.textContent ?? ''
  const typed = document.createTextNode('')
  const rest = document.createTextNode(full)
  const hidden = document.createElement('span')
  hidden.style.visibility = 'hidden'
  hidden.append(rest)
  task.el.replaceChildren(typed, hidden)
  return { full, typed, rest, shown: 0, caret: { x: task.box.x, y: task.box.y, w: 0, h: task.box.h } }
}

/** Devuelve el texto a su forma original cuando ya está completo o desarmado. */
function stopTyping(task: Task): void {
  if (!task.typing) return
  task.el.textContent = task.typing.full
  task.typing = null
}

/** Muestra las primeras `count` letras y ubica el cursor de texto al final de ellas. */
function showCharacters(task: Task, typing: Typing, count: number): void {
  if (count === typing.shown) return
  typing.shown = count
  typing.typed.data = typing.full.slice(0, count)
  typing.rest.data = typing.full.slice(count)

  if (count === 0) {
    typing.caret = { x: task.box.x, y: task.box.y, w: 0, h: Math.min(task.box.h, 40) }
    return
  }
  const range = document.createRange()
  range.setStart(typing.typed, count - 1)
  range.setEnd(typing.typed, count)
  const rects = range.getClientRects()
  const last = rects[rects.length - 1]
  if (last) {
    typing.caret = { x: last.right + window.scrollX, y: last.top + window.scrollY, w: 0, h: last.height }
  }
}

// ---------------------------------------------------------------------------
// Pose del cursor
// ---------------------------------------------------------------------------

/**
 * Dónde está el cursor y qué herramienta usa en un punto de la tarea.
 *
 * @param task Tarea en construcción.
 * @param role Posición del agente en la cuadrilla (solo importa en tareas de varios agentes).
 * @returns La pose en coordenadas del documento.
 */
export function pose(task: Task, role = 0): Pose {
  const { box, progress: p } = task
  switch (task.kind) {
    case 'network':
      return networkPose(task, role)
    case 'converge':
      return convergePose(task, role)
    case 'text': {
      const phases = textPhases(task)
      if (p < phases.guide) {
        // Arrastra la guía desde la regla izquierda.
        const t = ease(span(p, 0, phases.guide))
        return { x: lerp(8, box.x, t), y: box.y + box.h / 2, tool: 'arrow', pressed: true }
      }
      if (p < phases.box) {
        const t = ease(span(p, phases.guide, phases.box))
        return { x: lerp(box.x, box.x + box.w, t), y: lerp(box.y, box.y + box.h, t), tool: 'cross', pressed: true }
      }
      const caret = task.typing?.caret
      if (caret) return { x: caret.x + 2, y: caret.y + caret.h * 0.55, tool: 'ibeam', pressed: false }
      const t = span(p, phases.box, 1)
      return { x: lerp(box.x, box.x + box.w, t), y: box.y + box.h / 2, tool: 'ibeam', pressed: false }
    }
    case 'line': {
      const y = box.y + box.h / 2
      if (p < 0.15) return { x: box.x, y, tool: 'pen', pressed: p > 0.08 }
      const t = ease(span(p, 0.15, 0.8))
      return { x: lerp(box.x, box.x + box.w, t), y, tool: 'pen', pressed: p > 0.74 && p < 0.86 }
    }
    case 'dup': {
      if (!task.master) return dragPose(box, p)
      const from = task.master.box
      if (p < 0.2) {
        const t = ease(span(p, 0, 0.2))
        return { x: from.x + from.w / 2, y: lerp(from.y + 10, from.y + from.h / 2, t), tool: 'arrow', pressed: p > 0.14 }
      }
      const t = ease(span(p, 0.2, 0.8))
      return {
        x: lerp(from.x, box.x, t) + box.w / 2,
        y: lerp(from.y, box.y, t) + box.h / 2,
        tool: 'move',
        pressed: p < 0.8,
      }
    }
    default:
      return dragPose(box, p)
  }
}

/** Arrastre en diagonal de una caja: de la esquina superior izquierda a la inferior derecha. */
function dragPose(box: Box, p: number): Pose {
  const t = ease(span(p, 0, DRAG_END))
  return {
    x: lerp(box.x, box.x + box.w, t),
    y: lerp(box.y, box.y + box.h, t),
    tool: p < DRAG_END ? 'cross' : 'arrow',
    pressed: p > 0.02 && p < DRAG_END,
  }
}

// ---------------------------------------------------------------------------
// Elemento real
// ---------------------------------------------------------------------------

/**
 * Ajusta el elemento real del DOM al avance de la tarea.
 *
 * @param task Tarea cuyo elemento se actualiza.
 */
export function apply(task: Task): void {
  const { el, progress: p } = task
  const style = el.style

  if (p >= 1) {
    stopTyping(task)
    style.opacity = '1'
    style.transform = ''
    style.clipPath = ''
    return
  }

  switch (task.kind) {
    case 'text': {
      const phases = textPhases(task)
      const t = span(p, phases.box, 1)
      if (p <= phases.box) {
        stopTyping(task)
        style.opacity = '0'
        break
      }
      style.opacity = '1'
      if (isPlainText(el)) {
        task.typing ??= startTyping(task)
        showCharacters(task, task.typing, Math.round(task.typing.full.length * t))
      } else {
        style.clipPath = `inset(0 ${(1 - t) * 100}% 0 0)`
      }
      const snap = task.guide ? (1 - span(p, phases.box, phases.box + 0.08)) * -10 : 0
      // Los títulos crecen a saltos, como si se cambiara el tamaño de letra.
      const scale = task.grow ? 0.4 + 0.6 * Math.min(1, Math.floor(t * 5) / 4) : 1
      style.transformOrigin = 'left bottom'
      style.transform = `translateX(${snap}px) scale(${scale})`
      break
    }
    case 'line':
      style.opacity = p > 0.8 ? '1' : '0'
      break
    case 'network':
      style.opacity = String(span(p, 0.72, 0.82))
      break
    case 'converge':
      style.opacity = String(span(p, 0.42, 0.52))
      break
    case 'media': {
      const t = span(p, DRAG_END, FILL_END)
      style.opacity = t > 0 ? '1' : '0'
      // La imagen se barre de arriba hacia abajo.
      style.clipPath = `inset(0 0 ${(1 - t) * 100}% 0)`
      break
    }
    case 'dup':
      style.opacity = String(task.master ? span(p, 0.8, 0.9) : span(p, DRAG_END, FILL_END))
      break
    default:
      style.opacity = String(span(p, DRAG_END, FILL_END))
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
  ctx.fillStyle = '#05080c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 8.5)
  ctx.textAlign = 'start'
}

/** Ancla cuadrada de la herramienta pluma. */
function anchor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#0b1117'
  ctx.strokeStyle = SELECTION
  ctx.lineWidth = 1.5
  ctx.fillRect(x - 3.5, y - 3.5, 7, 7)
  ctx.strokeRect(x - 3.5, y - 3.5, 7, 7)
}

/** Medida roja de la separación entre dos cajas, en horizontal o en vertical. */
function spacing(ctx: CanvasRenderingContext2D, from: Box, to: Box, alpha: number): void {
  const sameRow = Math.abs(from.y - to.y) < 6
  ctx.globalAlpha = alpha
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
    ctx.moveTo(start, y - 4)
    ctx.lineTo(start, y + 4)
    ctx.moveTo(to.x, y - 4)
    ctx.lineTo(to.x, y + 4)
    labelX = start + gap / 2
    labelY = y + 6
  } else {
    const x = to.x + to.w / 2
    const start = from.y + from.h
    gap = to.y - start
    ctx.moveTo(x, start)
    ctx.lineTo(x, to.y)
    ctx.moveTo(x - 4, start)
    ctx.lineTo(x + 4, start)
    ctx.moveTo(x - 4, to.y)
    ctx.lineTo(x + 4, to.y)
    labelX = x + 22
    labelY = start + gap / 2 - 8
  }
  ctx.stroke()
  if (Math.abs(gap) > 1) badge(ctx, `${Math.round(gap)}`, labelX, labelY, GUIDE, alpha)
}

/**
 * Dibuja en el lienzo lo que acompaña a la tarea: cajas punteadas, medidas, guías y anclas.
 * El contexto ya está trasladado, así que se dibuja en coordenadas del documento.
 *
 * @param ctx Contexto del lienzo.
 * @param task Tarea en construcción (avance entre 0 y 1, sin incluirlos).
 * @param viewportHeight Alto de la ventana, para las guías que la cruzan.
 * @param scrollY Desplazamiento vertical actual.
 */
export function draw(ctx: CanvasRenderingContext2D, task: Task, viewportHeight: number, scrollY: number): void {
  const { box, progress: p } = task
  ctx.save()
  ctx.lineWidth = 1

  switch (task.kind) {
    case 'text': {
      const phases = textPhases(task)
      if (task.guide) {
        // Guía vertical: sale de la regla y se queda mientras se escribe.
        const x = lerp(0, box.x, ease(span(p, 0, phases.guide)))
        ctx.globalAlpha = 0.9 * (1 - span(p, 0.85, 1))
        ctx.strokeStyle = GUIDE
        ctx.beginPath()
        ctx.moveTo(x + 0.5, scrollY)
        ctx.lineTo(x + 0.5, scrollY + viewportHeight)
        ctx.stroke()
      }
      if (p > phases.guide) {
        const t = ease(span(p, phases.guide, phases.box))
        ctx.globalAlpha = 0.85 * (1 - span(p, 0.9, 1))
        ctx.strokeStyle = SELECTION
        ctx.strokeRect(box.x - 2, box.y - 2, box.w * t + 4, box.h * t + 4)
      }
      const caret = task.typing?.caret
      if (caret && p > phases.box && Math.floor(performance.now() / 420) % 2 === 0) {
        ctx.globalAlpha = 1
        ctx.fillStyle = SELECTION
        ctx.fillRect(caret.x + 1, caret.y + 2, 1.5, caret.h - 4)
      }
      break
    }
    case 'line': {
      const y = box.y + box.h / 2
      if (p > 0.08) anchor(ctx, box.x, y)
      if (p > 0.15 && p < 0.95) {
        const end = lerp(box.x, box.x + box.w, ease(span(p, 0.15, 0.8)))
        ctx.globalAlpha = 1
        ctx.strokeStyle = SELECTION
        ctx.beginPath()
        ctx.moveTo(box.x, y)
        ctx.lineTo(end, y)
        ctx.stroke()
        if (p > 0.8) anchor(ctx, box.x + box.w, y)
      }
      break
    }
    case 'dup':
      if (task.master) {
        drawCopy(ctx, task)
        break
      }
      drawDrag(ctx, task)
      break
    case 'network':
      drawNetwork(ctx, task)
      break
    case 'converge':
      drawConverge(ctx, task)
      break
    default:
      drawDrag(ctx, task)
  }
  ctx.restore()
}

/** Caja que se arrastra con su medida y luego se rellena. */
function drawDrag(ctx: CanvasRenderingContext2D, task: Task): void {
  const { box, progress: p } = task
  const t = ease(span(p, 0, DRAG_END))
  const w = box.w * t
  const h = box.h * t
  const fade = 1 - span(p, FILL_END, 1)

  ctx.globalAlpha = fade * 0.9
  ctx.fillStyle = PLACEHOLDER
  ctx.fillRect(box.x, box.y, w, h)
  ctx.strokeStyle = SELECTION
  ctx.setLineDash(p < DRAG_END ? [4, 3] : [])
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, w, h)
  ctx.setLineDash([])
  if (w > 24) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, box.x + w / 2, box.y + h + 6, SELECTION, fade)
}

/** Copia: se selecciona la maestra y se arrastra un fantasma hasta su lugar con la separación en rojo. */
function drawCopy(ctx: CanvasRenderingContext2D, task: Task): void {
  const { box, progress: p } = task
  const master = task.master!.box
  const fade = 1 - span(p, 0.85, 1)

  ctx.globalAlpha = fade
  ctx.strokeStyle = SELECTION
  ctx.lineWidth = 1.5
  ctx.strokeRect(master.x - 1, master.y - 1, master.w + 2, master.h + 2)

  if (p > 0.2) {
    const t = ease(span(p, 0.2, 0.8))
    const ghost: Box = { x: lerp(master.x, box.x, t), y: lerp(master.y, box.y, t), w: box.w, h: box.h }
    ctx.fillStyle = PLACEHOLDER
    ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h)
    ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h)
    if (task.previous && t > 0.6) spacing(ctx, task.previous.box, ghost, span(t, 0.6, 1) * fade)
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
  ctx.fillStyle = '#0d141b'
  ctx.fillRect(0, offset, width, size)
  ctx.fillRect(offset, 0, size, height)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
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
    const value = Math.round(y + scrollY)
    const long = value % 100 === 0
    ctx.moveTo(offset + size, y + 0.5)
    ctx.lineTo(offset + size - (long ? 9 : 4), y + 0.5)
  }
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Momentos de varios agentes
// ---------------------------------------------------------------------------

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

function networkPose(task: Task, role: number): Pose {
  const p = task.progress
  const node = networkNodes(task)[role] ?? networkNodes(task)[0]
  const bob = Math.sin(performance.now() / 260 + role) * 3
  if (role === 0 && p > 0.4) {
    // El agente principal saca la tarjeta del centro de la red.
    const { box } = task
    const t = ease(span(p, 0.4, 0.72))
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    return { x: lerp(cx, box.x + box.w, t), y: lerp(cy, box.y + box.h, t), tool: p < 0.72 ? 'cross' : 'arrow', pressed: p < 0.72 }
  }
  return { x: node.x, y: node.y + bob, tool: 'arrow', pressed: false }
}

function drawNetwork(ctx: CanvasRenderingContext2D, task: Task): void {
  const p = task.progress
  const nodes = networkNodes(task)
  const fade = 1 - span(p, 0.82, 1)
  const reveal = span(p, 0, 0.4)
  const now = performance.now() / 1000

  // Aristas: aparecen una por una y llevan pulsos de un nodo a otro.
  const edges: [Point, Point][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) edges.push([nodes[i], nodes[j]])
  }
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
      const t = (now * 0.6 + index * 0.17) % 1
      ctx.globalAlpha = fade
      ctx.fillStyle = index % 3 === 0 ? WARM : SELECTION
      ctx.beginPath()
      ctx.arc(lerp(a.x, b.x, t), lerp(a.y, b.y, t), 2.2, 0, Math.PI * 2)
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

  // La tarjeta crece desde el centro de la red, arrastrada por el agente principal.
  if (p > 0.4) {
    const { box } = task
    const t = ease(span(p, 0.4, 0.72))
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const x = lerp(cx, box.x, t)
    const y = lerp(cy, box.y, t)
    const w = box.w * t
    const h = box.h * t
    ctx.globalAlpha = 0.9 * fade
    ctx.fillStyle = PLACEHOLDER
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = WARM
    ctx.setLineDash(p < 0.72 ? [4, 3] : [])
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
    ctx.setLineDash([])
    if (w > 40) badge(ctx, `${Math.round(w)} × ${Math.round(h)}`, x + w / 2, y + h + 6, WARM, fade)
  }
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

function convergePose(task: Task, role: number): Pose {
  const p = task.progress
  const count = Math.max(1, task.crew.length || task.crewSize)
  const drift = span(p, 0, 0.42) * 0.08
  const point = perimeterPoint(task.box, role / count + drift, 18)
  // Al final se dispersan con calma, alejándose del centro.
  const t = ease(span(p, 0.55, 1))
  const cx = task.box.x + task.box.w / 2
  const cy = task.box.y + task.box.h / 2
  return {
    x: point.x + (point.x - cx) * t * 1.6,
    y: point.y + (point.y - cy) * t * 2.4,
    tool: 'arrow',
    pressed: p > 0.36 && p < 0.44,
  }
}

function drawConverge(ctx: CanvasRenderingContext2D, task: Task): void {
  const p = task.progress
  const fade = 1 - span(p, 0.5, 0.7)
  const { box } = task
  ctx.globalAlpha = 0.9 * fade
  ctx.strokeStyle = WARM
  ctx.lineWidth = 1.5
  ctx.setLineDash(p < 0.36 ? [5, 4] : [])
  ctx.beginPath()
  ctx.roundRect(box.x - 18, box.y - 18, box.w + 36, box.h + 36, 16)
  ctx.stroke()
  ctx.setLineDash([])
}
