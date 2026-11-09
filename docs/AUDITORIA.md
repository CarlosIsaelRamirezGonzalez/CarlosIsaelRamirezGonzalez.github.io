# Auditoría del sitio anterior

Fecha: 9 de noviembre de 2026. Capturas en `docs/capturas/antes/` (1280 y 1440 de escritorio, 390 de celular),
tomadas del sitio publicado y del servidor local con Chrome y Playwright.

## 1. Marcas de agua y basura visual

| Qué se veía | Dónde | Por qué molesta |
|---|---|---|
| Cursores en reposo fijos en los dos márgenes, a 40 % de opacidad, en toda la página | Todas las secciones de escritorio | Parecen manchas; no explican nada y compiten con el texto |
| Barra inferior "agentes · capas · 1× 2× 3× · Sonido · Saltar animación" siempre visible | Todas las secciones, escritorio y celular | Es un panel de depuración; en celular ocupa dos líneas y tapa el texto de las tarjetas |
| Reglas superior e izquierda con la guía roja que se quedaban después de escribir un título | Encabezados de sección | Las reglas son una ayuda de la animación, no parte del diseño |
| Etiquetas de medida "W × H" y etiquetas de agente que seguían visibles un rato después de terminar | Tarjetas y chips | Lo construido no quedaba limpio |
| Encabezado translúcido con `backdrop-blur` que dejaba ver texto borroso debajo | Barra superior | Lee como desenfoque decorativo |
| Cursores construyendo fuera de la pantalla (hasta 220 px abajo del borde) | Al hacer scroll | Trabajo invisible que luego aparece ya hecho: rompe la causalidad |

## 2. Señales de "hecho por IA"

Contrastado con la lista de la sección 2 del encargo:

- **Paleta azul marino + cian** (`#070E22`, `#46D2E1`) con un brillo cian desenfocado detrás del hero. Es la paleta por defecto de los sitios de "dev con IA".
- **Hero centrado en la fórmula**: etiqueta "01 — Inicio", pastilla "Disponible para trabajo remoto" con punto verde, nombre, titular, un párrafo y dos botones. Exactamente el patrón prohibido.
- **Etiquetas con raya larga en cada sección** ("03 — Enfoque", "06 — Proyectos") en mayúsculas y monoespaciada: la numeración no corresponde a una secuencia real.
- **Rejillas de tarjetas idénticas**: "Enfoque" con tres principios iguales (etiqueta, título, dos líneas), "Qué hago" con cuatro tarjetas marcadas a, b, c, d, "Stack" con cinco tarjetas iguales. Mismo radio de 14 px, mismo borde, mismo `hover`.
- **Tipografía por defecto**: Inter para el cuerpo y Space Grotesk para los títulos, sin un uso que lo justifique; JetBrains Mono para cualquier dato pequeño.
- **Copy con ritmo de plantilla**: "no solo conversan: ejecutan procesos" (la estructura "no solo X, sino Y"), "Software de IA pensado para el negocio", tres "principios" numerados.
- **Métrica decorativa**: el bloque "4 proveedores de LLM · 3 + NOVA roles · desde 2024" es una barra de estadísticas sin información útil.
- **Ámbar como segundo acento** encima del cian, en botones y en la tarjeta de NOVA: dos colores de acento sin disciplina.
- **NOVA descrita como "ecosistema multi-agente"** en una versión anterior; el código tiene un orquestador con herramientas y un redactor aparte.

## 3. El motor del enjambre (`src/swarm/`)

**Se conserva** (es lo que hace que el efecto sea creíble):

- El grupo fijo de agentes con nombre y color propios, y su máquina de estados (reposo → viaje en curva → pausa → trabajo → regreso). Nada aparece de la nada.
- El tecleo letra por letra con `span` por carácter, con una copia oculta para lectores de pantalla.
- El plano de construcción a partir de `data-build` en el HTML, con dependencias padre-hijo y copias de una maestra.
- La red de nodos de NOVA y la reunión final en el botón de contacto.
- El multiplicador de velocidad con el scroll y la garantía de completar lo visible al detenerse.
- El modo `?debug=1` con las mediciones (violaciones, cobertura, cursores en reposo visibles, texto sin tarea).

**Se tira o cambia:**

- Las "casas" en los márgenes: los agentes sin trabajo salen de la pantalla, siempre.
- Las reglas y la guía roja: se quitan por completo.
- La reconstrucción al volver a subir: cada sección se construye una sola vez y queda estática.
- La duración por bloque: baja de hasta 3 s a menos de 1 s; los títulos y párrafos clave se leen casi de inmediato.
- La barra de controles: solo con `?debug=1`. Sin sonido por defecto y sin botones de velocidad a la vista.
- El límite de cursores visibles: máximo 4, y si la tasa de cuadros baja, menos.
- Un solo gesto para todo: cada tipo de elemento tendrá el suyo (texto, imagen, línea, bloque, diagrama).

## 4. Qué faltaba por completo

- Fotos reales: `public/img/raw/` no existe. No hay retrato ni capturas de NOVA ni de AlertIA.
- `public/cv.pdf` no existe: el botón "Descargar CV" daba 404.
- Un avatar fiel de NOVA: el sitio no tenía ninguno; la app real la dibuja en pixel art con casco blanco, visor oscuro y llamas lavanda (`frontend/src/nova/renderNova.ts` y la hoja del personaje).
