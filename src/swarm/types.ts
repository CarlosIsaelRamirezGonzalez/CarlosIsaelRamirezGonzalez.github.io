/**
 * Tipos compartidos del motor del enjambre.
 *
 * Todo lo que se construye es una "tarea": un elemento del DOM marcado con `data-build`.
 * Las tareas usan coordenadas del documento (no cambian con el scroll); los cursores viven en
 * coordenadas de pantalla.
 */

/** Tipos de tarea que entiende el motor. */
export type BuildKind = 'rect' | 'media' | 'text' | 'line' | 'dup' | 'network' | 'converge'

/** Herramienta que muestra un cursor. */
export type Tool = 'arrow' | 'cross' | 'ibeam' | 'pen' | 'move'

/**
 * Estados de un agente:
 * - `reserve`: fuera de la pantalla, esperando a que haga falta gente.
 * - `idle`: en reposo, flotando en márgenes y huecos.
 * - `travel`: viajando hacia su tarea (o de regreso) por una curva.
 * - `hover`: ya llegó; pausa breve antes de hacer clic.
 * - `ready`: en su lugar, esperando a que llegue el resto de la cuadrilla.
 * - `work`: construyendo.
 */
export type AgentState = 'reserve' | 'idle' | 'travel' | 'hover' | 'ready' | 'work'

export interface Point {
  x: number
  y: number
}

/** Rectángulo en coordenadas del documento. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Un carácter de la capa animada: está oculto o visible, nunca a medias. */
export interface Glyph {
  el: HTMLSpanElement
  char: string
}

/** Error de tecleo: se escribe una letra equivocada y se borra antes de la correcta. */
export interface Typo {
  index: number
  wrong: string
  show: number
  hide: number
}

/** Lo que teclea un agente de la cuadrilla: sus letras y el momento en que aparece cada una. */
export interface RoleScript {
  glyphs: Glyph[]
  /** Segundos (a velocidad 1×) desde el inicio del tecleo en que aparece cada letra. */
  times: number[]
  typo: Typo | null
  end: number
  /** Letras visibles ahora mismo. */
  shown: number
  typoVisible: boolean
  /** Posición del caret, en coordenadas del documento. */
  caret: Box | null
  /** Caja de las letras de este agente, para arrastrar su caja de texto. */
  box: Box
}

/** Guion de una tarea en construcción, creado al asignarla. */
export interface Script {
  roles: RoleScript[]
}

/** Trayecto curvo de un agente, en coordenadas de pantalla salvo el destino, que se recalcula. */
export interface Path {
  from: Point
  /** Desvío del punto de control respecto a la recta, para que la curva sea natural. */
  bend: Point
  elapsed: number
  duration: number
  /** Error intencional: primero llega a un punto equivocado y luego corrige. */
  miss: Point | null
}

/** Algo que el enjambre debe construir. */
export interface Task {
  id: number
  el: HTMLElement
  kind: BuildKind
  box: Box
  parent: Task | null
  /** En las copias: la tarea maestra de la que se duplican. */
  master: Task | null
  /** En las copias: la hermana anterior, para medir la separación. */
  previous: Task | null
  children: Task[]
  guide: boolean
  grow: boolean
  /** Letras que escribe esta tarea (no incluye las de sus hijas). */
  glyphs: Glyph[]
  /** Avance de 0 (sin construir) a 1 (terminada). */
  progress: number
  /** Segundos (a 1×) del arrastre, la selección o la reunión antes de teclear. */
  dragTime: number
  /** Segundos (a 1×) de toda la tarea; se fija al crear el guion. */
  duration: number
  script: Script | null
  crew: Agent[]
  /** Cuántos agentes pide en los momentos especiales (red y contacto). */
  crewSize: number
  running: boolean
}

/** Un cursor del enjambre. Existe desde el inicio y conserva su color y nombre. */
export interface Agent {
  id: number
  name: string
  color: string
  state: AgentState
  x: number
  y: number
  vx: number
  vy: number
  tool: Tool
  pressed: boolean
  task: Task | null
  role: number
  path: Path | null
  wait: number
  pace: number
  home: Point
  alpha: number
  scale: number
  phase: number
  /** Posiciones recientes, para la estela cuando el enjambre va muy rápido. */
  trail: Point[]
}

/** Dónde está y qué hace el cursor en un punto de la tarea. */
export interface Pose {
  x: number
  y: number
  tool: Tool
  pressed: boolean
}
