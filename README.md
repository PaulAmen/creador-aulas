# Creador de aulas UNESUM PII 2026

Aplicación web estática que crea un aula de Google Classroom con la denominación y los temas de la estructura institucional PII 2026. Hay más detalles en `docs/PLAN_IMPLEMENTACION_PII_2026.md` (primera entrega).

## Uso sencillo

Escribe el nombre del curso y el paralelo, selecciona el nivel (Primero a Octavo) y la
jornada (Semipresencial, En línea o Presencial). Si corresponde, marca «Soy tutor de este curso».
La sección se forma como «Nivel – Paralelo – Jornada – PII 2026», con periodo fijo.
Se crean cuatro unidades temáticas genéricas, junto con los cinco temas
institucionales. La tutoría añade dos temas. Los datos y temas se pueden ajustar después
en Classroom. La vista previa está plegada para mantener el formulario breve.

Esta simplificación sustituye el formulario detallado del plan inicial.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html`, `styles.css` | Interfaz. |
| `template.js` | Plantilla institucional (temas y contenidos esperados) y funciones puras: validación, nombre, sección y pendientes. |
| `classroom.js` | Cliente de Classroom API y flujo de creación: curso único, temas con progreso, reconciliación y reanudación. |
| `app.js` | Formulario, vista previa, inicio de sesión con Google y presentación del resultado. Contiene el `CLIENT_ID`. |
| `test/` | Pruebas con `node:test` y un `fetch` simulado. |

## Ejecución local

No requiere instalación ni compilación:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# abrir http://localhost:8000
```

No se puede abrir con `file://`, porque Google Identity Services exige un origen http(s) autorizado.

### OAuth

En Google Cloud Console, en *APIs y servicios → Credenciales*, el cliente OAuth web del `CLIENT_ID` (en `app.js`) debe tener en **Orígenes de JavaScript autorizados** cada origen exacto que se use, por ejemplo `http://localhost:8000` y el dominio de despliegue. No hacen falta URI de redirección (se usa el flujo de token con ventana emergente). La API de Google Classroom debe estar habilitada en el proyecto.

Permisos solicitados: `classroom.courses`, `classroom.topics`, `classroom.courseworkmaterials`, `classroom.coursework.students` y `userinfo.email`. El token se guarda solo en memoria.

## Pruebas

```sh
node --test test/*.test.js
```

Cubren: número y orden de temas (6/8 y 8/10), exclusión de los temas de tutoría y de los temas antiguos, nombre y sección con tildes, campos obligatorios y opcionales, unidades duplicadas y límites de longitud, fallo en el tercer tema con reanudación sin duplicados, respuesta perdida de un tema reconciliada antes de repetirlo, paginación, doble clic sin segundo POST de curso, resultado incierto del curso sin reintento, distinción entre 401 y 403, y validación del enlace del aula.

`test/ui.test.js` abre `test/ui.html` en Chrome sin interfaz. Esa página carga la aplicación real con Google Identity Services y `fetch` simulados. Comprueba que los errores de inicio de sesión (Google no disponible, ventana cerrada y acceso denegado) se ven antes de iniciar sesión. Comprueba también que, si la sesión expira a mitad de los temas, al volver a iniciarla se completan los pendientes con el token nuevo, sin crear otro curso. Si no encuentra Chrome, la prueba se omite; se puede indicar la ruta con `CHROME_PATH`.

También se comprobó en Chrome, con un servidor local y sin iniciar sesión: la vista previa se actualiza al marcar o desmarcar la tutoría, el texto `<img src=x onerror=alert(1)>` se muestra literal y no se ejecuta, aparecen los errores por campo y el foco va al primer campo inválido, sin token se muestra el mensaje de sesión con «Volver a iniciar sesión» y no se envía ningún POST, y a 360 px no hay desplazamiento horizontal.

## Pendiente de comprobar con un aula de prueba autorizada

No se ha creado ningún aula real. Antes de usarla en producción conviene comprobar:

1. **Orden visual de los temas.** Los temas se envían en orden inverso (`DEFAULT_TOPIC_ORDER = 'reverse'` en `classroom.js`), suponiendo que Classroom muestra arriba el más reciente. Si el aula de prueba los muestra al revés, cambiarlo a `'forward'`.
2. Que la cuenta institucional permite crear el curso con `courseState: 'ACTIVE'` y el campo `subject`.
3. Consentimiento OAuth, ventana emergente bloqueada o cerrada y sesión expirada en medio del proceso (este caso debe reanudarse con la misma cuenta).
4. Que se muestran el enlace del aula y el código de acceso.

## Limitaciones conocidas

- El estado del proceso se guarda solo en la pestaña. Si se recarga la página tras un fallo parcial, hay que comprobar el aula en Classroom y completarla a mano.
- Crea dos materiales de ejemplo en borrador; no adjunta documentos, no envía invitaciones ni configura calificaciones (`gradebookSettings` es de solo lectura en la API). La aplicación muestra una lista de pendientes para copiar o imprimir.
- Si el POST del curso no recibe respuesta, la aplicación no lo repite: indica que se compruebe Classroom.
- La invitación al personal de seguimiento queda pendiente.

## Sesiones de ejemplo

La plantilla crea cuatro unidades: las dos primeras incluyen sesiones de ejemplo
(sesiones 1 y 2 en la primera, 3 y 4 en la segunda). Las unidades 3 y 4 quedan
vacías, sin materiales ni tareas. Los temas no tienen estado de borrador en Classroom. La sesión 1 siempre es «Encuadre de la asignatura».
La sesión 1 crea un material genérico en borrador, solo con título y sin tarea.
Las sesiones 2, 3 y 4 tienen un material y una tarea de tipo ASSIGNMENT en estado DRAFT:
cuatro materiales y tres tareas. Las tareas no tienen puntos ni fecha de entrega
predefinidos. El docente completa instrucciones, recursos y evaluación antes de publicar.

«Completar plantilla pendiente» reconcilia materiales y tareas antes de crear los
que falten. Google solicita permisos de materiales y tareas. La creación y orden
visual siguen pendientes de validación en Classroom real.

## Materiales institucionales en borrador

Cada documento de Lineamientos disciplinarios, Encuadre de la asignatura,
Evaluación del aprendizaje e Información de Bienestar universitario se crea como
material DRAFT, solo con título y sin descripción.
Programa analítico y syllabus tienen un borrador por versión. Las calificaciones
se distinguen con PRIMER PARCIAL o SEGUNDO PARCIAL en el título.
Solo los tutores reciben también los borradores de Habilidades blandas y Proyecto en aula.

La plantilla normal crea 27 materiales institucionales, más cuatro materiales de
sesiones y tres tareas: 34 borradores. Con tutoría son 41 borradores. Ningún archivo
se adjunta automáticamente y nada se publica. Clases grabadas se conserva como tema
para incorporar las grabaciones reales. La recuperación reconcilia también los materiales
institucionales para evitar duplicados. Las llamadas de escritura se espacian.

Los materiales y tareas se crean sin indicaciones ni texto de relleno en su descripción.
