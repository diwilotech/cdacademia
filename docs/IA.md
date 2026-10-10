# IA en Control de Academia

El software tendrá IA integrada. Esto ya está preparado y es lo que falta conectar.

## Hoy (sin servidor de IA)
En **Cursos → Evaluaciones y porcentajes → Examen → Crear las preguntas desde un archivo JSON** la persona:
1. Escribe el tema (o pega el material) y la cantidad de preguntas.
2. Pulsa **Copiar prompt para la IA** y lo pega en su IA (ChatGPT, Claude, Gemini…). El prompt ya lleva el formato exacto del JSON y el contexto del curso (área, nivel, módulos y temas).
3. Pega el JSON que le devuelve la IA y pulsa **Importar preguntas**. Si el JSON no cumple el formato, no se importa nada y se explica qué corregir.

Archivos: `public/admin-modulos.js` (`construirPromptIA`, `EJEMPLO_EXAMEN_JSON`, `ESQUEMA_PREGUNTAS`, `preguntaDesdeJSON`, `importarPreguntasJSON`) y `docs/ejemplo-examen.json`.

## Cuando se conecte la IA de la plataforma
- Endpoint ya reservado: `POST /staff/ia/preguntas` (`src/routes/ia.js`, hoy responde 501). El botón **Generar con la IA de la plataforma** ya lo llama con `{ prompt, tema, cantidad, tipos, cursoId }` y espera `{ instrucciones, preguntas }`.
- Pasos: llamar al modelo (Workers AI `env.AI` o un proveedor con clave como secreto `wrangler secret put …`), pedir salida JSON con `ESQUEMA_PREGUNTAS`, validar y devolver. El panel reutiliza el mismo importador, así que la respuesta pasa por las mismas reglas que un JSON manual.
- Poner un tope de uso por negocio (cuota mensual) y guardar el consumo.
- Siempre revisión humana: las preguntas importadas quedan en el editor y solo se guardan al pulsar **Guardar preguntas**.

## Otros puntos de IA ya marcados en el código
- `Organizar con IA` (plan de estudio → módulos): hoy es un analizador local; la IA llamaría a `POST /staff/ia/plan`.
- Texto de publicaciones de marketing: hoy son plantillas; la IA llamaría a `POST /staff/ia/caption`.
- Ideas siguientes: resumir un módulo, calificar con rúbrica las preguntas abiertas (sugerencia de nota para el docente) y responder dudas de estudiantes con el contenido de los módulos.
