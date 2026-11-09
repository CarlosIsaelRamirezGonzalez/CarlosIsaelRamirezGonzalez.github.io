/**
 * De dónde salen las respuestas de NOVA en el sitio.
 *
 * Hoy solo existe `ScriptedProvider`: respuestas escritas de antemano en `tour.ts`. La interfaz
 * deja preparado el lugar para una versión en vivo (un proxy sin servidor con límites de uso que
 * llame al modelo); cómo se haría y sus riesgos están en `docs/NOVA_LIVE.md`. Ninguna clave ni
 * token debe vivir en este código: el navegador nunca habla directo con el modelo.
 */
import { QUICK, type QuickAnswer } from './tour'

export interface NovaReply {
  text: string
  mood: QuickAnswer['mood']
}

export interface NovaProvider {
  /** Responde una pregunta. Puede tardar (una llamada de red) o fallar. */
  ask(question: string): Promise<NovaReply>
}

/** Respuestas fijas: solo contesta las preguntas que ya tienen respuesta escrita. */
export class ScriptedProvider implements NovaProvider {
  async ask(question: string): Promise<NovaReply> {
    const match = QUICK.find((item) => item.question === question)
    if (match) return { text: match.answer, mood: match.mood }
    return { text: 'Esa no la tengo preparada. Pregúntale a Carlos: su correo está en la sección de contacto.', mood: 'curious' }
  }
}
