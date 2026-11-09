# Dirección de diseño

## La decisión en diez líneas

1. **Oscuro cálido, no azul.** Fondo tinta `#15120F` y texto hueso `#EDE6DA`. Se eligió oscuro por NOVA: su cuerpo es blanco y sus llamas lavanda; sobre papel claro desaparecería. Cálido para alejarse del marino de todos los sitios de IA.
2. **Un solo acento: ámbar `#D9A441`**, el color de los monitores de fósforo ámbar. Viene del mundo de Carlos (terminal, logs) y no del catálogo de "sitio de IA". Sin brillos, sin degradados, sin neón. Contraste 9.4:1 sobre el fondo.
3. **NOVA conserva su paleta** (lavanda, violeta, blanco) porque es un personaje con hoja propia, no un color de interfaz. Aparece solo donde está ella.
4. **Tipografía:** Bricolage Grotesque para títulos y cuerpo (una sola familia con eje óptico: expresiva en grande, sobria en texto) e IBM Plex Mono para rutas, fechas, logs y comandos. Nada de Inter ni Space Grotesk. Carga con `font-display: swap` y fallbacks del sistema.
5. **Retícula de 12 columnas visible en la asimetría:** títulos a la izquierda en 4 columnas, contenido a la derecha en 7, metadatos en mono alineados a la derecha. Nada centrado salvo el cierre.
6. **Sin tarjetas.** Las listas se separan con líneas de 1 px y espacio; los bloques que necesitan contorno llevan radio de 2 px y ninguna sombra.
7. **Los detalles salen del oficio:** el hero muestra un log de construcción del enjambre (qué agente arma qué); los proyectos se presentan como casos con "problema / qué hice / stack"; la arquitectura de NOVA es un diagrama con los componentes reales del repo.
8. **La numeración solo donde hay secuencia:** la trayectoria. Las demás secciones no llevan "01 —".
9. **Movimiento con propósito:** la única animación es el enjambre que construye la página, una vez por sección, en menos de un segundo por bloque. NOVA se anima porque está viva; nada más se mueve solo.
10. **Copy en primera persona, corto y verificable.** Fuera "apasionado", "soluciones", "potenciar", y la fórmula "no solo X, sino Y".

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#15120F` | Fondo |
| `--ink-2` | `#1E1A16` | Fondo de bloques y del panel de NOVA |
| `--rule` | `#3A332C` | Líneas de 1 px |
| `--bone` | `#EDE6DA` | Texto principal (14.6:1) |
| `--dust` | `#A49A8C` | Texto secundario (6.9:1) |
| `--amber` | `#D9A441` | Acento: enlaces, foco, cursor principal, marcas de la retícula |
| `--nova-violet` | `#5B46C4` · `#ABA8E8` · `#F3F3FF` | Solo NOVA (de su renderizador real) |

Cursores del enjambre (identidad de cada agente, muteados para el fondo cálido): ámbar `#D9A441`, salvia `#8FB38A`, rosa `#D98C8C`, cielo `#8FB3C9`, lavanda `#ABA8E8`, hueso `#EDE6DA`.

## Tipografía

- **Bricolage Grotesque** (Google Fonts, ejes `opsz` y `wght`): títulos 600 con `opsz` alto y tracking −0.02em; cuerpo 400 a 17 px, interlínea 1.55, líneas de 60–70 caracteres.
- **IBM Plex Mono** 400/500 a 13–14 px: fechas, rutas, comandos, log del enjambre, etiquetas de estado de NOVA.
- Escala: 13 · 15 · 17 · 21 · 28 · 40 · `clamp(3.2rem, 8vw, 7rem)` para el nombre.

## Estructura

```
Entrada        nombre en dos líneas (col 1–8) · log del enjambre (col 9–12)
Qué construyo  tres párrafos cortos, uno por tipo de trabajo, sin tarjetas
Proyectos      casos: NOVA (grande, con avatar real), AlertIA, trabajos para clientes (genérico)
NOVA           diagrama de arquitectura con los componentes del repo + botón "Dame el tour"
Trayectoria    línea de tiempo numerada (es una secuencia)
Stack          agrupado por uso real: dónde lo usé, no por íconos
Sobre mí       texto + hueco para el retrato (marcador en dev hasta tener foto)
Contacto       correo, GitHub, CV
```

## Qué se revisó contra el borrador genérico

- El primer borrador tenía fondo cálido con acento **terracota** y una serif: es la combinación que hoy producen todas las herramientas. Se cambió a ámbar y grotesca.
- Tenía un bloque de "tres cosas que hago" en tres columnas iguales. Se cambió a una lista con líneas, de anchos distintos.
- Tenía etiquetas en mayúsculas con tracking sobre cada título. Se quitaron.
