/** Emociones de Nova y la pose que corresponde a cada una. */

import { hex, mix, type RGB } from './pixelBuffer'

/** Emociones disponibles; coinciden con las que envía el backend. */
export const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'curious',
  'afraid',
  'worried',
  'stressed',
  'frustrated',
] as const
/** Una de las emociones de Nova. */
export type Emotion = (typeof EMOTIONS)[number]

/** Una emoción y su fuerza, de 0 a 1. */
export type EmotionComponent = {
  name: Emotion
  intensity: number
}

/** Emociones sentidas a la vez; una lista vacía significa calma. */
export type EmotionBlend = EmotionComponent[]

/** Lo que está haciendo Nova en este momento. */
export type Activity = 'idle' | 'listening' | 'thinking' | 'speaking' | 'searching' | 'reading' | 'writing'

/** Nombre de cada emoción tal como se muestra en la interfaz. */
export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: 'Tranquila',
  happy: 'Feliz',
  sad: 'Triste',
  angry: 'Enojada',
  surprised: 'Sorprendida',
  curious: 'Curiosa',
  afraid: 'Asustada',
  worried: 'Preocupada',
  stressed: 'Estresada',
  frustrated: 'Frustrada',
}

/** Escala de colores de las llamas, de la capa más oscura a la más brillante. */
export type FlameRamp = {
  back: RGB
  deep: RGB
  mid: RGB
  light: RGB
  core: RGB
}

/** Todos los parámetros que definen cómo se ve y se mueve Nova en una emoción. */
export type Pose = {
  armLeft: number // radianes desde "colgando": 0 abajo, PI arriba
  armRight: number
  hairLength: number
  hairDroop: number
  hairSpeed: number
  hairWild: number
  bobHeight: number
  bobSpeed: number
  lift: number // negativo sube, positivo baja
  eyeWidth: number
  eyeHeight: number
  eyeSlant: number // positivo: ceño hacia dentro; negativo: caído hacia fuera
  eyeSmile: number
  eyeRightScale: number
  shake: number
  ramp: FlameRamp
  eyeOuter: RGB
  eyeInner: RGB
  sparkleRate: number
  cursorAttraction: number // 1 se acerca al cursor; negativo se aleja de él
  bodyStretch: number // 1 normal; menos de 1 encoge el cuerpo
  headSink: number // píxeles que la cabeza se hunde entre los hombros
}

/** Llamas azul y violeta del boceto original. */
const BASE_RAMP: FlameRamp = {
  // Colores de la paleta de la hoja del personaje.
  back: hex('#412CA3'),
  deep: hex('#5844CA'),
  mid: hex('#6077F7'),
  light: hex('#A7CDFE'),
  core: hex('#FEE7C5'),
}

/** Pose tranquila; las demás emociones parten de ella y cambian lo necesario. */
const BASE: Pose = {
  // Postura del cuerpo.
  armLeft: 0.62,
  armRight: 0.62,
  // Comportamiento de las llamas.
  hairLength: 1,
  hairDroop: 0,
  hairSpeed: 1,
  hairWild: 0.55,
  // Flotación.
  bobHeight: 2.2,
  bobSpeed: 1.7,
  lift: 0,
  // Forma de los ojos.
  eyeWidth: 2.2,
  eyeHeight: 10,
  eyeSlant: 0,
  eyeSmile: 0,
  eyeRightScale: 1,
  shake: 0,
  // Colores y cantidad de destellos.
  ramp: BASE_RAMP,
  eyeOuter: hex('#6F86FF'),
  eyeInner: hex('#D6EEFF'),
  sparkleRate: 3,
  cursorAttraction: 1,
  bodyStretch: 1,
  headSink: 0,
}

/** Pose de cada emoción. */
export const POSES: Record<Emotion, Pose> = {
  // Tranquila: la pose base, sin cambios.
  neutral: BASE,

  // Feliz: brazos arriba, rebote rápido, llamas de cielo y oro, y ojos sonrientes.
  happy: {
    ...BASE,
    headSink: -1,
    armLeft: 1.75,
    armRight: 1.75,
    hairLength: 1.15,
    hairSpeed: 1.5,
    hairWild: 0.8,
    bobHeight: 5,
    bobSpeed: 4.5,
    lift: -4,
    eyeWidth: 5.2,
    eyeHeight: 11,
    eyeSmile: 1,
    ramp: {
      back: hex('#2F3FB0'),
      deep: hex('#4C7CF5'),
      mid: hex('#6FD3FF'),
      light: hex('#FFE98A'),
      core: hex('#FFF9DC'),
    },
    eyeOuter: hex('#FFD66B'),
    eyeInner: hex('#FFF9DC'),
    sparkleRate: 14,
  },
  // Triste: brazos caídos, flota bajo y lento, llamas azules y cortas.
  sad: {
    ...BASE,
    headSink: 4,
    bodyStretch: 0.82,
    armLeft: 0.02,
    armRight: 0.02,
    hairLength: 0.55,
    hairDroop: 1.25,
    hairSpeed: 0.4,
    hairWild: 0.15,
    bobHeight: 0.7,
    bobSpeed: 0.6,
    lift: 11,
    eyeWidth: 3.2,
    eyeHeight: 8,
    eyeSlant: -0.85,
    ramp: {
      back: hex('#1B2359'),
      deep: hex('#2E3F92'),
      mid: hex('#4C69B8'),
      light: hex('#86A9D8'),
      core: hex('#B6CDE8'),
    },
    eyeOuter: hex('#5B7FC2'),
    eyeInner: hex('#BBD7F2'),
    sparkleRate: 0.5,
  },
  // Enojada: fuego rojo y agitado, ceño fruncido y temblor.
  angry: {
    ...BASE,
    headSink: 1,
    armLeft: 1.3,
    armRight: 1.3,
    hairLength: 1.25,
    hairSpeed: 3.6,
    hairWild: 1.8,
    bobHeight: 1,
    bobSpeed: 2.6,
    lift: -1,
    eyeWidth: 3.8,
    eyeHeight: 8.5,
    eyeSlant: 0.95,
    shake: 1.8,
    ramp: {
      back: hex('#5A1020'),
      deep: hex('#B5202C'),
      mid: hex('#F0512D'),
      light: hex('#FFA53A'),
      core: hex('#FFE38A'),
    },
    eyeOuter: hex('#FF4B31'),
    eyeInner: hex('#FFD78A'),
    sparkleRate: 18,
  },
  // Sorprendida: salta, llamas altas y ojos muy abiertos.
  surprised: {
    ...BASE,
    headSink: -2,
    bodyStretch: 1.08,
    armLeft: 1.75,
    armRight: 1.75,
    hairLength: 1.25,
    hairSpeed: 1.8,
    hairWild: 1,
    bobHeight: 1,
    bobSpeed: 2,
    lift: -7,
    eyeWidth: 5.5,
    eyeHeight: 14,
    ramp: {
      ...BASE_RAMP,
      mid: hex('#7FA2FF'),
      light: hex('#CFEAFF'),
      core: hex('#FFF4CF'),
    },
    eyeInner: hex('#FFFFFF'),
    sparkleRate: 14,
  },
  // Curiosa: un brazo levantado, un ojo más grande y tonos turquesa.
  curious: {
    ...BASE,
    cursorAttraction: 1.6,
    armLeft: 0.4,
    armRight: 1.7,
    hairLength: 1.06,
    hairSpeed: 1.1,
    hairWild: 0.65,
    bobHeight: 1.8,
    bobSpeed: 1.4,
    eyeWidth: 3.4,
    eyeHeight: 10,
    eyeRightScale: 1.5,
    ramp: {
      ...BASE_RAMP,
      mid: hex('#6FA0FF'),
      light: hex('#B8F0FF'),
      core: hex('#E4FFF4'),
    },
    eyeOuter: hex('#58B8FF'),
    eyeInner: hex('#E2FBFF'),
    sparkleRate: 5,
  },

  // Asustada: se encoge, tiembla, ojos enormes, llamas pálidas y huye del cursor.
  afraid: {
    ...BASE,
    headSink: 5,
    bodyStretch: 0.78,
    armLeft: 2.2,
    armRight: 2.2,
    hairLength: 0.55,
    hairDroop: 0.45,
    hairSpeed: 2.2,
    hairWild: 0.75,
    bobHeight: 0.6,
    bobSpeed: 2.4,
    lift: 6,
    eyeWidth: 5,
    eyeHeight: 15,
    eyeSlant: -0.2,
    shake: 1.3,
    ramp: {
      back: hex('#2C2A58'),
      deep: hex('#58579A'),
      mid: hex('#918FC9'),
      light: hex('#CFCFEE'),
      core: hex('#F2F2FF'),
    },
    eyeOuter: hex('#A7B4E8'),
    eyeInner: hex('#FFFFFF'),
    sparkleRate: 5,
    cursorAttraction: -2,
  },

  // Preocupada: brazos recogidos, cejas caídas, llamas apagadas y gotas de sudor.
  worried: {
    ...BASE,
    headSink: 2,
    bodyStretch: 0.94,
    armLeft: -0.28,
    armRight: -0.28,
    hairLength: 0.8,
    hairDroop: 0.45,
    hairSpeed: 0.8,
    hairWild: 0.4,
    bobHeight: 1.4,
    bobSpeed: 1.1,
    lift: 4,
    eyeWidth: 3.1,
    eyeHeight: 12,
    eyeSlant: -0.6,
    ramp: {
      back: hex('#1F2F5C'),
      deep: hex('#36609A'),
      mid: hex('#5A92B8'),
      light: hex('#A0CFD6'),
      core: hex('#DCEFE4'),
    },
    eyeOuter: hex('#6AA8C4'),
    eyeInner: hex('#DDF4F2'),
    sparkleRate: 3,
    cursorAttraction: 0.5,
  },

  // Estresada: agitada y rápida, llamas amarillas erráticas, ojos tensos y garabatos.
  stressed: {
    ...BASE,
    armLeft: 1.45,
    armRight: 1.45,
    hairLength: 1.02,
    hairSpeed: 4.6,
    hairWild: 2.2,
    bobHeight: 1.6,
    bobSpeed: 7,
    lift: -1,
    eyeWidth: 2.7,
    eyeHeight: 7,
    eyeSlant: 0.14,
    shake: 1.1,
    ramp: {
      back: hex('#4A2C60'),
      deep: hex('#9A4B8E'),
      mid: hex('#D98A5E'),
      light: hex('#F2CE5E'),
      core: hex('#FFF5B8'),
    },
    eyeOuter: hex('#E8A94A'),
    eyeInner: hex('#FFF3C0'),
    sparkleRate: 10,
    cursorAttraction: 0.7,
  },

  // Frustrada: pesada, ojos a medio cerrar, fuego apagado y vapor saliendo a los lados.
  frustrated: {
    ...BASE,
    headSink: 2,
    bodyStretch: 0.9,
    armLeft: 0.1,
    armRight: 0.1,
    hairLength: 0.85,
    hairDroop: 0.12,
    hairSpeed: 1.5,
    hairWild: 0.85,
    bobHeight: 0.8,
    bobSpeed: 0.9,
    lift: 6,
    eyeWidth: 3.8,
    eyeHeight: 4.5,
    eyeSlant: 0.3,
    ramp: {
      back: hex('#3E1F22'),
      deep: hex('#7D3B2B'),
      mid: hex('#B9683A'),
      light: hex('#D99A5A'),
      core: hex('#EFC98C'),
    },
    eyeOuter: hex('#D2763C'),
    eyeInner: hex('#F7D29A'),
    sparkleRate: 4,
    cursorAttraction: 0.3,
  },
}

const MIN_LABEL_INTENSITY = 0.2
const MAX_LABELS = 3
// Por debajo de 1 realza las intensidades medias: una tristeza de 0.3 ya se nota.
const PERCEIVED_INTENSITY_EXPONENT = 0.6

/** Campos de la pose que se mezclan como números. */
export const NUMERIC_POSE_KEYS = [
  'armLeft',
  'armRight',
  'hairLength',
  'hairDroop',
  'hairSpeed',
  'hairWild',
  'bobHeight',
  'bobSpeed',
  'lift',
  'eyeWidth',
  'eyeHeight',
  'eyeSlant',
  'eyeSmile',
  'eyeRightScale',
  'shake',
  'sparkleRate',
  'cursorAttraction',
  'bodyStretch',
  'headSink',
] as const

/**
 * Reparte el peso entre las emociones; lo que no ocupan queda como calma.
 *
 * @param blend - Emociones sentidas.
 * @returns Cada emoción con su peso, incluida la calma; los pesos suman 1.
 */
export function blendWeights(blend: EmotionBlend): EmotionComponent[] {
  // Convierte la intensidad en lo que se percibe a simple vista.
  const perceived = blend.map((item) => ({
    name: item.name,
    intensity: item.intensity ** PERCEIVED_INTENSITY_EXPONENT,
  }))
  const total = perceived.reduce((sum, item) => sum + item.intensity, 0)

  // Si las emociones superan 1 entre todas, se normalizan y la calma desaparece.
  const scale = total > 1 ? 1 / total : 1
  const weights = perceived.map((item) => ({ name: item.name, intensity: item.intensity * scale }))
  weights.push({ name: 'neutral', intensity: Math.max(0, 1 - total * scale) })
  return weights
}

/**
 * Combina las poses de varias emociones según su peso.
 *
 * @param blend - Emociones sentidas.
 * @returns Una pose intermedia entre todas ellas.
 */
export function blendPoses(blend: EmotionBlend): Pose {
  const weights = blendWeights(blend)
  const result: Pose = { ...POSES.neutral }

  // Promedia cada parámetro numérico.
  for (const key of NUMERIC_POSE_KEYS) {
    result[key] = weights.reduce((sum, item) => sum + POSES[item.name][key] * item.intensity, 0)
  }

  /**
   * Promedia un color de todas las poses.
   *
   * @param pick - Selecciona el color dentro de una pose.
   * @returns El color promedio.
   */
  const mixColor = (pick: (pose: Pose) => RGB): RGB => {
    let color = pick(POSES.neutral)
    let accumulated = 0
    for (const item of weights) {
      accumulated += item.intensity
      if (accumulated > 0) color = mix(color, pick(POSES[item.name]), item.intensity / accumulated)
    }
    return color
  }

  // Promedia los colores de las llamas y de los ojos.
  result.ramp = {
    back: mixColor((pose) => pose.ramp.back),
    deep: mixColor((pose) => pose.ramp.deep),
    mid: mixColor((pose) => pose.ramp.mid),
    light: mixColor((pose) => pose.ramp.light),
    core: mixColor((pose) => pose.ramp.core),
  }
  result.eyeOuter = mixColor((pose) => pose.eyeOuter)
  result.eyeInner = mixColor((pose) => pose.eyeInner)
  return result
}

/**
 * Obtiene la emoción más fuerte de una mezcla.
 *
 * @param blend - Emociones sentidas.
 * @returns La emoción dominante, o `neutral` si no hay ninguna.
 */
export function dominantEmotion(blend: EmotionBlend): Emotion {
  let strongest: EmotionComponent = { name: 'neutral', intensity: 0 }
  for (const item of blend) {
    if (item.intensity > strongest.intensity) strongest = item
  }
  return strongest.name
}

/**
 * Elige una emoción al azar con probabilidad proporcional a su peso.
 *
 * @param blend - Emociones sentidas.
 * @returns La emoción elegida; puede ser la calma.
 */
export function sampleEmotion(blend: EmotionBlend): Emotion {
  let remaining = Math.random()
  const weights = blendWeights(blend)
  for (const item of weights) {
    remaining -= item.intensity
    if (remaining <= 0) return item.name
  }
  return 'neutral'
}

/**
 * Redacta la mezcla para mostrarla en pantalla, por ejemplo "Triste y preocupada".
 *
 * @param blend - Emociones sentidas.
 * @returns El texto, o una cadena vacía si Nova está en calma.
 */
export function describeBlend(blend: EmotionBlend): string {
  // Se muestran solo las emociones que se notan, de la más fuerte a la más débil.
  const labels = [...blend]
    .filter((item) => item.intensity >= MIN_LABEL_INTENSITY)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, MAX_LABELS)
    .map((item) => EMOTION_LABELS[item.name].toLowerCase())
  if (labels.length === 0) return ''

  // Une los nombres con comas y una "y" final, con la primera letra en mayúscula.
  const text =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
  return text[0].toUpperCase() + text.slice(1)
}
