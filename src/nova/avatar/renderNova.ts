/** Dibujo de Nova: convierte el estado de la simulación en píxeles. */

import { hex, mix, pack, PixelBuffer, type RGB } from './pixelBuffer'
import { CANVAS_SIZE, HEAD_Y, MAX_YAW, type NovaState, type Particle } from './novaState'

// Colores fijos del personaje, que no cambian con la emoción.
const OUTLINE = pack(hex('#16123F'))
const WHITE = pack(hex('#F3F3FF'))
const WHITE_SOFT = pack(hex('#D9D9F7'))
const LAVENDER = pack(hex('#ABA8E8'))
const LAVENDER_DARK = pack(hex('#7E73D6'))
const TAIL = pack(hex('#5B46C4'))
const TAIL_DARK = pack(hex('#3A2A9C'))
const VISOR = pack(hex('#0D0C33'))
const VISOR_EDGE = pack(hex('#262268'))
const CHEST = pack(hex('#3A2A9C'))

// Colores de la compu: la luz de su pantalla, que ilumina a Nova.
const SCREEN_LIGHT = hex('#7FE3FF')
const LAPTOP_LID = pack(hex('#4A4296'))
const LAPTOP_LID_LIGHT = pack(hex('#6C63C4'))

// Colores base del portal; se mezclan con los de la emoción.
const PORTAL_DARK = hex('#2B1E7A')
const PORTAL_MID = hex('#4A3DE0')
const PORTAL_BRIGHT = hex('#8FA2FF')

// Mapas de bits de la letra del pecho y de algunas partículas.
const LETTER_N = ['##   ##', '###  ##', '###  ##', '## # ##', '## # ##', '##  ###', '##  ###', '##   ##']
// Señales que acompañan a cada emoción, como en un cómic.
const CLOUD = ['   ###    ', ' ####### ', '##########', '##########', ' ######## ']
const ANGER_MARK = ['## ##', '#   #', '     ', '#   #', '## ##']
const EXCLAMATION = ['##', '##', '##', '##', '  ', '##']
const SWEAT = ['  #  ', ' ### ', '#####', '#####', ' ### ']
const TANGLE = [' ###### ', '# ##  ##', '##  ## #', ' ## ### ', '  ####  ']
const SCRIBBLE = [' ## # ', '#  # #', ' # ## ', '#  #  ']
const MAGNIFIER = ['  ###  ', ' #   # ', ' #   # ', ' #   # ', '  ###  ', '     # ', '      #']
const DIZZY_STAR = ['  #  ', ' ### ', '#####', ' ### ', ' # # ']
const NOTE = ['  ## ', '  # #', '  #  ', '  #  ', '###  ', '###  ']
const QUESTION = [' ### ', '#   #', '    #', '  ## ', '  #  ', '     ', '  #  ']

// La cabeza y el cuerpo se dibujan como si fueran redondos: al girar, todo se recorre sobre ellos.
const HEAD_RADIUS = 25
const BODY_RADIUS = 14
// Medidas tomadas de la hoja del personaje.
const HELMET_RX = 24.5
const HELMET_RY = 20.5
const VISOR_RY = 14.4
const ARM_REACH = 22
// De perfil, el visor ocupa más del casco, como en la hoja de referencia del personaje.
const VISOR_ANGLE = 0.95
const VISOR_PROFILE_ANGLE = 0.4
// Los ojos y la gema giran menos que el casco: si no, se pegan a la orilla y la cara se pierde.
const FACE_TURN = 0.7
// La gema gira más que la cara: de perfil ya no se ve.
const GEM_TURN = 1.2
// Si el visor se ve más angosto que esto, ya quedó del otro lado de la cabeza.
const MIN_VISOR_HALF = 2.5
// Hojas de fuego que cubren toda la nuca: nacen del cuello y suben por encima del casco.
const NAPE_PETALS = [
  { angle: -1.5, length: 34, width: 8, seed: 1 },
  { angle: 1.52, length: 33, width: 8, seed: 2 },
  { angle: -1.14, length: 38, width: 12, seed: 3 },
  { angle: 1.16, length: 37, width: 12, seed: 4 },
  { angle: -0.74, length: 44, width: 13, seed: 5 },
  { angle: 0.76, length: 43, width: 13, seed: 6 },
  { angle: -0.34, length: 48, width: 13, seed: 7 },
  { angle: 0.36, length: 47, width: 13, seed: 8 },
  { angle: 0.02, length: 52, width: 12, seed: 9 },
]
const NAPE_BASE_Y = 16
// Hasta que la nuca queda bastante de frente, el casco aún se ve y las llamas siguen detrás.
const NAPE_STARTS_AT = 0.6
const NAPE_FULL_AT = 0.9
const EYE_ANGLE = 0.43
const SHOULDER_ANGLE = 1.1
// Por debajo de este ancho aparente, una parte ya quedó del otro lado y no se dibuja.
const MIN_VISIBLE = 0.45

/**
 * Calcula dónde se ve un punto de una superficie redonda que está girando.
 *
 * @param radius - Radio de la superficie.
 * @param angle - Ángulo del punto ya sumado el giro; 0 es de frente.
 * @returns Su distancia al centro y qué tan de frente se ve, de -1 a 1; negativo es atrás.
 */
const onRound = (radius: number, angle: number) => ({
  x: radius * Math.sin(angle),
  facing: Math.cos(angle),
})

/**
 * Lleva un giro al rango de -PI a PI, sin importar cuántas vueltas haya dado.
 *
 * @param yaw - Giro en radianes.
 * @returns El mismo giro, dentro del rango.
 */
const wrapYaw = (yaw: number) => Math.atan2(Math.sin(yaw), Math.cos(yaw))

/** Qué tan de perfil está un giro, de 0 a 1; de frente y de espaldas es 0. */
const profileAmount = (yaw: number) => Math.min(1, Math.abs(Math.sin(yaw)) / Math.sin(MAX_YAW))

/**
 * Una lengua de fuego, medida desde el centro de la cabeza.
 *
 * `bend` es cuánto serpentea, con signo; `width`, su ancho máximo; `glow`, si lleva la veta
 * clara de las lenguas más altas.
 */
type Flame = {
  baseX: number
  baseY: number
  tipX: number
  tipY: number
  bend: number
  width: number
  seed: number
  glow: boolean
}

// Copiadas de la hoja del personaje, de atrás hacia adelante: abajo unas hojas delgadas, luego las
// lenguas de los lados, y al final las de arriba. Cada punta remata curvándose, no en línea recta.
const FLAMES: Flame[] = [
  { baseX: -15, baseY: 16, tipX: -35, tipY: 12, bend: -0.1, width: 3.6, seed: 0, glow: false },
  { baseX: 15, baseY: 16, tipX: 36, tipY: 14, bend: 0.1, width: 3.6, seed: 0.9, glow: false },
  { baseX: -20, baseY: 8, tipX: -40, tipY: -6, bend: 0.1, width: 6, seed: 1.7, glow: false },
  { baseX: 21, baseY: 9, tipX: 42, tipY: 1, bend: -0.13, width: 6, seed: 2.6, glow: false },
  { baseX: -22, baseY: -6, tipX: -33, tipY: -28, bend: 0.16, width: 8, seed: 3.4, glow: false },
  { baseX: 22, baseY: -5, tipX: 44, tipY: -19, bend: -0.2, width: 8, seed: 4.3, glow: false },
  { baseX: 19, baseY: -13, tipX: 32, tipY: -33, bend: -0.2, width: 8.5, seed: 5.1, glow: false },
  { baseX: -20, baseY: -17, tipX: -19, tipY: -44, bend: 0.2, width: 9, seed: 5.9, glow: false },
  { baseX: 9, baseY: -18, tipX: 26, tipY: -43, bend: -0.2, width: 10, seed: 6.7, glow: true },
  { baseX: -9, baseY: -19, tipX: -7, tipY: -36, bend: 0.1, width: 9, seed: 7.6, glow: true },
  { baseX: -2, baseY: -20, tipX: 11, tipY: -62, bend: -0.17, width: 10, seed: 8.4, glow: true },
]
// Cuánto se recargan hacia la nuca las de arriba al girar; las de los lados ya van hacia allá.
const FLAME_LEAN = 0.45
const FLAME_FULLNESS = 1.32
const FLAME_HIGHLIGHTS = [hex('#CA83F9'), hex('#FFFFFF'), hex('#FEE7C5')]

/**
 * Calcula un punto de una lengua, ya girada junto con la cabeza. De frente se ve abierta; de
 * perfil, todas salen hacia la nuca; de espaldas, se ve como en un espejo.
 *
 * @param flame - Lengua que se dibuja.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 * @param s - Avance a lo largo de la lengua, de 0 (base) a 1 (punta).
 * @returns La posición del punto.
 */
function flamePoint(flame: Flame, state: NovaState, hx: number, hy: number, s: number) {
  const { pose } = state
  const growth = pose.hairLength * (1 + state.level * 0.14)
  const dx = (flame.tipX - flame.baseX) * growth
  const dy = (flame.tipY - flame.baseY) * growth
  const length = Math.hypot(dx, dy)

  // Serpentea a lo largo y remata en un gancho; el viento y la emoción la mueven más en la punta.
  const wave = flame.bend * length * (Math.sin(s * Math.PI * 1.75) * 0.7 + s * s * s * 0.55)
  const sway = Math.sin(state.hairPhase * 4.2 + flame.seed - s * 3.4) * pose.hairWild * 2.8 * s * s
  const flick = Math.sin(state.hairPhase * 9 + flame.seed * 2.1) * pose.hairWild * 1.1 * s * s * s
  const droop = pose.hairDroop * length * 0.7 * s * s
  const faceX = flame.baseX + dx * s + (-dy / length) * wave + sway
  const faceY = flame.baseY + dy * s + (dx / length) * wave + droop + flick

  // Gira alrededor del eje vertical de la cabeza.
  const towardNape = Math.abs(faceX) + FLAME_LEAN * Math.max(0, -faceY)
  const windX = Math.max(-16, Math.min(16, -state.grabVx * 0.022)) * state.grabbed * s * s
  const windY = Math.max(-8, Math.min(8, -state.grabVy * 0.012)) * state.grabbed * s * s
  return {
    x: hx + faceX * Math.cos(state.flameYaw) - towardNape * Math.sin(state.flameYaw) + windX,
    y: hy + faceY + windY,
  }
}

/**
 * Calcula el radio de una lengua: gorda cerca de la base y con una punta larga y fina.
 *
 * @param flame - Lengua que se dibuja.
 * @param state - Estado de la animación.
 * @param s - Avance a lo largo de la lengua.
 * @returns El radio en píxeles.
 */
function flameRadius(flame: Flame, state: NovaState, s: number) {
  const ripple = 1 + 0.1 * Math.sin(s * 11 + flame.seed * 3 - state.hairPhase * 6)
  return flame.width * FLAME_FULLNESS * Math.sin(Math.PI * s ** 0.56) ** 1.5 * ripple
}

/**
 * Pinta una capa de color sobre una lengua, desde la base hasta donde indique `end`.
 *
 * @param buffer - Lienzo de destino.
 * @param flame - Lengua que se dibuja.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 * @param color - Color empaquetado.
 * @param widthScale - Fracción del ancho de la lengua.
 * @param end - Hasta qué parte de la lengua llega.
 * @param extra - Píxeles que se agregan al radio, para el borde.
 * @param shift - Cuánto se recorre la capa hacia arriba y a la izquierda, para dar volumen.
 */
function paintFlame(
  buffer: PixelBuffer,
  flame: Flame,
  state: NovaState,
  hx: number,
  hy: number,
  color: number,
  widthScale: number,
  end: number,
  extra: number,
  shift: number,
) {
  const samples = Math.ceil(Math.hypot(flame.tipX - flame.baseX, flame.tipY - flame.baseY) * 1.5)
  for (let i = 0; i <= samples; i++) {
    const s = i / samples
    if (s > end) break
    const point = flamePoint(flame, state, hx, hy, s)
    const radius = flameRadius(flame, state, s) * widthScale + extra * (1 - s * 0.5)
    if (radius > 0.15) buffer.disc(point.x - shift, point.y - shift, radius, color)
  }
}

/**
 * Dibuja todas las lenguas: primero la silueta y luego, capa por capa, su interior más claro.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 */
function drawFlames(buffer: PixelBuffer, state: NovaState, hx: number, hy: number) {
  const { ramp } = state.pose
  const back = pack(ramp.back)
  const deep = pack(ramp.deep)
  const mid = pack(ramp.mid)
  const light = pack(ramp.light)
  const core = pack(ramp.core)

  // Primero las que quedan del otro lado de la cabeza, y encima las más cercanas.
  const depth = (flame: Flame) => -flame.baseX * Math.sin(state.flameYaw)
  const ordered = [...FLAMES].sort((a, b) => depth(a) - depth(b))

  // Un fondo llena los huecos junto a la cabeza: el fuego se ve como una sola masa.
  const massX = hx - Math.sin(state.flameYaw) * 15
  buffer.rounded(massX, hy - 12, 24, 20, 2.2, deep)

  for (const flame of ordered) paintFlame(buffer, flame, state, hx, hy, back, 1, 1, 0.7, 0)
  for (const flame of ordered) {
    paintFlame(buffer, flame, state, hx, hy, deep, 1, 1, 0, 0)
    paintFlame(buffer, flame, state, hx, hy, mid, 0.62, 0.86, 0, 0.6)
    paintFlame(buffer, flame, state, hx, hy, light, 0.25, 0.6, 0, 0.8)
    if (flame.glow) paintFlame(buffer, flame, state, hx, hy, core, 0.13, 0.55, 0, 0.8)

    // Unos brillos sueltos sobre el fuego, que cambian de lugar con su movimiento.
    for (let spot = 0; spot < 3; spot++) {
      const s = 0.3 + spot * 0.2 + Math.sin(state.hairPhase * 2 + flame.seed + spot) * 0.04
      const point = flamePoint(flame, state, hx, hy, s)
      const side = Math.sin(flame.seed * 5 + spot * 2.3) * flameRadius(flame, state, s) * 0.45
      buffer.set(point.x + side, point.y, pack(FLAME_HIGHLIGHTS[(spot + Math.round(flame.seed)) % 3]))
    }
  }
}

/**
 * Dibuja el portal del suelo y los rayos que suben de él.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 */
function drawPortal(buffer: PixelBuffer, state: NovaState) {
  const cx = CANVAS_SIZE / 2 + Math.round(state.x * 0.25)
  const cy = 147
  // El portal se apaga mientras la cargan: ya no está parada sobre él.
  const energy = (0.6 + state.level * 0.4 + Math.max(0, -state.pose.lift) * 0.04) * (1 - state.grabbed * 0.92)
  const ramp = state.pose.ramp

  // Anillos concéntricos: del más ancho y oscuro al más pequeño y brillante.
  const rings: Array<[number, number, RGB]> = [
    [56, 10, mix(PORTAL_DARK, ramp.back, 0.8)],
    [44, 8, mix(PORTAL_DARK, ramp.deep, 0.8)],
    [32, 6, mix(PORTAL_MID, ramp.deep, 0.8)],
    [20, 4, mix(PORTAL_BRIGHT, ramp.mid, 0.8)],
  ]
  rings.forEach(([rx, ry, color], index) => {
    const pulse = Math.sin(state.time * 2.2 - index * 0.9) * 0.1
    const alpha = (0.26 + index * 0.13 + pulse) * energy
    for (let dy = -Math.ceil(ry); dy <= ry; dy++) {
      for (let dx = -Math.ceil(rx); dx <= rx; dx++) {
        const inside = (dx / rx) ** 2 + (dy / ry) ** 2
        if (inside <= 1 && inside > 0.76) buffer.blend(cx + dx, cy + dy, color, Math.min(1, alpha * 2.2))
        else if (inside <= 0.76) buffer.blend(cx + dx, cy + dy, color, alpha * 0.4)
      }
    }
  })

  // Destello del centro: horizontal, como luz sobre el suelo.
  if (state.grabbed > 0.6) return
  const coreLight = pack(mix(ramp.light, hex('#FFFFFF'), 0.5))
  const reach = 7 + Math.round(state.level * 4)
  for (let dx = -reach; dx <= reach; dx++) {
    const thickness = Math.abs(dx) < reach * 0.4 ? 1 : 0
    for (let dy = -thickness; dy <= thickness; dy++) buffer.set(cx + dx, cy + dy, coreLight)
  }
  for (let dy = -3; dy <= 3; dy++) buffer.set(cx, cy + dy, coreLight)

  // Rayos que suben del portal.
  for (let i = 0; i < 15; i++) {
    const x = cx - 42 + i * 6 + Math.round(Math.sin(i * 7.3) * 2)
    const speed = 0.55 + ((i * 37) % 10) / 16
    const cycle = (state.time * speed + i * 0.37) % 1
    const baseY = cy - 2 - cycle * 34
    const height = 3 + (i * 13) % 9
    const color = i % 3 === 0 ? ramp.light : ramp.mid
    for (let j = 0; j < height; j++) {
      buffer.blend(x, baseY - j, color, (1 - cycle) * (1 - j / height) * 0.8 * energy)
    }
  }
}

/**
 * Dibuja las llamas que cubren la nuca: de espaldas no se ve el casco, solo fuego. Van apareciendo
 * desde el lado de atrás conforme gira, y se juntan al centro cuando queda de espaldas.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 */
function drawNapeFlames(buffer: PixelBuffer, state: NovaState, hx: number, hy: number) {
  const nape = onRound(HEAD_RADIUS, state.headYaw - Math.PI)
  if (nape.facing <= NAPE_STARTS_AT) return

  const { ramp, hairLength } = state.pose
  const shown = Math.min(1, (nape.facing - NAPE_STARTS_AT) / (NAPE_FULL_AT - NAPE_STARTS_AT))
  if (shown < 0.45) return
  const centerX = hx + nape.x * 0.3
  const baseY = hy + NAPE_BASE_Y

  const paint = (petal: (typeof NAPE_PETALS)[number], color: number, widthScale: number, end: number, extra: number) => {
    const length = petal.length * hairLength * (1 + state.level * 0.14) * (0.35 + shown * 0.65)
    const samples = Math.ceil(petal.length * 1.1)
    for (let i = 0; i <= samples; i++) {
      const s = i / samples
      if (s > end) break
      const sway = Math.sin(state.hairPhase * 4.2 + petal.seed - s * 3.4) * state.pose.hairWild * 2.6 * s * s
      const droop = state.pose.hairDroop * length * 0.55 * s * s
      const x = centerX + (Math.sin(petal.angle) * length * s + sway) * shown
      const y = baseY - Math.cos(petal.angle) * length * s + droop
      const ripple = 1 + 0.13 * Math.sin(s * 11 + petal.seed * 3 - state.hairPhase * 6)
      const radius = petal.width * Math.sin(Math.PI * s ** 0.56) ** 1.4 * ripple * widthScale * Math.max(0.3, shown) + extra
      if (radius > 0.15) buffer.disc(x, y, radius, color)
    }
  }

  // Una silueta común y luego hoja por hoja, de los lados al centro: se enciman como escamas, y
  // solo las del centro llevan el tono más claro.
  buffer.rounded(centerX, hy - 1, Math.max(1, shown * HELMET_RX), HELMET_RY + 1, 2.45, pack(ramp.deep))
  for (const petal of NAPE_PETALS) paint(petal, pack(ramp.back), 1, 1, 0.6)
  for (const petal of NAPE_PETALS) {
    paint(petal, pack(ramp.deep), 1, 1, 0)
    paint(petal, pack(ramp.mid), 0.68, 0.84, 0)
    if (Math.abs(petal.angle) < 0.5) paint(petal, pack(ramp.light), 0.3, 0.6, 0)
  }
}

/**
 * Dibuja el cuerpo fila por fila: torso, vientre más oscuro y una cola en punta.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param cx - Columna del centro del cuerpo.
 * @param top - Fila donde empieza el cuerpo.
 */
function drawBody(buffer: PixelBuffer, state: NovaState, cx: number, top: number) {
  const height = Math.round(48 * state.bodyStretch)
  const yaw = state.bodyYaw
  const turned = profileAmount(yaw)
  const direction = Math.sign(Math.sin(yaw))
  for (let row = 0; row <= height; row++) {
    // Ancho de la fila: cuello, hombros, vientre y luego la cola, que se afina hasta la punta.
    const t = row / height
    const taper = (t - 0.52) / 0.48
    const frontWidth =
      t < 0.1
        ? 10 + (t / 0.1) * 3.4
        : t < 0.52
          ? 13.4 + ((t - 0.1) / 0.42) * 1.4
          : 14.8 * (1 - taper) ** 0.78 * (1 - taper * taper * 0.18)
    // De perfil es más angosto: el pecho sale hacia el frente y la cola se curva hacia atrás.
    const width = frontWidth * (1 - turned * 0.16)
    const chest = direction * turned * 2 * Math.max(0, 1 - t * 2)
    const tailCurve = -direction * turned * 8 * t * t
    // La cola se balancea más cuanto más cerca está de la punta.
    const center = cx + state.tailSway * t * t * 1.8 + chest + tailCurve
    const left = Math.round(center - width)
    const right = Math.round(center + width)
    for (let x = left; x <= right; x++) {
      const across = (x - center) / Math.max(width, 1)
      // El borde entre tonos va dentado, como la tela de la hoja del personaje. De perfil, el lado
      // de la espalda queda en sombra.
      const jag = Math.sin(across * 13) * 0.016
      const depth = t + jag + across * across * 0.08 - across * direction * turned * 0.18
      let color = WHITE
      if (depth > 0.96) color = TAIL_DARK
      else if (depth > 0.88) color = TAIL
      else if (depth > 0.78) color = LAVENDER_DARK
      else if (depth > 0.65) color = LAVENDER
      else if (depth > 0.52) color = WHITE_SOFT
      // La orilla de la derecha lleva una sombra de un píxel, que le da volumen.
      if (x === right && depth < 0.67) color = WHITE_SOFT
      buffer.set(x, top + row, color)
    }
  }

  // Marcas del cuello, donde la tela se junta con los hombros.
  for (const side of [-1, 1]) {
    const collar = onRound(BODY_RADIUS, side * 0.95 + yaw)
    if (collar.facing < MIN_VISIBLE) continue
    for (let row = 0; row < 3; row++) buffer.set(cx + collar.x + side * row * 0.6, top + 1 + row, LAVENDER_DARK)
  }

  // La letra va pintada sobre el pecho: al girar se recorre y se angosta con él.
  LETTER_N.forEach((rowText, row) => {
    for (let column = 0; column < rowText.length; column++) {
      if (rowText[column] === ' ') continue
      const point = onRound(BODY_RADIUS, yaw + (column - 3) / BODY_RADIUS)
      if (point.facing > MIN_VISIBLE) buffer.set(cx + point.x, top + 7 + row, CHEST)
    }
  })
}

/**
 * Dibuja un brazo con su sombra debajo.
 *
 * @param buffer - Lienzo de destino.
 * @param cx - Columna del centro del cuerpo.
 * @param cy - Fila donde empieza el cuerpo.
 * @param side - Lado del cuerpo: -1 izquierdo, 1 derecho.
 * @param angle - Ángulo del brazo: 0 abajo, PI arriba.
 * @param lift - Cuánto se acorta el brazo, en píxeles; al teclear, la mano sube y baja.
 * @param yaw - Giro del cuerpo: de perfil, el brazo apunta según qué tan alzado esté.
 * @param isFar - Si va del otro lado del cuerpo, donde queda un poco en sombra.
 */
function drawArm(
  buffer: PixelBuffer,
  cx: number,
  cy: number,
  side: -1 | 1,
  angle: number,
  lift: number,
  yaw: number,
  isFar: boolean,
) {
  const reach = ARM_REACH - lift
  const steps = 18
  const turned = profileAmount(yaw)
  const shoulder = onRound(BODY_RADIUS, side * SHOULDER_ANGLE + yaw).x
  // De espaldas, cada brazo sale del lado donde quedó su hombro; de perfil, apunta hacia el frente.
  // Si cuelga va un poco hacia atrás; si lo alza, hacia el frente.
  const forward = Math.max(-0.8, Math.min(1, (angle - 1) / 0.4))
  const pointing = Math.sign(shoulder) * (1 - turned) + Math.sign(Math.sin(yaw)) * turned * forward
  const shoulderX = cx + shoulder
  const shoulderY = cy + 4
  const point = (s: number) => ({
    x: shoulderX + pointing * Math.sin(angle) * reach * s,
    y: shoulderY + Math.cos(angle) * reach * s,
  })
  // De perfil va encima del cuerpo, que es del mismo color: un borde lo separa.
  if (turned > 0.3 && !isFar) {
    for (let i = 0; i <= steps; i++) {
      const s = i / steps
      const { x, y } = point(s)
      buffer.disc(x, y, 4.6 + s * 2.2, LAVENDER_DARK)
    }
  }

  // Primero la sombra, desplazada un píxel hacia abajo; luego el brazo encima.
  for (let i = 0; i <= steps; i++) {
    const s = i / steps
    const { x, y } = point(s)
    buffer.disc(x + 0.5, y + 1, 3.6 + s * 2.2, isFar ? LAVENDER_DARK : LAVENDER)
  }
  for (let i = 0; i <= steps; i++) {
    const s = i / steps
    const { x, y } = point(s)
    const color = isFar ? LAVENDER : i > steps * 0.86 ? WHITE_SOFT : WHITE
    buffer.disc(x - 0.5, y, 3.2 + s * 2, color)
  }
}

/**
 * Dibuja la compu que aparece cuando Nova busca en internet. Mira hacia ella, así que se ve
 * la parte de atrás de la tapa, y sus manos entran y salen por detrás al teclear.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param cx - Columna del centro del cuerpo.
 * @param top - Fila donde empieza el cuerpo.
 */
function drawLaptop(buffer: PixelBuffer, state: NovaState, cx: number, top: number) {
  const shown = state.typing
  if (shown < 0.02) return

  // Sube desde el portal mientras se materializa.
  const lidTop = top + 16 + Math.round((1 - shown) * 16)
  const halfWidth = 25
  const lidHeight = 22
  const previousReveal = buffer.reveal
  buffer.reveal = shown

  // La luz de la pantalla se asoma por encima de la tapa.
  const flicker = 0.16 + Math.sin(state.time * 9) * 0.03
  buffer.glow(cx, lidTop - 1, 24, SCREEN_LIGHT, flicker * shown, 3)

  // Tapa: contorno, relleno y un borde superior más claro que le da volumen.
  for (let y = lidTop; y <= lidTop + lidHeight; y++) {
    const isCorner = y === lidTop
    const left = cx - halfWidth + (isCorner ? 1 : 0)
    const right = cx + halfWidth - (isCorner ? 1 : 0)
    for (let x = left; x <= right; x++) {
      const isEdge = x === left || x === right || y === lidTop || y === lidTop + lidHeight
      const isHighlight = y <= lidTop + 2
      buffer.set(x, y, isEdge ? OUTLINE : isHighlight ? LAPTOP_LID_LIGHT : LAPTOP_LID)
    }
  }

  // Logotipo de la tapa: la misma N de su pecho, encendida.
  const pulse = 0.5 + Math.sin(state.time * 3) * 0.3
  buffer.glyph(LETTER_N, cx - 3, lidTop + 8, pack(mix(SCREEN_LIGHT, hex('#FFFFFF'), pulse)))

  // Base del teclado, un poco más ancha, de la que solo se ve el canto frontal.
  const baseTop = lidTop + lidHeight + 1
  for (let y = baseTop; y <= baseTop + 3; y++) {
    const isEdge = y === baseTop + 3
    for (let x = cx - halfWidth - 3; x <= cx + halfWidth + 3; x++) {
      const isSide = x === cx - halfWidth - 3 || x === cx + halfWidth + 3
      buffer.set(x, y, isEdge || isSide ? OUTLINE : y === baseTop ? WHITE_SOFT : LAVENDER)
    }
  }

  buffer.reveal = previousReveal
}

/**
 * Dibuja un ojo mareado, en espiral.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param cx - Columna del centro del ojo.
 * @param cy - Fila del centro del ojo.
 * @param side - Lado de la cara: -1 izquierdo, 1 derecho.
 * @param squeeze - Qué tan angosto se ve al girar la cabeza, de 0 a 1.
 * @param color - Color empaquetado.
 */
function drawDizzyEye(buffer: PixelBuffer, state: NovaState, cx: number, cy: number, side: -1 | 1, squeeze: number, color: number) {
  // Espiral que gira; cada ojo en sentido contrario, para que se vea bien mareada.
  const turns = 2.1
  const steps = 90
  const radiusX = 6 * squeeze
  for (let i = 0; i <= steps; i++) {
    const s = i / steps
    const angle = s * turns * Math.PI * 2 + state.time * 9 * side
    buffer.set(cx + Math.cos(angle) * radiusX * s, cy + Math.sin(angle) * 7 * s, color)
  }
}

/**
 * Dibuja un ojo; su forma expresa la emoción con el ceño y la sonrisa.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param cx - Columna del centro del ojo.
 * @param cy - Fila del centro del ojo.
 * @param side - Lado de la cara: -1 izquierdo, 1 derecho.
 * @param scale - Tamaño relativo del ojo.
 * @param outer - Color del borde.
 * @param inner - Color del centro.
 * @param squeeze - Qué tan angosto se ve al girar la cabeza, de 0 a 1.
 */
function drawEye(
  buffer: PixelBuffer,
  state: NovaState,
  cx: number,
  cy: number,
  side: -1 | 1,
  scale: number,
  outer: number,
  inner: number,
  squeeze: number,
) {
  // Tamaño final según la pose, el parpadeo y la voz.
  const { eyeSlant, eyeSmile } = state.pose
  const halfW = Math.max(1, state.pose.eyeWidth * scale * squeeze)
  const blink = state.blink > 0 ? 1 - Math.sin(state.blink * Math.PI) * 0.88 : 1
  const halfH = Math.max(1, (state.pose.eyeHeight * scale * blink * state.eyeTwitch * (1 + state.level * 0.05)) / 2)
  // La sonrisa se forma recortando la parte inferior del ojo con un círculo.
  const cutRadius = eyeSmile * halfW * 1.45
  const cutY = cy + halfH + cutRadius * 0.32

  for (let dy = -Math.ceil(halfH) - 1; dy <= Math.ceil(halfH) + 1; dy++) {
    for (let dx = -Math.ceil(halfW) - 1; dx <= Math.ceil(halfW) + 1; dx++) {
      const pill = Math.abs(dx / (halfW + 0.5)) ** 3 + Math.abs(dy / (halfH + 0.5)) ** 3
      if (pill > 1) continue
      // El ceño recorta la parte superior en diagonal: hacia dentro enojo, hacia fuera tristeza.
      const towardCenter = dx * -side
      const topLimit =
        eyeSlant >= 0
          ? -halfH + eyeSlant * (towardCenter + halfW)
          : -halfH + -eyeSlant * (halfW - towardCenter)
      if (dy < topLimit) continue
      if (cutRadius > 0 && Math.hypot(dx, cy + dy - cutY) < cutRadius) continue
      const edge = Math.abs(dx) > halfW - 0.8 || Math.abs(dy) > halfH - 1.2 || dy < topLimit + 1
      buffer.set(cx + dx, cy + dy, edge ? outer : inner)
    }
  }
}

/**
 * Dibuja el casco, el visor, los ojos, la boca de luz y la gema.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 */
function drawHead(buffer: PixelBuffer, state: NovaState, hx: number, hy: number) {
  const { pose } = state
  const outerColor = pack(pose.eyeOuter)
  const innerColor = pack(pose.eyeInner)

  const yaw = wrapYaw(state.headYaw)
  const turned = profileAmount(yaw)
  const direction = Math.sign(Math.sin(yaw))

  // Casco: contorno y tres tonos. Al girar se angosta y la luz se va hacia la cara, dejando la nuca
  // en sombra.
  const narrow = turned * 2.2
  const light = direction * turned * 1.6
  buffer.rounded(hx, hy, HELMET_RX + 1 - narrow, HELMET_RY + 1, 2.3, OUTLINE)
  buffer.rounded(hx, hy, HELMET_RX - narrow, HELMET_RY, 2.3, LAVENDER)
  buffer.rounded(hx - 0.4 + light, hy - 0.8, HELMET_RX - 1 - narrow, HELMET_RY - 1.1, 2.3, WHITE_SOFT)
  buffer.rounded(hx - 0.8 + light * 1.4, hy - 1.4, HELMET_RX - 2.2 - narrow, HELMET_RY - 2.2, 2.3, WHITE)

  // Bisagra del casco: el aro pequeño que se ve de perfil, atrás de la cara.
  const hinge = onRound(HEAD_RADIUS, -direction * (Math.PI / 2 + 0.3) + yaw)
  if (turned > 0.5 && hinge.facing > 0.4 && Math.cos(yaw) > -0.2) {
    buffer.disc(hx + hinge.x, hy - 8, 2.6, OUTLINE)
    buffer.disc(hx + hinge.x, hy - 8, 1.5, WHITE_SOFT)
  }

  // Visor oscuro, recorrido hacia donde mira; llega hasta la orilla del casco y no más.
  const helmetEdge = HELMET_RX - 3.4 - narrow
  const visorAngle = VISOR_ANGLE + turned * VISOR_PROFILE_ANGLE
  const visorFrom = Math.max(-helmetEdge, onRound(HEAD_RADIUS, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, yaw - visorAngle))).x)
  const visorTo = Math.min(helmetEdge, onRound(HEAD_RADIUS, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, yaw + visorAngle))).x)
  const visorX = hx + (visorFrom + visorTo) / 2
  const visorHalf = (visorTo - visorFrom) / 2

  // De espaldas no hay cara que dibujar.
  if (visorHalf < MIN_VISOR_HALF) return

  buffer.rounded(visorX, hy + 1.5, visorHalf, VISOR_RY, 2.7, VISOR_EDGE)
  buffer.rounded(visorX, hy + 1.5, visorHalf - 1, VISOR_RY - 1, 2.7, VISOR)
  const inVisor = (x: number, y: number) =>
    Math.abs((x - visorX) / (visorHalf - 1.5)) ** 2.8 + Math.abs((y - hy - 1.5) / (VISOR_RY - 1.5)) ** 2.8 <= 1

  // Los ojos se desplazan hacia donde mira; con curiosidad, la cara se ladea.
  const eyeX = Math.round(state.lookX * 3.2 * (1 - turned * 0.5))
  const eyeY = Math.round(state.lookY * 2.4)
  const tilt = Math.round(state.feel.curious * 3)
  const left = onRound(HEAD_RADIUS, yaw * FACE_TURN - EYE_ANGLE)
  const right = onRound(HEAD_RADIUS, yaw * FACE_TURN + EYE_ANGLE)
  const eyes = [
    { side: -1 as const, x: hx + left.x + eyeX, y: hy + 1 + eyeY + tilt, facing: left.facing, scale: 1 },
    { side: 1 as const, x: hx + right.x + eyeX, y: hy + 1 + eyeY - tilt, facing: right.facing, scale: pose.eyeRightScale },
  ].filter((eye) => eye.facing > MIN_VISIBLE)

  // Resplandor de los ojos, limitado para que no se salga del visor.
  for (const eye of eyes) {
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const x = eye.x + dx
        const y = eye.y + dy
        const distance = Math.hypot(dx / 8, dy / 9)
        if (inVisor(x, y) && distance < 1) {
          buffer.blend(x, y, pose.eyeOuter, (Math.ceil((1 - distance) * 3) / 3) * (0.2 + state.level * 0.15))
        }
      }
    }
  }

  drawVisorFeelings(buffer, state, visorX, hy, inVisor, eyes.map((eye) => [eye.x, eye.y] as const))

  // Ojos.
  for (const eye of eyes) {
    if (state.dizzy > 0.25) drawDizzyEye(buffer, state, eye.x, eye.y, eye.side, eye.facing, innerColor)
    else drawEye(buffer, state, eye.x, eye.y, eye.side, eye.scale, outerColor, innerColor, eye.facing)
  }

  // Boca de luz: solo existe mientras habla.
  if (state.level > 0.06) {
    const mouthW = 2 + Math.round(state.level * 2.5)
    const mouthH = 1 + Math.round(state.level * 3.4)
    const mouthX = hx + onRound(HEAD_RADIUS, yaw * FACE_TURN).x + eyeX
    const mouthY = hy + 9 + eyeY
    for (let dy = 0; dy < mouthH; dy++) {
      const width = dy === 0 || dy === mouthH - 1 ? mouthW - 1 : mouthW
      for (let dx = -width; dx <= width; dx++) buffer.set(mouthX + dx, mouthY + dy, innerColor)
    }
  }


  // Gema de la frente: brilla más cuando habla.
  const gem = onRound(HEAD_RADIUS - 1, yaw * GEM_TURN)
  if (gem.facing < MIN_VISIBLE) return
  const gemX = hx + gem.x
  // Sigue la curva del casco: de lado baja junto con la orilla, en vez de quedarse flotando.
  const gemY = hy - HELMET_RY * (1 - Math.min(1, Math.abs(gem.x) / (HELMET_RX + 1)) ** 2.3) ** (1 / 2.3)
  const radius = 6
  const bright = 0.35 + state.level * 0.65
  buffer.glow(gemX, gemY, 11 + state.level * 6, pose.ramp.light, 0.34 + state.level * 0.4, 3)
  // Colores de sus facetas: la luz cambia con la voz.
  const gemLight = pack(mix(pose.ramp.mid, pose.ramp.core, bright))
  const gemMid = pack(pose.ramp.deep)
  const gemDark = pack(pose.ramp.back)
  // Rombo con contorno; cada cuadrante es una faceta con su propio tono.
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // De lado se angosta porque va pegado a la frente, pero sin volverse una punta delgada.
      const shape = (Math.abs(dx) / Math.max(gem.facing, 0.75)) * 1.25 + Math.abs(dy)
      if (shape > radius + 1) continue
      let color = gemDark
      if (shape <= radius) {
        color = dx < 0 ? (dy < 0 ? gemLight : gemMid) : dy < 0 ? gemMid : gemDark
        if (shape <= 1.5) color = gemLight
      } else {
        color = OUTLINE
      }
      buffer.set(gemX + dx, gemY + dy, color)
    }
  }
}

/**
 * Dibuja una partícula según su tipo.
 *
 * @param buffer - Lienzo de destino.
 * @param particle - Partícula que se dibuja.
 */
/**
 * Dibuja un símbolo al doble de tamaño y con contorno oscuro, para que se lea sobre las llamas.
 *
 * @param buffer - Lienzo de destino.
 * @param rows - Filas del símbolo.
 * @param x - Columna de la esquina superior izquierda.
 * @param y - Fila de la esquina superior izquierda.
 * @param color - Color empaquetado del símbolo.
 */
function drawSign(buffer: PixelBuffer, rows: readonly string[], x: number, y: number, color: number) {
  // Duplica cada píxel a lo ancho y a lo alto, sin perder el aspecto de pixel art.
  const large = rows.flatMap((row) => {
    const wide = [...row].map((cell) => cell + cell).join('')
    return [wide, wide]
  })

  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    buffer.glyph(large, x + dx, y + dy, OUTLINE)
  }
  buffer.glyph(large, x, y, color)
}

/**
 * Dibuja lo que cada emoción añade dentro del visor: lágrimas o sombras.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param hx - Columna del centro del visor.
 * @param hy - Fila de la cabeza.
 * @param inVisor - Indica si un punto cae dentro del visor.
 * @param eyes - Posición de cada ojo visible.
 */
function drawVisorFeelings(
  buffer: PixelBuffer,
  state: NovaState,
  hx: number,
  hy: number,
  inVisor: (x: number, y: number) => boolean,
  eyes: ReadonlyArray<readonly [number, number]>,
) {
  const { feel, time } = state

  // Asustada: líneas de sombra que caen desde arriba del visor.
  if (feel.afraid > 0.2) {
    for (let x = hx - 14; x <= hx + 14; x += 3) {
      const length = 4 + ((x * 7) % 5)
      for (let i = 0; i < length; i++) {
        const y = hy - 12 + i
        if (inVisor(x, y)) buffer.blend(x, y, hex('#6A7BD8'), feel.afraid * 0.75 * (1 - i / length))
      }
    }
  }

  // Buscando: el texto de la pantalla se refleja en el visor y va subiendo.
  if (state.typing > 0.2) {
    for (let line = 0; line < 3; line++) {
      const y = hy + 12 - Math.floor((time * 7 + line * 4) % 12)
      const width = 5 + ((line * 5 + Math.floor(time * 2)) % 8)
      for (let x = hx - 10; x <= hx - 10 + width * 2; x++) {
        if (inVisor(x, y)) buffer.blend(x, y, SCREEN_LIGHT, state.typing * 0.28)
      }
    }
  }

  for (const [eyeX, eyeY] of eyes) {
    // Triste: una lágrima baja por el visor desde cada ojo.
    if (feel.sad > 0.2) {
      for (let y = eyeY + 4; y <= hy + 13; y++) {
        const falling = (y * 0.3 - time * 3 + eyeX) % 2 < 0.8
        if (inVisor(eyeX, y) && falling) buffer.blend(eyeX, y, hex('#A6DCFF'), Math.min(1, feel.sad * 1.5))
      }
    }
  }
}

/**
 * Dibuja las señales de cómic alrededor de la cabeza según lo que siente.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 * @param hx - Columna de la cabeza.
 * @param hy - Fila de la cabeza.
 */
function drawSigns(buffer: PixelBuffer, state: NovaState, hx: number, hy: number) {
  const { feel, time } = state
  const threshold = 0.3

  // Mareada: unas estrellitas le dan vueltas alrededor de la cabeza, como en las caricaturas.
  if (state.dizzy > 0.25) {
    const color = pack(hex('#FFE98A'))
    for (let star = 0; star < 5; star++) {
      const angle = time * 4.5 + (star / 5) * Math.PI * 2
      const x = Math.round(hx + Math.cos(angle) * 30) - 2
      const y = Math.round(hy - 24 + Math.sin(angle) * 8) - 2
      // Con contorno oscuro, para que se lean encima de las llamas.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) buffer.glyph(DIZZY_STAR, x + dx, y + dy, OUTLINE)
      buffer.glyph(DIZZY_STAR, x, y, color)
    }
  }

  // Triste: una nube de lluvia sobre la cabeza.
  if (feel.sad > threshold) {
    drawSign(buffer, CLOUD, hx - 10, hy - 46 + Math.round(Math.sin(time) * 1), pack(hex('#7C8AB8')))
  }

  // Enojada: la marca de enfado late junto a la cabeza.
  if (feel.angry > threshold && Math.sin(time * 9) > -0.4) {
    drawSign(buffer, ANGER_MARK, hx + 18, hy - 30, pack(hex('#FF3B30')))
  }

  // Sorprendida: un signo de exclamación que salta.
  if (feel.surprised > threshold) {
    drawSign(buffer, EXCLAMATION, hx + 27, hy - 36 - Math.round(Math.abs(Math.sin(time * 7)) * 3), pack(hex('#FFE6B5')))
  }

  // Buscando: una lupa que flota; ocupa el lugar del signo de interrogación.
  if (state.keying > 0.5) {
    drawSign(buffer, MAGNIFIER, hx + 22 + Math.round(Math.sin(time * 3) * 2), hy - 40 + Math.round(Math.cos(time * 2) * 2), pack(hex('#7FE3FF')))
  }

  // Curiosa: un signo de interrogación que se balancea.
  if (feel.curious > threshold && state.keying <= 0.5) {
    drawSign(buffer, QUESTION, hx + 23 + Math.round(Math.sin(time * 2) * 2), hy - 38, pack(hex('#B8F0FF')))
  }

  // Preocupada o asustada: una gota grande de sudor resbala por el casco.
  if (feel.worried > threshold || feel.afraid > threshold) {
    const slide = ((time * 5) % 12) | 0
    drawSign(buffer, SWEAT, hx + 20, hy - 18 + slide, pack(hex('#A6DCFF')))
  }

  // Estresada: un garabato gira alrededor de la cabeza.
  if (feel.stressed > threshold) {
    const orbit = time * 4
    drawSign(buffer, SCRIBBLE, hx - 6 + Math.round(Math.cos(orbit) * 26), hy - 36 + Math.round(Math.sin(orbit) * 7), pack(hex('#FFE27A')))
    drawSign(buffer, SCRIBBLE, hx - 6 - Math.round(Math.cos(orbit) * 26), hy - 36 - Math.round(Math.sin(orbit) * 7), pack(hex('#FFB45E')))
  }

  // Frustrada: una maraña sobre la cabeza que cambia de lado.
  if (feel.frustrated > threshold) {
    drawSign(buffer, TANGLE, hx - 8 + Math.round(Math.sin(time * 6) * 2), hy - 46, pack(hex('#3A2C30')))
  }
}

function drawParticle(buffer: PixelBuffer, particle: Particle) {
  const progress = particle.life / particle.maxLife
  const color = pack(particle.color)
  const { x, y } = particle
  switch (particle.kind) {
    case 'star': {
      const size = Math.sin(progress * Math.PI) > 0.72 ? 2 : Math.sin(progress * Math.PI) > 0.3 ? 1 : 0
      buffer.set(x, y, color)
      for (let i = 1; i <= size; i++) {
        buffer.set(x + i, y, color)
        buffer.set(x - i, y, color)
        buffer.set(x, y + i, color)
        buffer.set(x, y - i, color)
      }
      break
    }
    case 'dot':
    case 'ember':
      buffer.set(x, y, color)
      break
    case 'drop':
      buffer.set(x, y, color)
      buffer.set(x, y + 1, color)
      break
    case 'question':
      buffer.glyph(QUESTION, x - 2, y - 3, color)
      break
    case 'note':
      buffer.glyph(NOTE, x - 2, y - 3, color)
      break
    case 'scribble':
      buffer.glyph(SCRIBBLE, x - 3, y - 2, color)
      break
    case 'steam':
      // Se expande y se desvanece mientras sube.
      buffer.glow(x, y, 3 + (1 - progress) * 4, particle.color, 0.35 + progress * 0.6, 2)
      break
  }
}

/**
 * Dibuja un cuadro completo, de atrás hacia adelante.
 *
 * @param buffer - Lienzo de destino.
 * @param state - Estado de la animación.
 */
export function renderNova(buffer: PixelBuffer, state: NovaState) {
  // El portal siempre es visible, incluso antes de que aparezca Nova.
  buffer.clear()
  buffer.reveal = 1
  drawPortal(buffer, state)

  // Posición del cuadro; la cabeza se adelanta un poco hacia donde mira.
  const cx = Math.round(CANVAS_SIZE / 2 + state.x + state.shakeX + state.actX)
  const bodyTop = Math.round(HEAD_Y + state.y) + 18
  const hy = Math.round(HEAD_Y + state.y + state.headSink)
  // La cabeza se adelanta hacia donde mira y a donde va.
  const hx = cx + Math.round(state.lookX * 1.2 + state.headShake + Math.sin(state.headYaw) * 3)

  // Las capas de Nova comparten el efecto de materializarse al aparecer.
  buffer.reveal = state.appear >= 1 ? 1 : state.appear ** 1.4
  buffer.glow(hx, hy - 10, 68, state.pose.ramp.mid, 0.13 + state.level * 0.2, 9)
  drawFlames(buffer, state, hx, hy)
  // El brazo que al girar quedó del otro lado se dibuja antes que el cuerpo, para que lo tape.
  const arms = [
    { side: -1 as const, angle: state.armLeft, lift: state.reachLeft },
    { side: 1 as const, angle: state.armRight, lift: state.reachRight },
  ].map((arm) => ({ ...arm, isFar: onRound(BODY_RADIUS, arm.side * SHOULDER_ANGLE + state.bodyYaw).facing < -0.5 }))
  const drawArms = (isFar: boolean) => {
    for (const arm of arms) {
      // De perfil, el cuerpo tapa por completo el brazo del otro lado.
      const isHidden = arm.isFar && profileAmount(state.bodyYaw) > 0.8
      if (arm.isFar === isFar && !isHidden) drawArm(buffer, cx, bodyTop, arm.side, arm.angle, arm.lift, state.bodyYaw, isFar)
    }
  }
  drawArms(true)
  drawBody(buffer, state, cx, bodyTop)
  drawArms(false)
  drawLaptop(buffer, state, cx, bodyTop)
  drawHead(buffer, state, hx, hy)
  drawNapeFlames(buffer, state, hx, hy)
  drawSigns(buffer, state, hx, hy)
  buffer.reveal = 1

  // Las partículas van encima de todo.
  for (const particle of state.particles) drawParticle(buffer, particle)
}
