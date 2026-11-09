import './style.css'
import type { AssignDetail } from './swarm/engine'
import { startSwarm } from './swarm/engine'
import { drawWires } from './nova/wires'
import { mountNova } from './nova/widget'

/**
 * Punto de entrada. La página funciona sin este archivo: aquí solo se agregan el enjambre, el
 * log del hero, el botón de copiar el correo, el enlace al CV (si el archivo existe), el diagrama
 * de NOVA y su widget.
 */
const root = document.documentElement

// Los huecos de imágenes pendientes solo se ven en desarrollo.
if (import.meta.env.DEV) root.dataset.dev = ''

/** El log del hero: una línea por cada asignación del enjambre en la entrada. */
function bindBuildLog(): void {
  const log = document.querySelector<HTMLOListElement>('#build-log')
  if (!log) return
  window.addEventListener('swarm:assign', (event) => {
    const { agent, color, label } = (event as CustomEvent<AssignDetail>).detail
    const line = document.createElement('li')
    const who = document.createElement('span')
    who.style.color = color
    who.textContent = agent
    const what = document.createElement('b')
    what.textContent = label
    line.append(who, what)
    log.append(line)
    while (log.children.length > 6) log.firstElementChild?.remove()
  })
}

/** Botón para copiar el correo; sin JS queda oculto y el enlace mailto sigue funcionando. */
function bindCopyEmail(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-email]')
  if (!button || !navigator.clipboard) return
  button.hidden = false
  const label = button.textContent
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyEmail ?? '')
      button.textContent = 'Copiado'
    } catch {
      button.textContent = 'No se pudo copiar'
    }
    window.setTimeout(() => (button.textContent = label), 1800)
  })
}

/** Muestra el enlace al CV solo si el archivo existe, para no mandar a un 404. */
async function revealCv(): Promise<void> {
  const item = document.querySelector<HTMLElement>('#cv-item')
  if (!item) return
  try {
    const response = await fetch('/cv.pdf', { method: 'HEAD' })
    if (response.ok && (response.headers.get('content-type') ?? '').includes('pdf')) item.hidden = false
  } catch {
    // Sin red o sin archivo: el enlace se queda oculto.
  }
}

bindBuildLog()
bindCopyEmail()
void revealCv()
// Las conexiones del diagrama se dibujan antes de que el enjambre arme su plano.
drawWires()
window.addEventListener('resize', () => drawWires())
mountNova()

if (root.classList.contains('swarm-boot')) {
  startSwarm().catch((error: unknown) => {
    console.error('[swarm] no pudo arrancar; se muestra la página estática', error)
    root.classList.remove('swarm-boot')
  })
}
