# NOVA en vivo: cómo conectarla a un modelo real, y por qué todavía no

Hoy la NOVA del sitio responde con texto escrito de antemano (`src/nova/tour.ts`, a través de
`ScriptedProvider` en `src/nova/provider.ts`). No hay ninguna llamada a un modelo ni ninguna clave
en el navegador. Esta nota explica cómo se haría una versión en vivo si algún día hace falta.

## Qué habría que construir

1. **Un proxy sin servidor** (una función en Cloudflare Workers, Vercel o Netlify) que reciba la
   pregunta, agregue el contexto fijo de NOVA (quién es Carlos, qué puede contar) y llame al
   modelo con una clave que solo vive en el servidor. GitHub Pages es estático: no puede guardar
   secretos ni ejecutar código, así que el proxy va fuera de este repo.
2. **Una clase `LiveProvider`** que implemente `NovaProvider` y haga `fetch` al proxy. El widget no
   cambia: solo se le pasa otro proveedor.
3. **Límites en el proxy**, antes de llamar al modelo:
   - Por IP: por ejemplo, 20 preguntas por hora.
   - Por día en total: un tope global que corte el servicio si se dispara el gasto.
   - Por tamaño: preguntas de 300 caracteres como máximo, respuestas de 120 tokens.
   - Lista de temas: el prompt del sistema limita a NOVA a hablar de Carlos y de sus proyectos, y
     a responder "eso no lo sé" fuera de eso.
4. **Modelo barato y rápido**, con respuestas cortas, para que una conversación cueste fracciones
   de centavo.

## Riesgos

- **Gasto sin control.** Cualquiera puede llamar al proxy en bucle. Sin los límites de arriba, una
  tarde de abuso puede costar lo de un mes.
- **Inyección de instrucciones.** La pregunta la escribe un desconocido. El proxy debe tratarla
  como dato: nunca concatenarla a instrucciones sin delimitar, y nunca darle herramientas (nada de
  correo, archivos ni URLs) al modelo del sitio.
- **Datos personales.** NOVA no debe tener acceso a nada que no esté ya publicado en el sitio. El
  contexto del proxy se escribe a mano con la misma información del portafolio.
- **Confusión con la NOVA real.** La etiqueta "Demo guiada" se mantiene aunque haya modelo detrás:
  la de verdad corre en la app de escritorio, con voz, memoria y cámara; la del sitio, no.
- **Dependencia externa.** Si el proxy cae, el widget debe volver solo a `ScriptedProvider` y
  seguir contestando las preguntas rápidas.

## Qué no se hace nunca

- Poner una clave de API en el código del cliente, ni "temporalmente", ni ofuscada.
- Llamar a la API del modelo desde el navegador.
- Dejar el proxy sin límite de gasto.
