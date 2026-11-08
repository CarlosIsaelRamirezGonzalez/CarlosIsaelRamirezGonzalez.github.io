import './style.css'
import { startSwarm } from './swarm/engine'

/**
 * Punto de entrada: barra de progreso, botón de copiar correo y, si corresponde, el enjambre.
 * Todo lo esencial de la página funciona sin este archivo.
 */
const root = document.documentElement

/** Barra de progreso del scroll en la barra superior. */
function bindProgress(): void {
  const bar = document.querySelector<HTMLElement>('#scroll-progress')
  if (!bar) return
  const update = (): void => {
    const total = root.scrollHeight - window.innerHeight
    bar.style.transform = `scaleX(${total > 0 ? window.scrollY / total : 0})`
  }
  window.addEventListener('scroll', update, { passive: true })
  update()
}

/** Botón para copiar el correo; sin JS queda oculto y el enlace mailto sigue funcionando. */
function bindCopyEmail(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-email]')
  if (!button) return
  button.hidden = false
  const label = button.textContent
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyEmail ?? '')
      button.textContent = '¡Copiado!'
    } catch {
      button.textContent = 'No se pudo copiar'
    }
    window.setTimeout(() => (button.textContent = label), 1800)
  })
}

bindProgress()
bindCopyEmail()

// El enjambre solo arranca si el guion del <head> lo pidió (no hay "reducir movimiento").
if (root.classList.contains('swarm-boot')) {
  startSwarm().catch((error: unknown) => {
    console.error('[swarm] no pudo arrancar; se muestra la página estática', error)
    root.classList.remove('swarm-boot')
  })
}
