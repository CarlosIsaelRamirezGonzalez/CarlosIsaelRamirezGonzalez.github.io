/**
 * Guion del tour de NOVA. Es texto editable: cambia aquí lo que dice, en qué orden y qué señala.
 *
 * Cada paso lleva a una parte de la página (`target`), resalta componentes del diagrama
 * (`components`) y pone a NOVA en un ánimo. `id` también nombra el audio opcional:
 * `public/audio/nova/<id>.mp3`.
 */
import type { Mood } from './avatar'

export interface TourStep {
  id: string
  target: string
  mood: Mood
  text: string
  components?: string[]
}

export interface QuickAnswer {
  question: string
  answer: string
  mood: Mood
}

export const OFFER = 'Soy NOVA. Carlos me construyó; yo te enseño el sitio. Son dos minutos.'

export const TOUR: TourStep[] = [
  {
    id: 'paso-1',
    target: '#entrada',
    mood: 'happy',
    text: 'Soy <b>NOVA</b>, la compañera de IA que Carlos construyó para su Mac. Él me hizo; yo te doy el tour. Carlos es desarrollador full-stack con enfoque en IA: hace webs, apps y empleados virtuales que trabajan de verdad.',
  },
  {
    id: 'paso-2',
    target: '#que-construyo',
    mood: 'speaking',
    text: 'Lo que más hace: agentes que atienden clientes, dan seguimiento a quejas y validan documentos, con RAG y GraphRAG. También apps en Flutter que ya usan más de 200 personas.',
  },
  {
    id: 'paso-3',
    target: '#nova-diagram',
    mood: 'speaking',
    components: ['voice-in', 'server', 'voice-out'],
    text: 'Así funciono. Me activo con «Oye Nova». Vosk y Whisper me escuchan dentro de la Mac; a internet solo viaja el texto. Respondo con voz de ElevenLabs, frase por frase, para no hacerte esperar.',
  },
  {
    id: 'paso-4',
    target: '#nova-diagram',
    mood: 'thinking',
    components: ['server', 'memory', 'qdrant', 'obsidian'],
    text: 'Recuerdo. Guardo lo importante en SQLite y lo sincronizo con Turso; busco por significado con Qdrant y Carlos lo puede leer en Obsidian. Si me dice «olvida eso», lo olvido de verdad.',
  },
  {
    id: 'paso-5',
    target: '#nova-diagram',
    mood: 'curious',
    components: ['claude', 'vision', 'desktop'],
    text: 'Claude decide qué siento y mi cuerpo lo muestra: soy pixel art, como me ves aquí. La cámara está apagada hasta que me piden mirar, y MediaPipe corre en el navegador, no en la nube.',
  },
  {
    id: 'paso-6',
    target: '#nova-diagram',
    mood: 'speaking',
    components: ['writer', 'claude'],
    text: 'Cuando Carlos me dice «termina este mensaje», un Redactor aparte escribe el borrador en la app que tiene al frente. No tiene herramientas ni memoria, y nunca presiona Enter.',
  },
  {
    id: 'paso-7',
    target: '#alertia-caso',
    mood: 'speaking',
    text: 'Antes de mí, Carlos hizo <b>AlertIA</b>: vigila cámaras y avisa por correo si ve un arma o un incendio. Pide varias detecciones seguidas antes de alarmar. Aprendió a no ser escandalosa; yo aprendí de ella.',
  },
  {
    id: 'paso-8',
    target: '#trayectoria',
    mood: 'speaking',
    text: 'Su camino: SoftCode en 2024, DataSign desde 2025, TopLearning desde enero de 2026 dando clases, y Atom este año, con React y MCP.',
  },
  {
    id: 'paso-9',
    target: '#contacto',
    mood: 'happy',
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
