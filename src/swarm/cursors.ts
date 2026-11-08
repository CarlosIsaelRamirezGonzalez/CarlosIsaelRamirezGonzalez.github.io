/**
 * Dibujo de los cursores. Cada combinación de color, etiqueta y herramienta se dibuja una sola
 * vez en un lienzo pequeño y luego se copia en cada cuadro: es mucho más barato que trazarlo.
 */
import type { Tool } from './types'

/** Colores de los cursores: uno por agente, siempre el mismo. */
export const COLORS = ['#46D2E1', '#5B93FF', '#A78BFA', '#5EE6A8', '#FFB454', '#FF7A7A']

/** Nombres de los agentes; cada uno conserva el suyo. */
export const NAMES = [
  'frontend-agent',
  'rag-agent',
  'n8n-bot',
  'mcp-client',
  'qdrant-indexer',
  'llm-judge',
  'fastapi-worker',
  'prompt-optimizer',
  'whatsapp-bot',
  'orchestrator',
  'sat-validator',
  'support-agent',
  'doc-parser',
  'ghl-sync',
  'voice-agent',
  'eval-runner',
  'pos-agent',
  'router',
  'vision-agent',
  'sql-agent',
  'handoff-agent',
  'risk-detector',
]

/** Margen alrededor del punto activo del cursor dentro de su lienzo. */
const PAD = 6
const HEIGHT = 40
/** El cursor mide unos 16 px de alto. */
const CURSOR_SCALE = 0.84

const cache = new Map<string, HTMLCanvasElement>()

/** Traza la forma de cada herramienta con el punto activo en (0, 0). */
function traceTool(ctx: CanvasRenderingContext2D, tool: Tool, color: string): void {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  switch (tool) {
    case 'cross':
    case 'ibeam': {
      const path = new Path2D()
      if (tool === 'cross') {
        path.moveTo(-8, 0)
        path.lineTo(8, 0)
        path.moveTo(0, -8)
        path.lineTo(0, 8)
      } else {
        path.moveTo(-3, -9)
        path.lineTo(3, -9)
        path.moveTo(0, -9)
        path.lineTo(0, 9)
        path.moveTo(-3, 9)
        path.lineTo(3, 9)
      }
      ctx.strokeStyle = '#07101F'
      ctx.lineWidth = 3.5
      ctx.stroke(path)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke(path)
      return
    }
    case 'pen': {
      const nib = new Path2D('M0 0 L4 11 L8 13 L13 8 L11 4 Z M4 11 L8 7')
      ctx.fillStyle = color
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.3
      ctx.fill(nib)
      ctx.stroke(nib)
      return
    }
    default: {
      const arrow = new Path2D('M0 0 L0 16 L4.4 12.2 L7.4 19 L10.2 17.8 L7.3 11.2 L13 11.2 Z')
      ctx.fillStyle = color
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.3
      ctx.fill(arrow)
      ctx.stroke(arrow)
      if (tool === 'move') {
        // Marca de duplicar (⌥-arrastrar).
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(12, 14, 9, 9)
        ctx.fillStyle = color
        ctx.fillRect(15.8, 15.5, 1.6, 6)
        ctx.fillRect(13.6, 17.7, 6, 1.6)
      }
    }
  }
}

/**
 * Devuelve el dibujo de un cursor, creándolo la primera vez.
 *
 * @param tool Herramienta.
 * @param color Color del agente.
 * @param label Nombre que se muestra junto al cursor, o `null`.
 * @param ratio Densidad de píxeles de la pantalla.
 * @returns El lienzo con el cursor; su punto activo está en (PAD, PAD).
 */
export function sprite(tool: Tool, color: string, label: string | null, ratio: number): HTMLCanvasElement {
  const key = `${tool}|${color}|${label ?? ''}|${ratio}`
  const cached = cache.get(key)
  if (cached) return cached

  const font = '500 11px "JetBrains Mono", ui-monospace, monospace'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const labelWidth = label ? measure.measureText(label).width + 12 : 0
  const width = label ? 16 + labelWidth + PAD * 2 : 24 + PAD

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * ratio)
  canvas.height = Math.ceil(HEIGHT * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  ctx.translate(PAD, PAD)
  ctx.save()
  ctx.scale(CURSOR_SCALE, CURSOR_SCALE)
  traceTool(ctx, tool, color)
  ctx.restore()

  if (label) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(12, 15, labelWidth, 17, 4)
    ctx.fill()
    ctx.fillStyle = '#07101F'
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 18, 24)
  }
  cache.set(key, canvas)
  return canvas
}

/** Desplazamiento del punto activo dentro del lienzo de cada cursor. */
export const HOTSPOT = PAD
