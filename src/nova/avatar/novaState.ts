/** Simulación de Nova: decide en cada paso cómo se mueve, sin dibujar nada. */

import {
  blendPoses,
  blendWeights,
  EMOTIONS,
  dominantEmotion,
  NUMERIC_POSE_KEYS,
  POSES,
  sampleEmotion,
  type Activity,
  type Emotion,
  type EmotionBlend,
  type FlameRamp,
  type Pose,
} from './emotions'
import { hex, mix, type RGB } from './pixelBuffer'

/** Lado del lienzo en píxeles reales. */
export const CANVAS_SIZE = 160
/** Fila en la que flota el centro de la cabeza. */
export const HEAD_Y = 74
/** Cuánto gira hacia un lado, en radianes: de frente es 0, y aquí ya se ve casi de perfil. */
export const MAX_YAW = 1.1
const APPEAR_SECONDS = 1.5
const MAX_PARTICLES = 90
const WANDER_AFTER_SECONDS = 4
const SPIN_SECONDS = 1.15
// Se marea si la sacuden: cada cambio brusco de dirección suma, y lo acumulado se va bajando.
const SHAKE_MIN_SPEED = 220
const SHAKE_REVERSALS_TO_DIZZY = 5
const SHAKE_DECAY_PER_SECOND = 1
const DIZZY_SECONDS = 4.5
// El saludo: alza una mano y la mueve de lado a lado.
const WAVE_SECONDS = 2.4
// Lo bastante baja para que la mano salga al lado del casco, en vez de quedar detrás.
const WAVE_ARM = 1.8
// A partir de este rumbo se ve de espaldas: unos 30 grados alrededor de ir recto hacia arriba.
const BACK_VIEW_ANGLE = 2.6
// Baila si la alegría o la sorpresa llegan a este nivel de golpe; una buena noticia común no basta.
const DANCE_THRESHOLD = 0.7
const DANCE_JUMP = 0.05
const DANCE_SECONDS = 3.8
const DANCE_BEAT = 6.5
const DANCE_SPIN_AT = 1.5
const NOTE_COLORS = [hex('#FFE98A'), hex('#6FD3FF'), hex('#F2A7E8')]
// Cuánto se queda de espaldas si le pides que se voltee.
const SHOW_BACK_SECONDS = 4
// El cuerpo se atrasa este tanto respecto a la cabeza mientras da la vuelta.
const SPIN_BODY_LAG = 0.5

/** Tipos de partícula que puede soltar Nova. */
type ParticleKind = 'star' | 'dot' | 'drop' | 'ember' | 'question' | 'scribble' | 'steam' | 'note'

/** Una partícula en movimiento; `life` se mide en segundos. */
export type Particle = {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: RGB
}

/** Lo que necesita la simulación para avanzar un paso. */
export type NovaInput = {
  dt: number
  blend: EmotionBlend
  activity: Activity
  level: number // voz, de 0 a 1
  pointer: { x: number; y: number } | null // en coordenadas del lienzo
  lookAtInput: boolean
  reducedMotion: boolean
  // Si la están cargando, a qué velocidad va en px/s, y hacia dónde se dirige por su cuenta.
  grab: { held: boolean; vx: number; vy: number; heading: { x: number; y: number } | null }
  isDancing?: boolean // lo decide `stepNova` en cada paso
  excitement: number // lo más fuerte entre su alegría y su sorpresa de verdad, de 0 a 1
}

/** Estado completo de la animación; se conserva entre un cuadro y otro. */
export type NovaState = {
  time: number
  phase: number
  hairPhase: number
  appear: number
  pose: Pose
  emotion: Emotion
  armLeft: number
  armRight: number
  armLeftVelocity: number
  armRightVelocity: number
  x: number
  xVelocity: number
  y: number
  shakeX: number
  lookX: number
  lookY: number
  tailSway: number
  blink: number
  nextBlink: number
  wanderX: number
  wanderY: number
  sinceMoved: number
  lastPointer: { x: number; y: number } | null
  level: number
  jolt: number
  particles: Particle[]
  sparkleBudget: number
  feel: Record<Emotion, number> // peso actual de cada emoción, ya suavizado
  actX: number // desplazamiento propio de la emoción: baile, ir y venir, temblor
  actY: number // suspiros y otros movimientos verticales de la emoción
  headShake: number // la cabeza niega de lado a lado
  bodyStretch: number // estirar y encoger el cuerpo
  headSink: number // la cabeza se hunde entre los hombros
  eyeTwitch: number // multiplica la altura de los ojos; menos de 1 es un tic
  huffTimer: number // segundos para el siguiente resoplido de frustración
  typing: number // qué tanto apareció la compu, de 0 a 1
  grabbed: number // qué tan cargada va, de 0 a 1
  grabVx: number // velocidad horizontal al arrastrarla, suavizada
  grabVy: number // velocidad vertical al arrastrarla, suavizada
  wasHeld: boolean // si en el paso anterior la estaban cargando
  headYaw: number // giro de la cabeza al dibujarla, en radianes; PI es de espaldas
  bodyYaw: number // giro del cuerpo al dibujarlo, que sigue a la cabeza con retraso
  flameYaw: number // giro de las llamas, que alcanzan a la cabeza con un latigazo
  faceYaw: number // a dónde apunta la cabeza, sin contar las vueltas que esté dando
  faceYawVelocity: number // la cabeza se pasa un poco al voltear, y regresa
  torsoYaw: number // a dónde apunta el cuerpo, sin contar las vueltas
  spin: number // cuánto lleva de la vuelta completa, en radianes
  isSpinning: boolean // si está dando una vuelta completa
  backTimer: number // segundos que le quedan enseñando la espalda
  dizzy: number // segundos que le quedan de mareo
  shakeAmount: number // cuánto la han sacudido últimamente
  shakeSignX: number // última dirección horizontal al sacudirla
  shakeSignY: number // última dirección vertical al sacudirla
  waveTimer: number // segundos que le quedan saludando con la mano
  dance: number // segundos que lleva bailando; negativo si no está bailando
  lastExcitement: number // emoción del paso anterior, para notar cuando sube de golpe
  keying: number // qué tan rápido teclea, de 0 a 1; se detiene mientras cuenta lo que encontró
  reachLeft: number // cuánto sube la mano izquierda al teclear, en píxeles
  reachRight: number // cuánto sube la mano derecha al teclear, en píxeles
}

/**
 * Crea el estado inicial, con Nova tranquila y aún sin materializarse.
 *
 * @returns El estado listo para simular.
 */
export function createNovaState(): NovaState {
  const pose = { ...POSES.neutral }
  return {
    time: 0,
    phase: 0,
    hairPhase: 0,
    appear: 0,
    pose,
    emotion: 'neutral',
    armLeft: pose.armLeft,
    armRight: pose.armRight,
    armLeftVelocity: 0,
    armRightVelocity: 0,
    x: 0,
    xVelocity: 0,
    y: 0,
    shakeX: 0,
    lookX: 0,
    lookY: 0,
    tailSway: 0,
    blink: 0,
    nextBlink: 2,
    wanderX: 0,
    wanderY: 0,
    sinceMoved: 0,
    lastPointer: null,
    level: 0,
    jolt: 0,
    particles: [],
    sparkleBudget: 0,
    feel: Object.fromEntries(EMOTIONS.map((name) => [name, name === 'neutral' ? 1 : 0])) as Record<Emotion, number>,
    actX: 0,
    actY: 0,
    headShake: 0,
    bodyStretch: 1,
    headSink: 0,
    eyeTwitch: 1,
    huffTimer: 0,
    grabbed: 0,
    grabVx: 0,
    grabVy: 0,
    wasHeld: false,
    headYaw: 0,
    bodyYaw: 0,
    flameYaw: 0,
    faceYaw: 0,
    faceYawVelocity: 0,
    torsoYaw: 0,
    spin: 0,
    isSpinning: false,
    backTimer: 0,
    dizzy: 0,
    shakeAmount: 0,
    shakeSignX: 0,
    shakeSignY: 0,
    waveTimer: 0,
    dance: -1,
    lastExcitement: 0,
    typing: 0,
    keying: 0,
    reachLeft: 0,
    reachRight: 0,
  }
}

/**
 * Acerca un valor a su objetivo de forma suave e independiente de los FPS.
 *
 * @param value - Valor actual.
 * @param target - Valor objetivo.
 * @param rate - Rapidez de la transición.
 * @param dt - Segundos transcurridos.
 * @returns El valor actualizado.
 */
const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt))
/**
 * Limita un valor a un rango.
 *
 * @param value - Valor original.
 * @param low - Mínimo permitido.
 * @param high - Máximo permitido.
 * @returns El valor dentro del rango.
 */
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
/**
 * Genera un número aleatorio en un rango.
 *
 * @param low - Mínimo.
 * @param high - Máximo.
 * @returns El número generado.
 */
const random = (low: number, high: number) => low + Math.random() * (high - low)

/** Colores de los destellos según la emoción. */
const STAR_COLORS = {
  neutral: [hex('#A9D6FF'), hex('#C58BF2'), hex('#6F86FF')],
  happy: [hex('#FFE98A'), hex('#6FD3FF'), hex('#FFFFFF')],
  sad: [hex('#86A9D8')],
  angry: [hex('#FFA53A'), hex('#FF5B2E')],
  surprised: [hex('#FFFFFF'), hex('#FFE6B5'), hex('#A9D6FF')],
  curious: [hex('#B8F0FF'), hex('#A9D6FF')],
  afraid: [hex('#CFCFEE'), hex('#918FC9')],
  worried: [hex('#A0CFD6'), hex('#5A92B8')],
  stressed: [hex('#F2CE5E'), hex('#D98A5E')],
  frustrated: [hex('#D99A5A'), hex('#B9683A')],
} satisfies Record<Emotion, RGB[]>

/**
 * Agrega una partícula, retirando la más antigua si se llegó al límite.
 *
 * @param state - Estado de la animación.
 * @param particle - Partícula nueva.
 */
function emit(state: NovaState, particle: Omit<Particle, 'maxLife'>) {
  if (state.particles.length >= MAX_PARTICLES) state.particles.shift()
  state.particles.push({ ...particle, maxLife: particle.life })
}

/**
 * Suelta una partícula propia de la emoción actual alrededor del personaje.
 *
 * @param state - Estado de la animación.
 * @param emotion - Emoción que origina la partícula.
 * @param headX - Columna de la cabeza.
 * @param headY - Fila de la cabeza.
 * @param level - Volumen actual de la voz, de 0 a 1.
 */
function spawnAmbient(state: NovaState, emotion: Emotion, headX: number, headY: number, level: number) {
  // Calcula una posición por defecto en el arco superior, alrededor de las llamas.
  const pick = STAR_COLORS[emotion]
  const color = pick[Math.floor(Math.random() * pick.length)]
  const angle = random(-Math.PI * 1.05, 0.05)
  const distance = random(26, 52)
  const x = headX + Math.cos(angle) * distance
  const y = headY + Math.sin(angle) * distance * 0.95

  // Algunas emociones sustituyen el destello por su propia partícula.
  switch (emotion) {
    case 'sad':
      if (Math.random() < 0.55) {
        const side = Math.random() < 0.5 ? -1 : 1
        emit(state, { kind: 'drop', x: headX + side * 9, y: headY + 7, vx: 0, vy: 15, life: 1.1, color: hex('#8FC3F2') })
        return
      }
      break
    case 'angry':
      emit(state, { kind: 'ember', x: headX + random(-30, 30), y: headY - random(-4, 26), vx: random(-7, 7), vy: random(-30, -15), life: random(0.5, 1.1), color })
      return
    case 'curious':
      if (Math.random() < 0.12) {
        emit(state, { kind: 'question', x: headX + 26, y: headY - 28, vx: 1, vy: -4, life: 1.6, color: hex('#B8F0FF') })
        return
      }
      break
    case 'afraid':
    case 'worried':
      // Gotas de sudor frío que resbalan por los lados del casco.
      if (Math.random() < (emotion === 'afraid' ? 0.45 : 0.6)) {
        const side = Math.random() < 0.5 ? -1 : 1
        emit(state, { kind: 'drop', x: headX + side * random(20, 25), y: headY - random(2, 12), vx: side * 2, vy: 19, life: 0.8, color: hex('#BFE6FF') })
        return
      }
      break
    case 'stressed':
      // Garabatos de saturación que aparecen sobre la cabeza.
      if (Math.random() < 0.22) {
        emit(state, { kind: 'scribble', x: headX + random(-26, 26), y: headY - random(36, 50), vx: random(-3, 3), vy: -3, life: 0.9, color: hex('#FFE27A') })
        return
      }
      break
    case 'frustrated':
      // Vapor que sale a ambos lados de la cabeza, como un resoplido.
      if (Math.random() < 0.8) {
        const side = Math.random() < 0.5 ? -1 : 1
        emit(state, { kind: 'steam', x: headX + side * 26, y: headY - 3, vx: side * random(14, 24), vy: random(-13, -7), life: random(0.7, 1.2), color: hex('#D8D2E0') })
        return
      }
      break
    default:
      break
  }

  // Destello normal para las demás emociones, o si el azar no eligió una especial.
  emit(state, {
    kind: Math.random() < 0.6 ? 'star' : 'dot',
    x,
    y,
    vx: random(-1.5, 1.5),
    vy: random(-5, -1) - level * 8,
    life: random(0.7, 1.8),
    color,
  })
}

/**
 * Reacción al hacerle clic: un brinco y un anillo de destellos.
 *
 * @param state - Estado de la animación.
 */
/**
 * Calcula los gestos propios de cada emoción, en proporción a lo que pesa en la mezcla.
 *
 * @param state - Estado de la animación; se modifica directamente.
 * @param dt - Segundos transcurridos.
 * @param motion - Multiplicador de movimiento; se reduce si el usuario lo prefiere.
 * @returns Lo que hay que sumar a la mirada y a cada brazo.
 */
function performEmotions(state: NovaState, dt: number, motion: number) {
  const { feel, time } = state

  // Feliz: baila de lado a lado y rebota estirándose.
  const danceX = Math.sin(time * 5) * 4 * feel.happy
  const bounce = Math.sin(time * 10) * 0.07 * feel.happy

  // Triste: suspira despacio; el pecho sube y baja cada varios segundos.
  const sigh = Math.sin(time * 1.2) ** 3 * 2 * feel.sad

  // Enojada: sacude los puños.
  const fistShake = Math.sin(time * 22) * 0.26 * feel.angry

  // Asustada: los ojos saltan nerviosos de un lado a otro.
  const dart = (Math.sin(time * 13) + Math.sin(time * 7.3)) * 0.7 * feel.afraid

  // Preocupada: va y viene, retuerce las manos y mira a los lados.
  const pacing = Math.sin(time * 0.9) * 7 * feel.worried
  const wringing = Math.sin(time * 6) * 0.2 * feel.worried
  const glance = Math.sin(time * 1.7) * 0.8 * feel.worried

  // Estresada: vibra, agita los brazos por turnos y le da un tic en los ojos.
  const jitter = Math.sin(time * 31) * 1.6 * feel.stressed
  const flail = Math.sin(time * 12) * 0.55 * feel.stressed
  state.eyeTwitch = Math.sin(time * 17) > 0.75 && feel.stressed > 0.25 ? 0.6 : 1

  // Frustrada: niega con la cabeza por tandas y resopla vapor cada cierto tiempo.
  const shakingBurst = Math.sin(time * 0.9) > 0.45 ? 1 : 0
  state.headShake = Math.sin(time * 9) * 2.6 * feel.frustrated * shakingBurst * motion
  state.huffTimer -= dt
  if (feel.frustrated > 0.2 && state.huffTimer <= 0) {
    state.huffTimer = 3.2
    const headX = CANVAS_SIZE / 2 + state.x
    const headY = HEAD_Y + state.y
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1
      emit(state, { kind: 'steam', x: headX + side * 26, y: headY - 2, vx: side * random(24, 44), vy: random(-16, -6), life: random(0.6, 1.1), color: hex('#E8E2EE') })
    }
  }

  // Combina los desplazamientos y la forma del cuerpo.
  state.actX = (danceX + pacing + jitter) * motion
  state.actY = sigh * motion
  state.bodyStretch = state.pose.bodyStretch + bounce * motion
  state.headSink = state.pose.headSink + sigh * 0.6

  return {
    gazeX: dart + glance,
    armLeft: fistShake + wringing + flail,
    armRight: -fistShake - wringing - flail,
  }
}

/**
 * Efecto al calmarla: un anillo de destellos suaves que se abre despacio.
 *
 * @param state - Estado de la animación.
 */
export function soothe(state: NovaState) {
  const particleCount = 20
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2
    emit(state, {
      kind: 'star',
      x: CANVAS_SIZE / 2 + state.x,
      y: HEAD_Y + state.y,
      vx: Math.cos(angle) * 20,
      vy: Math.sin(angle) * 17,
      life: 1.4,
      color: hex('#BFE6FF'),
    })
  }
}

/**
 * Cuenta las sacudidas mientras la cargan; con suficientes cambios de dirección, se marea.
 *
 * @param state - Estado de la animación.
 * @param grab - Si la están cargando y a qué velocidad.
 * @param dt - Segundos transcurridos.
 */
function trackShaking(state: NovaState, grab: NovaInput['grab'], dt: number) {
  state.shakeAmount = Math.max(0, state.shakeAmount - SHAKE_DECAY_PER_SECOND * dt)
  state.dizzy = Math.max(0, state.dizzy - dt)
  if (!grab.held) {
    state.shakeSignX = 0
    state.shakeSignY = 0
    return
  }
  if (Math.abs(grab.vx) > SHAKE_MIN_SPEED) {
    const sign = Math.sign(grab.vx)
    if (state.shakeSignX !== 0 && sign !== state.shakeSignX) state.shakeAmount += 1
    state.shakeSignX = sign
  }
  if (Math.abs(grab.vy) > SHAKE_MIN_SPEED) {
    const sign = Math.sign(grab.vy)
    if (state.shakeSignY !== 0 && sign !== state.shakeSignY) state.shakeAmount += 1
    state.shakeSignY = sign
  }
  if (state.shakeAmount >= SHAKE_REVERSALS_TO_DIZZY) {
    state.dizzy = DIZZY_SECONDS
    state.shakeAmount = SHAKE_REVERSALS_TO_DIZZY - 1
  }
}

/**
 * Hace que salude con la mano.
 *
 * @param state - Estado de la animación.
 */
export function startWave(state: NovaState) {
  state.waveTimer = WAVE_SECONDS
}

/**
 * Hace que baile, por ejemplo si se lo pides.
 *
 * @param state - Estado de la animación.
 */
export function startDance(state: NovaState) {
  if (state.dance < 0) state.dance = 0
}

/**
 * Empieza una vuelta completa; si ya está dando una, no la reinicia.
 *
 * @param state - Estado de la animación.
 */
export function startSpin(state: NovaState) {
  if (state.isSpinning) return
  state.isSpinning = true
  state.spin = 0
}

/**
 * Hace que enseñe la espalda unos segundos.
 *
 * @param state - Estado de la animación.
 */
export function showBack(state: NovaState) {
  state.backTimer = SHOW_BACK_SECONDS
}

/**
 * Calcula el camino más corto entre dos giros.
 *
 * @param from - Giro actual.
 * @param to - Giro deseado.
 * @returns Lo que hay que girar, de -PI a PI.
 */
const shortestTurn = (from: number, to: number) => {
  const difference = to - from
  return Math.atan2(Math.sin(difference), Math.cos(difference))
}

/**
 * Convierte una dirección en un giro. Se queda en las vistas de la hoja del personaje: abajo se ve
 * de frente, de lado casi de perfil, y solo de espaldas si sube casi en línea recta.
 *
 * @param x - Parte horizontal de la dirección.
 * @param y - Parte vertical de la dirección; positiva hacia abajo.
 * @returns El giro en radianes.
 */
function yawForHeading(x: number, y: number) {
  const angle = Math.atan2(Math.abs(x), y)
  const sideAngle = Math.PI / 2
  const yaw = angle <= sideAngle ? angle * (MAX_YAW / sideAngle) : angle > BACK_VIEW_ANGLE ? Math.PI : MAX_YAW
  return Math.sign(x || 1) * yaw
}

/**
 * Reacción al interrumpirla: un sobresalto breve, sin destellos.
 *
 * @param state - Estado de la animación.
 */
export function flinch(state: NovaState) {
  state.jolt = 0.7
}

export function poke(state: NovaState) {
  state.jolt = 1
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2
    emit(state, {
      kind: 'star',
      x: CANVAS_SIZE / 2 + state.x,
      y: HEAD_Y + state.y,
      vx: Math.cos(angle) * 34,
      vy: Math.sin(angle) * 30,
      life: 0.55,
      color: hex('#FFE6B5'),
    })
  }
}

/**
 * Calcula la pose objetivo combinando la emoción con la actividad actual.
 *
 * @param input - Datos del paso actual.
 * @returns La pose a la que debe acercarse Nova.
 */
function targetPose(input: NovaInput): Pose {
  const base = blendPoses(input.blend)

  // La cargan: alza los brazos como si colgara, y las llamas se agitan.
  if (input.grab.held) {
    return {
      ...base,
      armLeft: 2.5,
      armRight: 2.5,
      hairWild: Math.max(base.hairWild, 1.3),
      hairSpeed: base.hairSpeed * 1.5,
      bobHeight: 0,
      lift: base.lift - 5,
    }
  }
  // Baila: alza los brazos, y las llamas se avivan con el ritmo.
  if (input.isDancing) {
    return {
      ...base,
      armLeft: 1.85,
      armRight: 1.85,
      hairWild: Math.max(base.hairWild, 1.4),
      hairSpeed: base.hairSpeed * 1.5,
      eyeSmile: Math.max(base.eyeSmile, 0.55),
      sparkleRate: Math.max(base.sparkleRate, 14),
    }
  }
  // Va volando: lleva los brazos hacia el frente, y si no siente nada en particular, va contenta.
  if (Math.hypot(input.grab.vx, input.grab.vy) > 20) {
    return {
      ...base,
      armLeft: 1.25,
      armRight: 1.25,
      hairWild: Math.max(base.hairWild, 1.1),
      bobHeight: base.bobHeight * 0.5,
      eyeSmile: input.blend.length === 0 ? Math.max(base.eyeSmile, 0.3) : base.eyeSmile,
    }
  }
  if (input.activity === 'thinking') {
    return {
      ...base,
      armRight: 1.7,
      hairSpeed: base.hairSpeed * 0.75,
      bobHeight: base.bobHeight * 0.7,
      sparkleRate: Math.max(base.sparkleRate, 5),
    }
  }
  if (input.activity === 'searching' || input.activity === 'reading' || input.activity === 'writing') {
    // Las manos bajan hacia el teclado, a los lados del cuerpo para que se vean teclear.
    return { ...base, armLeft: 0.42, armRight: 0.42, bobHeight: base.bobHeight * 0.4 }
  }
  if (input.activity === 'listening') {
    return { ...base, armLeft: base.armLeft + 0.3, armRight: base.armRight + 0.3, lift: base.lift - 1 }
  }
  return base
}

/**
 * Interpola las escalas de color de las llamas.
 *
 * @param current - Escala actual.
 * @param target - Escala objetivo.
 * @param t - Avance de la mezcla, de 0 a 1.
 * @returns La escala intermedia.
 */
function blendRamp(current: FlameRamp, target: FlameRamp, t: number): FlameRamp {
  return {
    back: mix(current.back, target.back, t),
    deep: mix(current.deep, target.deep, t),
    mid: mix(current.mid, target.mid, t),
    light: mix(current.light, target.light, t),
    core: mix(current.core, target.core, t),
  }
}

/**
 * Avanza la simulación un paso: pose, brazos, mirada, flotación y partículas.
 *
 * @param state - Estado de la animación; se modifica directamente.
 * @param input - Datos del paso actual.
 */
export function stepNova(state: NovaState, input: NovaInput) {
  const { dt, level, activity } = input
  const motion = input.reducedMotion ? 0.25 : 1

  trackShaking(state, input.grab, dt)
  const dizziness = Math.min(1, state.dizzy)

  // Baila cuando algo la emociona de golpe mientras te responde: no por el ánimo que ya traía al
  // abrir la app, ni mientras la cargan o usa la compu.
  const jumped = input.excitement >= DANCE_THRESHOLD && input.excitement - state.lastExcitement >= DANCE_JUMP
  const isReplying = activity === 'thinking' || activity === 'speaking'
  state.lastExcitement = input.excitement
  if (jumped && isReplying && !input.grab.held && state.dance < 0 && !input.reducedMotion) {
    state.dance = 0
    state.jolt = 1
  }
  const wasBeforeSpin = state.dance >= 0 && state.dance < DANCE_SPIN_AT
  if (state.dance >= 0) state.dance += dt
  if (state.dance >= DANCE_SECONDS || input.grab.held) state.dance = -1
  if (wasBeforeSpin && state.dance >= DANCE_SPIN_AT) startSpin(state)
  // Mareada no está para bailes.
  if (dizziness > 0) state.dance = -1
  const isDancing = state.dance >= 0
  const pose = targetPose({ ...input, isDancing })
  // Mareada: los brazos le cuelgan y las llamas se le caen un poco.
  const target =
    dizziness > 0 && !input.grab.held
      ? { ...pose, armLeft: 0.25, armRight: 0.25, hairDroop: Math.max(pose.hairDroop, 0.3), bobHeight: 0 }
      : pose

  // Actualiza los relojes, la aparición y el volumen suavizado de la voz.
  state.time += dt
  state.emotion = dominantEmotion(input.blend)

  // Suaviza el peso de cada emoción para que los gestos entren y salgan poco a poco.
  const weights = blendWeights(input.blend)
  for (const name of EMOTIONS) {
    const goal = weights.find((item) => item.name === name)?.intensity ?? 0
    state.feel[name] = approach(state.feel[name], goal, 6, dt)
  }
  state.appear = Math.min(1, state.appear + dt / APPEAR_SECONDS)
  state.level = approach(state.level, level, level > state.level ? 28 : 11, dt)
  state.jolt = Math.max(0, state.jolt - dt * 2.5)

  // Lleva la pose y los colores gradualmente hacia la emoción actual.
  for (const key of NUMERIC_POSE_KEYS) {
    state.pose[key] = approach(state.pose[key], target[key], 5.5, dt)
  }
  const colorStep = 1 - Math.exp(-4 * dt)
  state.pose.ramp = blendRamp(state.pose.ramp, target.ramp, colorStep)
  state.pose.eyeOuter = mix(state.pose.eyeOuter, target.eyeOuter, colorStep)
  state.pose.eyeInner = mix(state.pose.eyeInner, target.eyeInner, colorStep)

  // Avanza los ciclos de flotación y de llamas; la voz aviva las llamas.
  state.phase += dt * state.pose.bobSpeed
  state.hairPhase += dt * state.pose.hairSpeed * (1 + state.level * 0.8)

  const acting = performEmotions(state, dt, motion)

  // Al cargarla, el cuerpo se queda atrás del movimiento, y al soltarla cae con un rebote.
  const held = input.grab.held
  // Al ir de un lado a otro por su cuenta vuela: casi como cargada, con el portal apagado.
  const isFlying = !held && Math.hypot(input.grab.vx, input.grab.vy) > 20
  state.grabbed = approach(state.grabbed, held ? 1 : isFlying ? 0.7 : 0, held ? 14 : 7, dt)
  state.grabVx = approach(state.grabVx, input.grab.vx, 10, dt)
  state.grabVy = approach(state.grabVy, input.grab.vy, 10, dt)
  if (state.wasHeld && !held && !input.reducedMotion) poke(state)
  state.wasHeld = held
  state.actX += clamp(-state.grabVx * 0.012, -13, 13) * motion
  state.actY += clamp(-state.grabVy * 0.01, -9, 9) * motion
  state.bodyStretch += state.grabbed * (0.13 + Math.abs(state.grabVy) * 0.00012) * motion

  // Mareada: se tambalea en círculos, cada vez menos conforme se le pasa.
  if (dizziness > 0) {
    state.actX += Math.sin(state.time * 3.6) * 6 * dizziness * motion
    state.actY += Math.cos(state.time * 7.2) * 2.5 * dizziness * motion
  }

  // El baile: se mece de lado a lado, brinca en cada golpe y se estira al subir.
  const beat = isDancing ? state.dance * DANCE_BEAT : 0
  const danceHop = isDancing ? Math.abs(Math.sin(beat)) : 0
  if (isDancing) {
    state.actX += Math.sin(beat) * 9
    state.actY -= danceHop * 7
    state.bodyStretch += (danceHop - 0.4) * 0.16
    // Las notas salen al ritmo, a los lados de las llamas.
    if (Math.random() < dt * 5) {
      const side = Math.random() < 0.5 ? -1 : 1
      emit(state, {
        kind: 'note',
        x: CANVAS_SIZE / 2 + state.x + side * random(28, 44),
        y: HEAD_Y + state.y - random(6, 30),
        vx: side * random(2, 8),
        vy: random(-20, -10),
        life: random(0.8, 1.3),
        color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
      })
    }
  }

  // La compu aparece poco a poco, y cada mano teclea a su propio ritmo para no verse mecánica.
  // Escribir en otra app se ve igual que buscar: Nova teclea en su compu.
  const searching = activity === 'searching' || activity === 'writing'
  const reading = activity === 'reading'
  state.typing = approach(state.typing, searching || reading ? 1 : 0, 5, dt)
  state.keying = approach(state.keying, searching ? 1 : 0, 8, dt)
  state.reachLeft = Math.max(0, Math.sin(state.time * 19)) * 5 * state.keying * motion
  state.reachRight = Math.max(0, Math.sin(state.time * 23 + 1.7)) * 5 * state.keying * motion

  // Brazos con resorte: se pasan un poco y vuelven, lo que les quita rigidez.
  // Mientras la cargan patalea con los brazos, más cuanto más rápido la muevan.
  const speed = Math.hypot(state.grabVx, state.grabVy)
  const flail = Math.sin(state.time * 15) * state.grabbed * (0.12 + Math.min(0.32, speed * 0.0005)) * motion
  // Al bailar, cada brazo sube y baja a contratiempo del otro.
  const danceWave = isDancing ? Math.sin(beat) * 0.6 : 0
  state.waveTimer = Math.max(0, state.waveTimer - dt)
  const waveGoal = state.waveTimer > 0 && !held ? WAVE_ARM + Math.sin(state.time * 11) * 0.35 : null
  const gesture = activity === 'speaking' ? Math.sin(state.time * 5.5) * 0.28 * (0.3 + state.level) : 0
  const stiffness = 62
  const damping = 9
  const stepArm = (angle: number, velocity: number, goal: number): [number, number] => {
    const next = velocity + (stiffness * (goal - angle) - damping * velocity) * dt
    return [angle + next * dt, next]
  }
  // La alegría agita los brazos en proporción a lo que pesa dentro de la mezcla.
  const happiness = input.blend.find((item) => item.name === 'happy')?.intensity ?? 0
  const happyWave = Math.sin(state.time * 8) * 0.28 * happiness
  ;[state.armLeft, state.armLeftVelocity] = stepArm(state.armLeft, state.armLeftVelocity, target.armLeft + gesture + happyWave + acting.armLeft + flail + danceWave)
  ;[state.armRight, state.armRightVelocity] = stepArm(state.armRight, state.armRightVelocity, waveGoal ?? target.armRight - gesture - happyWave + acting.armRight - flail - danceWave)

  // Hacia dónde mira y se desplaza.
  const center = CANVAS_SIZE / 2
  const pointer = input.pointer
  if (pointer && (pointer.x !== state.lastPointer?.x || pointer.y !== state.lastPointer?.y)) {
    state.sinceMoved = 0
    state.lastPointer = pointer
  } else {
    state.sinceMoved += dt
  }
  // Elige de vez en cuando un punto al que mirar cuando el cursor está quieto.
  if (Math.random() < dt * 0.45) {
    state.wanderX = random(-0.8, 0.8)
    state.wanderY = random(-0.45, 0.45)
  }

  // Prioridad de la mirada: la compu, pensar, luego el cuadro de texto, luego el cursor reciente.
  let gazeX = state.wanderX
  let gazeY = state.wanderY
  let driftGoal = 0
  if (held) {
    // Mira hacia donde la llevan.
    gazeX = clamp(state.grabVx * 0.004, -1, 1)
    gazeY = clamp(state.grabVy * 0.004, -1, 1)
  } else if (dizziness > 0) {
    // Los ojos ya dan vueltas: la mirada no se fija en nada.
    gazeX = 0
    gazeY = 0
  } else if (state.isSpinning || state.backTimer > 0) {
    // Da la vuelta o enseña la espalda: la mirada se queda quieta para no marear.
    gazeX = 0
    gazeY = 0
  } else if (input.grab.heading) {
    // Mira a dónde va, también un momento antes de arrancar.
    gazeX = input.grab.heading.x
    gazeY = input.grab.heading.y
  } else if (reading) {
    // Te cuenta lo que encontró: te mira y de vez en cuando vuelve a revisar la pantalla.
    const checksScreen = Math.sin(state.time * 0.9) > 0.55
    gazeX = checksScreen ? Math.sin(state.time * 1.6) * 0.55 : 0
    gazeY = checksScreen ? 0.9 : 0
  } else if (searching) {
    // Lee la pantalla de un lado a otro.
    gazeX = Math.sin(state.time * 1.6) * 0.55
    gazeY = 0.9
  } else if (activity === 'thinking') {
    gazeX = Math.sin(state.time * 1.1) * 0.75
    gazeY = -0.75
  } else if (input.lookAtInput) {
    gazeX = 0
    gazeY = 1
  } else if (pointer && state.sinceMoved < WANDER_AFTER_SECONDS) {
    gazeX = clamp((pointer.x - (center + state.x)) / 34, -1, 1)
    gazeY = clamp((pointer.y - (HEAD_Y + state.y)) / 40, -1, 1)
    // La atracción negativa hace que huya del cursor en lugar de acercarse.
    driftGoal = clamp((pointer.x - center) * 0.14 * state.pose.cursorAttraction, -10, 10)
  }
  state.lookX = approach(state.lookX, clamp(gazeX + acting.gazeX, -1, 1), 14, dt)
  state.lookY = approach(state.lookY, gazeY, 9, dt)

  // Voltea el cuerpo según a dónde va; de vez en cuando se gira un poco solo por mirar algo.
  // La cabeza llega primero y se pasa tantito; el cuerpo la sigue. Con la compu sigue de frente.
  state.backTimer = Math.max(0, state.backTimer - dt)
  const heading = input.grab.heading
  const carriedYaw = held ? clamp(state.grabVx / 250, -1, 1) * MAX_YAW : 0
  const travelYaw = state.backTimer > 0 ? Math.PI : heading ? yawForHeading(heading.x, heading.y) : carriedYaw
  const frontFacing = 1 - state.typing
  // Al bailar voltea de un lado a otro, a la mitad del ritmo de los brincos.
  const danceTurn = isDancing ? Math.sin(beat * 0.5) * 0.75 : 0
  // Si va a algún lado ya está volteando hacia allá: sumarle la mirada le escondería la cara.
  const glance = heading ? 0 : state.lookX
  const dizzyTurn = Math.sin(state.time * 3.6 + 0.8) * 0.3 * dizziness
  const headGoal = (travelYaw + glance * 0.32 + danceTurn + dizzyTurn) * frontFacing
  const bodyGoal = (travelYaw * 0.9 + glance * 0.1 + danceTurn * 0.8) * frontFacing
  const headTurn = shortestTurn(state.faceYaw, headGoal)
  // Al cambiar de lado parpadea, como en los dibujos animados: oculta el giro y lo hace más vivo.
  if (Math.abs(headTurn) > 1.2 && state.blink <= 0) state.blink = 1
  state.faceYawVelocity += (70 * headTurn - 11 * state.faceYawVelocity) * dt
  state.faceYaw += state.faceYawVelocity * dt
  state.torsoYaw += shortestTurn(state.torsoYaw, bodyGoal) * (1 - Math.exp(-6 * dt))

  // La vuelta completa se suma al giro: la cabeza va adelante y el cuerpo la alcanza al final.
  if (state.isSpinning) {
    state.spin += ((Math.PI * 2) / SPIN_SECONDS) * dt
    if (input.reducedMotion || state.spin >= Math.PI * 2 + SPIN_BODY_LAG) {
      state.isSpinning = false
      state.spin = 0
    }
  }
  const spinEase = (angle: number) => Math.PI * 2 * (0.5 - 0.5 * Math.cos(Math.PI * clamp(angle / (Math.PI * 2), 0, 1)))
  state.headYaw = state.faceYaw + (state.isSpinning ? spinEase(state.spin) : 0)
  state.bodyYaw = state.torsoYaw + (state.isSpinning ? spinEase(state.spin - SPIN_BODY_LAG) : 0)
  state.flameYaw += shortestTurn(state.flameYaw, state.headYaw) * (1 - Math.exp(-11 * dt))

  // Se desplaza con un resorte hacia el cursor.
  const previousX = state.x
  state.xVelocity += (22 * (driftGoal * motion - state.x) - 8 * state.xVelocity) * dt
  state.x += state.xVelocity * dt
  // La cola reacciona tarde al movimiento y a la flotación.
  const travel = dt > 0 ? (state.x - previousX) / dt : 0
  // La cola también se queda atrás al arrastrarla.
  const tailDrag = clamp(-state.grabVx * 0.012, -9, 9) * state.grabbed * motion
  const tailGoal = -travel * 0.45 + Math.sin(state.phase * 0.9) * 1.5 * motion + tailDrag
  state.tailSway = approach(state.tailSway, tailGoal, state.grabbed > 0.5 ? 12 : 5, dt)

  // Calcula la altura: flotación, emoción, voz y el brinco del clic. El enojo añade temblor.
  const bob = Math.sin(state.phase * Math.PI * 0.6) * state.pose.bobHeight * motion
  state.y = state.pose.lift + bob + state.actY - state.level * 2 - state.jolt * 6
  state.shakeX = state.pose.shake > 0.05 ? Math.round(Math.sin(state.time * 47) * state.pose.shake * motion) : 0

  // Parpadea a intervalos aleatorios para no parecer mecánica.
  state.nextBlink -= dt
  if (state.nextBlink <= 0) {
    state.blink = 1
    state.nextBlink = random(2.2, 5.5)
  }
  state.blink = Math.max(0, state.blink - dt * 7)

  // Genera partículas: de ambiente si ya apareció; convergentes mientras se materializa.
  const headX = center + state.x
  const headY = HEAD_Y + state.y
  const rate = (state.pose.sparkleRate + state.level * 10) * motion
  if (state.appear >= 1) {
    state.sparkleBudget += rate * dt
    while (state.sparkleBudget >= 1) {
      state.sparkleBudget -= 1
      // Cada partícula sale de una emoción al azar según su peso: las mezclas se ven mezcladas.
      spawnAmbient(state, sampleEmotion(input.blend), headX, headY, state.level)
    }
  } else if (Math.random() < dt * 28) {
    const angle = random(0, Math.PI * 2)
    const distance = random(24, 48)
    emit(state, {
      kind: 'star',
      x: headX + Math.cos(angle) * distance,
      y: headY + 20 + Math.sin(angle) * distance,
      vx: -Math.cos(angle) * 28,
      vy: -Math.sin(angle) * 28,
      life: 0.7,
      color: hex('#A9D6FF'),
    })
  }
  // Mientras piensa, unos puntos orbitan alrededor de las llamas.
  if (activity === 'thinking' && Math.random() < dt * 7) {
    emit(state, { kind: 'dot', x: headX + Math.cos(state.time * 3.4) * 32, y: headY - 26 + Math.sin(state.time * 3.4) * 11, vx: 0, vy: 0, life: 0.6, color: hex('#FFE6B5') })
  }

  // Cada tecla suelta una chispa junto a las manos.
  if (searching && state.typing > 0.8 && !input.reducedMotion && Math.random() < dt * 11) {
    const side = Math.random() < 0.5 ? -1 : 1
    emit(state, { kind: 'dot', x: headX + state.actX + side * random(3, 13), y: headY + 33, vx: side * random(2, 10), vy: random(-30, -14), life: 0.45, color: hex('#7FE3FF') })
  }

  // Deja una estela de chispas detrás de ella al moverla.
  if (state.grabbed > 0.5 && speed > 120 && !input.reducedMotion && Math.random() < dt * 30) {
    const direction = Math.max(speed, 1)
    emit(state, {
      kind: 'star',
      // Salen de detrás de ella: encima de la cara parecerían manchas en el visor.
      x: headX - (state.grabVx / direction) * 24 + random(-8, 8),
      y: headY - (state.grabVy / direction) * 24 + random(-10, 22),
      vx: (-state.grabVx / direction) * random(24, 60),
      vy: (-state.grabVy / direction) * random(24, 60),
      life: random(0.3, 0.6),
      color: hex('#BFE6FF'),
    })
  }

  // La nube de la tristeza deja caer lluvia.
  if (state.feel.sad > 0.3 && Math.random() < dt * 9 * state.feel.sad) {
    emit(state, { kind: 'drop', x: headX + random(-13, 13), y: headY - 34, vx: 0, vy: 34, life: 0.42, color: hex('#8FC3F2') })
  }

  // Mueve las partículas y retira las que agotaron su vida.
  state.particles = state.particles.filter((particle) => {
    particle.life -= dt
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    return particle.life > 0
  })
}
