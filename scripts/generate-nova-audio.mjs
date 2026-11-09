// Genera los audios de NOVA con ElevenLabs, con la misma voz y ajustes que usa la app de escritorio.
//
// Corre en la computadora de Carlos, nunca en el navegador: la clave vive en `.env` (ignorado por
// git) y los MP3 resultantes van a `public/audio/nova/`. Solo genera los que faltan; `--force`
// los vuelve a hacer todos. Nunca imprime la clave.
//
// Uso: node scripts/generate-nova-audio.mjs [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'public', 'audio', 'nova')
const API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
// Igual que `services/voice/tts_service.py` y `VoiceSettings` en el repo de NOVA.
const MODEL_ID = 'eleven_v4_turbo'
const OUTPUT_FORMAT = 'mp3_44100_128'
const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0.1, speed: 1.05 }

/** Lee `.env` sin dependencias. */
function readEnv() {
  const env = {}
  const path = join(ROOT, '.env')
  if (!existsSync(path)) throw new Error('Falta .env con ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID')
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    // Acepta valores con o sin comillas.
    if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

/** Quita las negritas de los subtítulos: la voz no las pronuncia. */
const plain = (html) => html.replace(/<[^>]+>/g, '')

async function main() {
  const force = process.argv.includes('--force')
  const env = readEnv()
  const apiKey = env.ELEVENLABS_API_KEY
  const voiceId = env.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) throw new Error('ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID vacías en .env')

  // El guion vive en TypeScript; Node lo carga quitando los tipos.
  const { TOUR, QUICK, OFFER, GREETING } = await import('../src/nova/tour.ts')
  const lines = [
    { id: 'oferta', text: OFFER },
    { id: 'hola', text: GREETING },
    ...TOUR.map((step) => ({ id: step.id, text: plain(step.text) })),
    ...QUICK.map((item, index) => ({ id: `rapida-${index + 1}`, text: item.answer })),
  ]

  mkdirSync(OUT, { recursive: true })
  let made = 0
  let skipped = 0
  let characters = 0
  for (const line of lines) {
    const file = join(OUT, `${line.id}.mp3`)
    if (existsSync(file) && !force) {
      skipped++
      continue
    }
    const response = await fetch(`${API_URL}/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line.text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    })
    if (!response.ok) throw new Error(`ElevenLabs respondió ${response.status} para ${line.id}: ${(await response.text()).slice(0, 200)}`)
    writeFileSync(file, Buffer.from(await response.arrayBuffer()))
    made++
    characters += line.text.length
    console.log(`listo ${line.id}.mp3 (${line.text.length} caracteres)`)
  }
  console.log(`generados ${made}, ya existían ${skipped}, caracteres enviados ${characters}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
