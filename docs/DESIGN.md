# Dirección de diseño

## La decisión en diez líneas

1. **Una sola fuente de color: la hoja de NOVA.** Tinta índigo casi negra (`#11101F`, su contorno y su visor aclarados), blanco azulado (`#EEEDF8`, su casco) y lavanda (`#ABA8E8`, sus llamas) como único acento. Así ella y la página son lo mismo; antes competían un ámbar con sus violetas.
2. **Oscuro, no papel.** Su cuerpo es blanco; sobre papel desaparecía.
3. **Sin brillos ni degradados.** La lavanda va plana: enlaces, foco, cursor principal y botón. Nada de neón.
4. **Los cursores del enjambre** usan seis tonos de la misma hoja (lavanda, pervinca, orquídea, crema, blanco suave y violeta oscuro): se distinguen entre sí sin salirse de la familia.
5. **Tipografía:** Bricolage Grotesque para títulos y cuerpo (una familia con eje óptico) e IBM Plex Mono para rutas, fechas y logs. Carga con `font-display: swap`.
6. **Retícula de 12 columnas en asimetría:** títulos en 4 columnas a la izquierda, contenido en 7 a la derecha. Nada centrado salvo el cierre.
7. **Sin tarjetas.** Listas separadas con líneas de 1 px; los bloques con contorno llevan radio de 2 px y ninguna sombra.
8. **Los detalles salen del oficio:** el hero muestra el log de construcción del enjambre; los proyectos son casos; la arquitectura de NOVA es un diagrama con los componentes reales del repo.
9. **Numeración solo donde hay secuencia:** la trayectoria.
10. **Movimiento con propósito:** el enjambre construye cada sección una vez; NOVA se anima porque está viva y, en el tour, vuela de un apartado a otro con su voz real.

## Tokens

| Token | Valor | Contraste sobre `--ink` | Uso |
|---|---|---|---|
| `--ink` | `#11101F` | | Fondo |
| `--ink-2` | `#19182D` | | Bloques, panel y burbuja de NOVA |
| `--rule` | `#2C2B49` | | Líneas de 1 px |
| `--bone` | `#EEEDF8` | 16.6:1 | Texto principal |
| `--dust` | `#9D9BBE` | 7.1:1 | Texto secundario, mono |
| `--accent` | `#ABA8E8` | 8.3:1 | Enlaces, foco, botón (texto `#16123F` encima, 8.6:1) |

Cursores del enjambre: `#ABA8E8`, `#8FA2FF`, `#CA83F9`, `#FEE7C5`, `#D9D9F7`, `#7E73D6`. Todos salen del renderizador real de NOVA.

## Tipografía

- **Bricolage Grotesque** (ejes `opsz` y `wght`): títulos 600 con `opsz` alto y tracking −0.02em; cuerpo 400 a 17 px, interlínea 1.55, líneas de 60–70 caracteres.
- **IBM Plex Mono** 400/500 a 13–14 px: fechas, rutas, comandos, log del enjambre, estado de NOVA.

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

- El primer borrador tenía fondo cálido con acento **terracota** y una serif: la combinación que hoy producen todas las herramientas. La segunda versión usó ámbar sobre tinta cálida, y el ámbar chocaba con los violetas de NOVA. La tercera toma todo de su hoja.
- Tenía un bloque de "tres cosas que hago" en tres columnas iguales. Se cambió a una lista con líneas, de anchos distintos.
- Tenía etiquetas en mayúsculas con tracking sobre cada título. Se quitaron.
