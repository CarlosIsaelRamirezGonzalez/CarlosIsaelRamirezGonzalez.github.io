/**
 * Guion del tour de NOVA. Es texto editable: cambia aquí lo que dice, en qué orden y qué señala.
 *
 * NOVA sale de su recuadro y vuela hasta `target`, lo presenta y sigue con el siguiente punto.
 * `components` resalta nodos del diagrama. `id` también nombra el audio: `public/audio/nova/<id>.mp3`
 * (se generan con `scripts/generate-nova-audio.mjs`, con su voz real).
 */
import type { Mood } from './avatar'

export interface TourStep {
  id: string
  target: string
  mood: Mood
  text: string
  components?: string[]
  /** Gesto al llegar. */
  gesture?: 'wave' | 'dance' | 'spin'
  /** Dónde se coloca: junto al texto (por defecto) o debajo del bloque, para no tapar un diagrama. */
  place?: 'beside' | 'below'
}

export interface QuickAnswer {
  question: string
  answer: string
  mood: Mood
}

export const OFFER = 'Soy NOVA. Carlos me construyó; yo te enseño el sitio. Son unos minutos.'
export const GREETING = 'Hola. Puedo darte el tour del sitio o contestar las preguntas de abajo.'

export const TOUR: TourStep[] = [
  {
    id: 'paso-01',
    target: '#nombre',
    mood: 'happy',
    gesture: 'wave',
    text: 'Hola. Soy <b>NOVA</b>, la compañera de IA que Carlos construyó para su Mac. Él me hizo; yo te doy el tour. Empiezo por él: desarrollador full-stack con enfoque en IA generativa y sistemas agénticos, en Guadalajara, y trabaja en remoto.',
  },
  {
    id: 'paso-02',
    target: '#que-construyo dl > div:nth-child(1)',
    mood: 'speaking',
    text: 'Esto es lo que más hace: empleados virtuales con IA. Agentes que atienden clientes, dan seguimiento a quejas y validan documentos, con RAG y GraphRAG. Lo hace en DataSign desde abril de 2025.',
  },
  {
    id: 'paso-03',
    target: '#que-construyo dl > div:nth-child(2)',
    mood: 'speaking',
    text: 'También automatiza e integra: flujos con n8n y, en Atom, un frontend en React conectado a GoHighLevel a través de MCP.',
  },
  {
    id: 'paso-04',
    target: '#que-construyo dl > div:nth-child(3)',
    mood: 'speaking',
    text: 'Y construye web y móvil de inicio a publicación. Sus apps en Flutter, publicadas en DataSign y SoftCode, las usan más de 200 personas.',
  },
  {
    id: 'paso-05',
    target: '#que-construyo dl > div:nth-child(4)',
    mood: 'curious',
    text: 'Además da clases de IA y automatización en TopLearning, y asesorías. Le gusta explicar; se nota en cómo me documentó a mí.',
  },
  {
    id: 'paso-06',
    target: '#nova-caso',
    mood: 'happy',
    gesture: 'spin',
    text: 'Ahora, los proyectos. Esta soy yo. Vivo en su Mac: me llama por mi nombre, platico con voz en español de México, muestro lo que siento en mi cuerpo y recuerdo lo que me cuenta. Lo que ves aquí es mi renderizador real, en pixel art.',
  },
  {
    id: 'paso-07',
    target: '#alertia-caso',
    mood: 'speaking',
    text: 'Antes de mí hizo <b>AlertIA</b>: vigila cámaras con un modelo de visión y avisa por correo si ve un arma, un incendio o una pelea. Pide varias detecciones seguidas antes de alarmar; aprendió a no ser escandalosa.',
  },
  {
    id: 'paso-08',
    target: '#proyectos > div > div:last-of-type',
    mood: 'speaking',
    text: 'Para clientes construye empleados virtuales que ya están en producción: atención y seguimiento de quejas, validación de documentos y apps móviles en uso. No nombra a los clientes, y yo tampoco.',
  },
  {
    id: 'paso-09',
    target: '#nova-diagram',
    place: 'below',
    mood: 'speaking',
    components: ['voice-in', 'server', 'voice-out'],
    text: 'Así funciono por dentro. Me activo con «Oye Nova». Vosk y Whisper me escuchan dentro de la Mac; a internet solo viaja el texto. Respondo con voz de ElevenLabs, frase por frase, para no hacerte esperar. Esta voz que oyes es la misma.',
  },
  {
    id: 'paso-10',
    target: '#nova-diagram',
    place: 'below',
    mood: 'thinking',
    components: ['server', 'memory', 'qdrant', 'obsidian'],
    text: 'Recuerdo. Guardo lo importante en SQLite y lo sincronizo con Turso; busco por significado con Qdrant y Carlos lo puede leer en Obsidian. Si me dice «olvida eso», lo olvido de verdad.',
  },
  {
    id: 'paso-11',
    target: '#nova-diagram',
    place: 'below',
    mood: 'curious',
    components: ['claude', 'vision', 'desktop', 'writer'],
    text: 'Claude decide qué siento y mi cuerpo lo muestra. La cámara está apagada hasta que me piden mirar, y MediaPipe corre en el navegador. Cuando Carlos me dice «termina este mensaje», un Redactor aparte, sin herramientas ni memoria, teclea el borrador y nunca presiona Enter.',
  },
  {
    id: 'paso-12',
    target: '#nova ul.rows',
    mood: 'speaking',
    text: 'Resumen de lo que hago: hablo en español de México, se me ven las emociones, recuerdo, miro solo cuando me lo piden y escribo en otras apps sin enviar nada.',
  },
  {
    id: 'paso-13',
    target: '#trayectoria ol',
    mood: 'speaking',
    text: 'Su camino: SoftCode en 2024, con React, Flutter y FastAPI. DataSign desde abril de 2025. TopLearning desde enero de 2026, dando clases. Y Atom este año, como Ingeniero de IA Jr, con React y MCP.',
  },
  {
    id: 'paso-14',
    target: '#stack dl',
    mood: 'speaking',
    text: 'El stack, agrupado por lo que hace con cada cosa: Python y FastAPI en el backend; React, TypeScript, Tailwind y Flutter en las interfaces; Docker, Git y GitHub Actions para operar. Para IA: RAG, Qdrant y las APIs de Claude, OpenAI, Gemini y Grok.',
  },
  {
    id: 'paso-15',
    target: '#sobre-mi',
    mood: 'curious',
    text: 'Sobre él: estudió Desarrollo de Software, habla inglés a nivel C1 y empezó a trabajar en 2024. Yo soy donde prueba primero lo que después lleva a los clientes.',
  },
  {
    id: 'paso-16',
    target: '#contacto',
    mood: 'happy',
    gesture: 'dance',
    text: 'Si quieres trabajar con él, escríbele. Él contesta; yo todavía no tengo correo. Gracias por el paseo.',
  },
]

export const QUICK: QuickAnswer[] = [
  {
    question: '¿Qué stack usa?',
    mood: 'speaking',
    answer:
      'Python y FastAPI en el backend; React, TypeScript y Tailwind en la interfaz; Flutter en móvil. Para IA: RAG, Qdrant y las APIs de Claude, OpenAI, Gemini y Grok. Yo corro con Claude.',
  },
  {
    question: '¿Qué hizo en DataSign?',
    mood: 'speaking',
    answer:
      'Empleados virtuales de atención al cliente, seguimiento de quejas y validación de documentos, con RAG y GraphRAG; automatización con n8n; y apps web y móviles de inicio a publicación.',
  },
  {
    question: '¿Cómo te hizo?',
    mood: 'happy',
    answer:
      'Por capas: primero voz en la consola, luego cara en pixel art, emociones, memoria, y al final me sacó del navegador a una app de escritorio con Electron. Cada versión está en el CHANGELOG del repo.',
  },
  {
    question: '¿Está disponible?',
    mood: 'curious',
    answer: 'Sí, para trabajo remoto desde Guadalajara. El correo está en la sección de contacto.',
  },
]
