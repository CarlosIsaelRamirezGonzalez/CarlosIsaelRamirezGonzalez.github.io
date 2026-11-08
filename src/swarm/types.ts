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

/** Estado del tecleo de un texto: la parte escrita y la que aún ocupa su lugar invisible. */
export interface Typing {
  full: string
  typed: Text
  rest: Text
  shown: number
  caret: Box
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
  /** Tarea que contiene a esta; se construye primero. */
  parent: Task | null
  /** En las copias: la tarea maestra de la que se duplican. */
  master: Task | null
  /** En las copias: la hermana anterior, para medir la separación. */
  previous: Task | null
  children: Task[]
  guide: boolean
  grow: boolean
  /** Avance de 0 (sin construir) a 1 (terminada). */
  progress: number
  /** Segundos que tarda a velocidad 1×. */
  duration: number
  /** Agentes asignados; el primero es el principal. */
  crew: Agent[]
  /** Cuántos agentes pide la tarea. */
  crewSize: number
  /** Si la cuadrilla ya está en su lugar y la tarea avanza. */
  running: boolean
  typing: Typing | null
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
  /** Posición del agente dentro de la cuadrilla de su tarea. */
  role: number
  path: Path | null
  /** Segundos que le quedan de pausa antes de hacer clic. */
  wait: number
  /** Qué tan rápido es este agente, para que no todos se muevan igual. */
  pace: number
  /** Lugar de descanso en pantalla. */
  home: Point
  alpha: number
  scale: number
  /** Fase propia para el temblor y el vaivén. */
  phase: number
}

/** Dónde está y qué hace el cursor en un punto de la tarea. */
export interface Pose {
  x: number
  y: number
  tool: Tool
  pressed: boolean
}
