# carlosisaelramirezgonzalez.github.io

Mi portafolio. Sitio estático con Vite, TypeScript y Tailwind CSS, publicado en GitHub Pages.

Un enjambre de cursores construye la página mientras haces scroll. El contenido es HTML normal:
sin JavaScript, o con "reducir movimiento" activado, la página se ve completa y estática.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run build    # compila a dist/
npm run lint
```

Agrega `?debug=1` a la URL para ver la barra de controles (velocidad, sonido, contador), qué agente
construye cada tarea, un registro y las mediciones (violaciones, cobertura de pantalla, agentes en
reposo visibles y sobre contenido). Sin `debug`, solo aparece un botón "Saltar animación" mientras
algo se construye en pantalla.

## Editar el contenido

Todo el texto está en `index.html`. Para que el enjambre construya un elemento, márcalo con
`data-build`. Todo texto dentro de un elemento marcado lo escribe un cursor letra por letra (se
parte en un `span` por carácter, con una copia oculta para lectores de pantalla); con `?debug=1`,
"texto sin tarea" debe ser 0.

| Valor | Qué hace el cursor |
|---|---|
| `rect`, `media` | Arrastra una caja con su medida y luego aparece el relleno |
| `text` | Arrastra una caja de texto y escribe; `data-grow` lo hace crecer, `data-guide` arrastra una guía antes |
| `line` | Lo traza con la pluma |
| `dup` | El primero es la maestra; los demás se copian arrastrándolos |
| `network` | Varios agentes forman una red y de ahí sale la tarjeta (NOVA) |
| `converge` | Todo el enjambre rodea el elemento y luego se dispersa (contacto) |

El motor está en `src/swarm/`. Lo escribí desde cero: el efecto está inspirado en
[Swarm](https://califa.github.io/swarm-site/), de Joel Califa, que no tiene licencia de uso.

## Publicación

Cada push a `main` compila y publica con `.github/workflows/deploy.yml`. En el repositorio,
**Settings → Pages → Source** debe estar en **GitHub Actions**. El CV va en `public/cv.pdf`.
