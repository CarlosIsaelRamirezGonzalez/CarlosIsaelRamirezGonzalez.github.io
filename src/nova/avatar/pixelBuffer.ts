/** Color como canales rojo, verde y azul, de 0 a 255. */
export type RGB = readonly [number, number, number]

/**
 * Convierte un color hexadecimal a canales.
 *
 * @param value - Color con formato `#RRGGBB`.
 * @returns El color como canales RGB.
 */
export const hex = (value: string): RGB => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
]

/**
 * Interpola entre dos colores.
 *
 * @param a - Color inicial.
 * @param b - Color final.
 * @param t - Avance de 0 (`a`) a 1 (`b`).
 * @returns El color intermedio.
 */
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/**
 * Empaqueta un color opaco en el formato de 32 bits del lienzo.
 *
 * @param c - Color como canales RGB.
 * @returns El píxel listo para escribirse en el buffer.
 */
export const pack = (c: RGB): number =>
  ((255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0

/** Lienzo de píxeles reales: todo cae en coordenadas enteras, sin suavizado. */
export class PixelBuffer {
  readonly size: number
  readonly image: ImageData
  /** Fracción visible de los píxeles; se usa para que Nova se materialice al aparecer. */
  reveal = 1

  private readonly pixels: Uint32Array
  private readonly noise: Float32Array

  /**
   * Reserva el lienzo y su ruido de aparición.
   *
   * @param size - Lado del lienzo en píxeles.
   */
  constructor(size: number) {
    this.size = size
    this.image = new ImageData(size, size)
    this.pixels = new Uint32Array(this.image.data.buffer)
    this.noise = new Float32Array(size * size)

    // Valor pseudoaleatorio fijo por píxel: decide en qué momento aparece cada uno.
    for (let i = 0; i < this.noise.length; i++) {
      const wave = Math.sin(i * 12.9898) * 43758.5453
      this.noise[i] = wave - Math.floor(wave)
    }
  }

  /** Deja todo el lienzo transparente. */
  clear() {
    this.pixels.fill(0)
  }

  /**
   * Escribe un píxel opaco.
   *
   * @param x - Columna; se redondea al píxel más cercano.
   * @param y - Fila; se redondea al píxel más cercano.
   * @param color - Color empaquetado con {@link pack}.
   */
  set(x: number, y: number, color: number) {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.size || py >= this.size) return
    const index = py * this.size + px
    if (this.reveal < 1 && this.noise[index] > this.reveal) return
    this.pixels[index] = color
  }

  /**
   * Mezcla un color translúcido sobre lo que ya hay en un píxel.
   *
   * @param x - Columna del píxel.
   * @param y - Fila del píxel.
   * @param c - Color que se aplica.
   * @param alpha - Opacidad, de 0 a 1.
   */
  blend(x: number, y: number, c: RGB, alpha: number) {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.size || py >= this.size) return
    const index = py * this.size + px
    if (this.reveal < 1 && this.noise[index] > this.reveal) return

    // Composición "over": combina ambos colores según sus opacidades.
    const under = this.pixels[index]
    const underAlpha = (under >>> 24) / 255
    const outAlpha = alpha + underAlpha * (1 - alpha)
    if (outAlpha <= 0) return
    const channel = (value: number, shift: number) =>
      Math.round(
        (value * alpha + ((under >>> shift) & 255) * underAlpha * (1 - alpha)) / outAlpha,
      )
    this.pixels[index] =
      ((Math.round(outAlpha * 255) << 24) |
        (channel(c[2], 16) << 16) |
        (channel(c[1], 8) << 8) |
        channel(c[0], 0)) >>>
      0
  }

  /**
   * Dibuja un círculo relleno.
   *
   * @param cx - Columna del centro.
   * @param cy - Fila del centro.
   * @param radius - Radio en píxeles.
   * @param color - Color empaquetado.
   */
  disc(cx: number, cy: number, radius: number, color: number) {
    const r = Math.ceil(radius)
    const limit = radius * radius
    const ox = Math.round(cx)
    const oy = Math.round(cy)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= limit) this.set(ox + dx, oy + dy, color)
      }
    }
  }

  /**
   * Dibuja un óvalo cuyas esquinas son más cuadradas cuanto mayor es `power`.
   *
   * @param cx - Columna del centro.
   * @param cy - Fila del centro.
   * @param rx - Radio horizontal.
   * @param ry - Radio vertical.
   * @param power - Exponente de la forma; 2 es una elipse normal.
   * @param color - Color empaquetado.
   */
  rounded(cx: number, cy: number, rx: number, ry: number, power: number, color: number) {
    const ox = Math.round(cx)
    const oy = Math.round(cy)
    for (let dy = -Math.ceil(ry); dy <= ry; dy++) {
      for (let dx = -Math.ceil(rx); dx <= rx; dx++) {
        // Sin el margen, cada eje acaba en un píxel suelto que parece una marca.
        if (Math.abs(dx / rx) ** power + Math.abs(dy / ry) ** power <= 0.97) {
          this.set(ox + dx, oy + dy, color)
        }
      }
    }
  }

  /**
   * Dibuja un resplandor en bandas, como lo haría un artista de pixel art.
   *
   * @param cx - Columna del centro.
   * @param cy - Fila del centro.
   * @param radius - Alcance del resplandor.
   * @param c - Color de la luz.
   * @param peak - Opacidad máxima en el centro.
   * @param bands - Número de escalones de intensidad.
   */
  glow(cx: number, cy: number, radius: number, c: RGB, peak: number, bands = 4) {
    const r = Math.ceil(radius)
    const ox = Math.round(cx)
    const oy = Math.round(cy)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const distance = Math.hypot(dx, dy) / radius
        if (distance >= 1) continue
        const band = Math.ceil((1 - distance) * bands) / bands
        this.blend(ox + dx, oy + dy, c, peak * band * band)
      }
    }
  }

  /**
   * Dibuja un mapa de bits escrito como texto; cada espacio es transparente.
   *
   * @param rows - Filas del dibujo.
   * @param x - Columna de la esquina superior izquierda.
   * @param y - Fila de la esquina superior izquierda.
   * @param color - Color empaquetado.
   */
  glyph(rows: readonly string[], x: number, y: number, color: number) {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] !== ' ') this.set(Math.round(x) + dx, Math.round(y) + dy, color)
      }
    })
  }
}
