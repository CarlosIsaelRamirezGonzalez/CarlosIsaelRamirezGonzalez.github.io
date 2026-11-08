/**
 * Sonido sintetizado con Web Audio: no hay archivos de audio. Empieza apagado y solo se crea el
 * contexto de audio cuando la persona lo enciende, porque el navegador lo exige.
 */

/** Notas de la escala pentatónica de mi mayor, en Hz. */
const PENTATONIC = [164.81, 185.0, 207.65, 246.94, 277.18]

export class Sound {
  enabled = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private lastKey = 0
  private lastNote = 0

  /**
   * Enciende o apaga el sonido.
   *
   * @returns Si quedó encendido.
   */
  toggle(): boolean {
    this.enabled = !this.enabled
    if (this.enabled && !this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.35
      this.master.connect(this.ctx.destination)
    }
    if (this.enabled) void this.ctx?.resume()
    return this.enabled
  }

  /** Salida con paneo según la posición horizontal (-1 izquierda, 1 derecha). */
  private output(pan: number): AudioNode | null {
    if (!this.enabled || !this.ctx || !this.master) return null
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    panner.connect(this.master)
    return panner
  }

  /** Ráfaga corta de ruido filtrado: la base de clics y teclas. */
  private noise(out: AudioNode, frequency: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 1.4
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(out)
    source.start()
  }

  /** Clic de ratón al presionar. */
  click(pan: number): void {
    const out = this.output(pan)
    if (out) this.noise(out, 3200, 0.03, 0.5)
  }

  /** Tecla mecánica; se limita la frecuencia para que no sature. */
  key(pan: number): void {
    const now = performance.now()
    if (now - this.lastKey < 38) return
    this.lastKey = now
    const out = this.output(pan)
    if (!out) return
    this.noise(out, 2400 + Math.random() * 900, 0.025, 0.35)
    this.noise(out, 420, 0.04, 0.25)
  }

  /**
   * Nota suave de piano de cristal: grave para lo grande, aguda para lo pequeño.
   *
   * @param height De 0 (grave) a 1 (aguda).
   * @param pan Paneo.
   */
  note(height: number, pan: number): void {
    const now = performance.now()
    if (now - this.lastNote < 120) return
    this.lastNote = now
    const out = this.output(pan)
    if (!out) return
    const step = Math.round(Math.max(0, Math.min(1, height)) * 9)
    this.tone(out, PENTATONIC[step % 5] * 2 ** (1 + Math.floor(step / 5)), 0.9, 0.12)
  }

  /** Acorde de mi mayor cuando la página termina de construirse. */
  chord(): void {
    const out = this.output(0)
    if (!out) return
    for (const frequency of [329.63, 415.3, 493.88, 659.25]) this.tone(out, frequency, 2.2, 0.07)
  }

  /** Tono con ataque rápido y caída larga. */
  private tone(out: AudioNode, frequency: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    const gain = ctx.createGain()
    const start = ctx.currentTime
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    oscillator.connect(gain).connect(out)
    oscillator.start(start)
    oscillator.stop(start + length)
  }
}
