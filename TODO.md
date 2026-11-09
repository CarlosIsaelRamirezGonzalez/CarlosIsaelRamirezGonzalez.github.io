# Pendientes que dependen de Carlos

Nada de esto se inventó: donde falta, el sitio deja el hueco vacío (visible solo en desarrollo) o
no lo muestra.

## Material visual

- [ ] [PENDIENTE: retrato] `public/img/raw/retrato.jpg`. Va en "Sobre mí", formato 4:5. Con eso
      genero WebP/AVIF con `srcset` y dimensiones fijas.
- [ ] [PENDIENTE: foto en acción] Opcional, para la entrada o "Qué construyo".
- [ ] [PENDIENTE: captura de AlertIA] `public/img/raw/alertia-panel.png`: el panel con las cámaras o
      una notificación con su foto. Hoy el caso lleva un hueco 16:9.
- [ ] [PENDIENTE: capturas o video de NOVA] Aunque el sitio ya la dibuja con su renderizador real,
      una captura de la app en el escritorio (con "Oye Nova" y una respuesta) contaría mejor la
      historia. Lista detallada en el repo de NOVA, `docs/capturas.md`.

## Archivos

- [ ] [PENDIENTE: CV] `public/cv.pdf`. El enlace en Contacto solo aparece cuando el archivo existe.
- [ ] [PENDIENTE: audios de NOVA] `public/audio/nova/paso-1.mp3` … `paso-9.mp3`, uno por paso del
      tour (`src/nova/tour.ts`). Sin ellos, la voz opcional usa la síntesis del navegador.

## Datos que no tengo y no inventé

- [ ] [PENDIENTE: fechas exactas en Atom] El sitio dice "2026 → hoy". ¿Mes de inicio?
- [ ] [PENDIENTE: logros con números] ¿Hay cifras reales de los empleados virtuales (tickets
      atendidos, tiempo de respuesta, documentos validados)? Solo si existen medidas.
- [ ] [PENDIENTE: enlaces a apps publicadas] Tiendas de las apps en Flutter de DataSign y SoftCode,
      si se pueden enlazar sin nombrar al cliente.
- [ ] [PENDIENTE: estudios] Nombre de la institución y años, si quieres que aparezcan. Hoy solo
      dice "Estudié Desarrollo de Software".
- [ ] [PENDIENTE: temas en TopLearning] Qué cursos das, para describirlos.
- [ ] [PENDIENTE: ES/EN] No se agregó el cambio de idioma: duplicaría todo el texto que escribe el
      enjambre. ¿Lo quieres de todos modos?

## Decisiones tuyas

- [ ] Licencia de NOVA (afecta la frase "código en GitHub").
- [ ] Si el log del hero (`build.log`) te gusta o prefieres la entrada sin él.
