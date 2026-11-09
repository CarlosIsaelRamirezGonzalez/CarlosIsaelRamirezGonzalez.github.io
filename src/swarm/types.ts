/**
 * Tipos compartidos del motor del enjambre.
 *
 * Todo lo que se construye es una "tarea": un elemento marcado con `data-build`. Las tareas usan
 * coordenadas del documento; los cursores, de pantalla.
 */

/** Tipos de tarea. Cada uno tiene su propio gesto de construcción. */
export type BuildKind = 'rect' | 'media' | 'text' | 'line' | 'dup' | 'network' | 'converge'

/** Herramienta que muestra un cursor. */
export type Tool = 'arrow' | 'cross' | 'ibeam' | 'pen' | 'move'

/**
 * Estados de un agente:
 * - `away`: fuera de la pantalla, invisible, esperando trabajo.
 * - `travel`: viajando por una curva hacia su tarea, o de salida.
 * - `hover`: ya llegó; pausa breve antes de hacer clic.
 * - `ready`: en su lugar, esperando al resto de la cuadrilla.
 * - `work`: construyendo.
 */
export type AgentState = 'away' | 'travel' | 'hover' | 'ready' | 'work'

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

/** Lo que teclea un agente de la cuadrilla y el momento en que aparece cada letra. */
export interface RoleScript {
  glyphs: Glyph[]
  /** Segundos (a 1×) desde el inicio del tecleo en que aparece cada letra. */
  times: number[]
  end: number
  shown: number
  /** Posición del caret, en coordenadas del documento. */
  caret: Box | null
  /** Caja de las letras de este agente. */
  box: Box
}

export interface Script {
  roles: RoleScript[]
}

/** Trayecto curvo de un agente, en coordenadas de pantalla salvo el destino, que se recalcula. */
export interface Path {
  from: Point
  bend: Point
  elapsed: number
  duration: number
}

/** Algo que el enjambre debe construir. */
export interface Task {
  id: number
  el: HTMLElement
  kind: BuildKind
  box: Box
  parent: Task | null
  master: Task | null
  previous: Task | null
  children: Task[]
  grow: boolean
  /** Si es un trazo SVG (se dibuja con la pluma por su longitud). */
  svgPath: SVGPathElement | null
  glyphs: Glyph[]
  /** Avance de 0 a 1. Nunca baja: cada cosa se construye una sola vez. */
  progress: number
  dragTime: number
  duration: number
  script: Script | null
  crew: Agent[]
  crewSize: number
  running: boolean
  /** Momento (segundos del motor) en que asomó en pantalla; -1 si aún no. */
  visibleSince: number
  /** Si se completó de golpe, sin agente (quedó atrás con scroll rápido o esperó demasiado). */
  instant: boolean
  /** Si pertenece a la entrada: sus asignaciones alimentan el log del hero. */
  hero: boolean
}

/** Un cursor del enjambre. Existe desde el inicio y conserva su color y nombre. */
export interface Agent {
  id: number
  name: string
  color: string
  state: AgentState
  x: number
  y: number
  tool: Tool
  pressed: boolean
  task: Task | null
  role: number
  path: Path | null
  wait: number
  pace: number
  alpha: number
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
