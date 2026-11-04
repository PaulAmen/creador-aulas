# Plan de implementación para Claude: aulas UNESUM PII 2026

## Objetivo y encargo

Adaptar el creador existente para generar aulas de Google Classroom conforme a «Estrutura PII 2026classroom.docx», facilitado por el usuario. Este archivo es un plan; la implementación corresponde a Claude. No crear aulas reales durante el desarrollo salvo instrucción explícita del usuario.

Fuente local consultada: `/Users/paulamen/Downloads/Estrutura PII 2026classroom.docx`.

## Estado actual

El repositorio contiene un único `index.html`, con estilos y JavaScript integrados. Usa Google Identity Services con un OAuth Client ID existente, obtiene el correo y llama directamente a Classroom REST API. Crea un curso activo a nombre del usuario y siete temas fijos. No existe backend, gestor de paquetes ni pruebas.

Mantener la aplicación estática, su diseño adaptable y el inicio de sesión actual. No introducir frameworks, backend ni herramientas de compilación para este cambio. Se pueden separar CSS y JavaScript si mejora claramente la lectura. No cambiar el OAuth Client ID sin necesidad y no incluir secretos ni tokens en archivos.

## Alcance propuesto

Primera entrega: formulario institucional, vista previa, creación del curso y sus temas, recuperación de fallos parciales y lista de pendientes. Debe ser útil sin disponer de documentos adjuntos.

Segunda entrega opcional y separada: materiales de referencia como borradores e invitaciones de seguimiento. No son condición para terminar la primera entrega. No convertir todo requisito institucional en una integración nueva.

## 1. Formulario y denominación

Sustituir los campos libres actuales por:

| Campo | Obligatorio | Uso |
| --- | --- | --- |
| Asignatura | Sí | Nombre del curso |
| Nombre del docente | Sí | Nombre del curso; no inferirlo del correo |
| Nivel | Sí | Sección |
| Paralelo | Sí | Sección |
| Jornada | Sí | Sección; editable porque el documento no enumera opciones |
| Modalidad | Sí | Sección; valor inicial «En línea», según la guía |
| Periodo académico | Sí | Sección; valor inicial editable «PII 2026» |
| Aula | No | `room` |
| Soy tutor de este curso | No | Activa los dos temas exclusivos de tutoría |
| Unidades temáticas | Al menos una | Lista editable con número y título opcional |

Construir y mostrar antes de crear:

- Nombre: `Asignatura – Nombre del Docente`.
- Sección: `Nivel – Paralelo – Jornada – Modalidad – Periodo`.
- Ejemplo ilustrativo: `Psicología Educativa – Ana Pérez` / `Tercer nivel – A – Matutina – En línea – PII 2026`.

La guía llama «Asignatura» tanto al contenido del nombre como a un campo opcional de Classroom. Usar la asignatura ingresada para el nombre; el campo API `subject` puede completarse con ese mismo valor si se comprueba su compatibilidad. No pedir al docente repetir el dato.

No asumir cuatro unidades: iniciar con una unidad editable y permitir añadir o quitar. No inventar contenidos de syllabus, sesiones, fechas ni actividades. Validar espacios vacíos, unidades duplicadas y límites de longitud de la API. Al retirar tutoría, actualizar inmediatamente la vista previa.

## 2. Estructura exacta de temas

El documento usa «Sección» para referirse a un tema. No confundirlo con el campo `section` del curso. Mantener este orden visible, con una unidad por cada elemento configurado:

1. `Unidad temática 1` … `Unidad temática N`, con `: Título` cuando se haya indicado.
2. `Lineamientos disciplinarios`.
3. `Encuadre de la asignatura`.
4. `Habilidades blandas`, solamente si es tutor.
5. `Proyecto en aula`, solamente si es tutor.
6. `Evaluación del aprendizaje`.
7. `Clases grabadas`.
8. `Información de Bienestar universitario`.

Son N + 5 temas para un docente y N + 7 para un tutor. Reemplazar completamente `TEMAS_PREDEFINIDOS`; no conservar los antiguos temas de Meet, tareas o exámenes como temas adicionales.

Classroom no tiene temas anidados. «PRIMER PARCIAL» y «SEGUNDO PARCIAL» son agrupaciones dentro de Evaluación del aprendizaje, no nuevos temas. La vista previa sí puede mostrar el esquema de contenidos.

Comprobar cómo coloca Classroom los temas recién creados. Si los inserta arriba, enviarlos en orden inverso para obtener el orden visible requerido. Validarlo en un aula de prueba autorizada; no dar por hecho que el orden de inserción equivale al orden visual.

## 3. Contenidos requeridos por tema

Representar estos contenidos en una configuración declarativa y mostrarlos como guía/lista de pendientes. Crear un tema no significa que esos documentos ya existan.

### Unidades temáticas

Sesiones de clases, actividades y tareas conforme al syllabus y guía de estudio. Su contenido debe aportarlo el docente.

### Lineamientos disciplinarios

- Código de ética UNESUM — PDF.
- Modelo Educativo.
- Reglamento del régimen académico.
- Modelo de oficio de justificación de inasistencia.
- Modelo de oficio de retiro de asignatura.
- Misión y visión institucional.
- Misión y visión de la carrera.

### Encuadre de la asignatura

- Curriculum Vitae.
- Guía de estudio.
- Recursos bibliográficos.
- Lineamientos internos para la justificación de inasistencia.
- Programa analítico sin legalizar y legalizado.
- Syllabus sin legalizar y legalizado.
- Formulario de acuerdos y compromisos.
- Formulario de socialización del syllabus.
- Socialización de código de ética.

Mostrar ambas versiones requeridas de programa y syllabus como pendientes diferenciados, aunque la guía los agrupe en una sola línea.

### Habilidades blandas — solo tutor

- Diapositivas de las habilidades blandas según el nivel.
- Actividades de la habilidad blanda.
- Evaluación de las habilidades blandas.

### Proyecto en aula — solo tutor

- Guía metodológica.
- Cronograma.
- Ficha de inscripción.
- Modelo estandarizado.

### Evaluación del aprendizaje

Primer parcial:

- Sistema de control de evaluación del aprendizaje — Pre actas, sin nota de examen.
- Hoja electrónica de calificaciones.
- Acta general de calificaciones SGA — PDF.

Segundo parcial:

- Sistema de control de evaluación del aprendizaje — Pre actas, sin nota de examen.
- Hoja electrónica de calificaciones.
- Acta general de calificaciones SGA — PDF.
- Acta final de las calificaciones de SGA — PDF, materia cerrada.

### Clases grabadas

Pendiente de incorporar grabaciones reales. La guía no define títulos ni cantidad.

### Información de Bienestar universitario

- Reglamentos de becas.
- Información de los servicios que presta.

## 4. Flujo y tratamiento de errores

1. Iniciar sesión con Google y mostrar el correo activo.
2. Completar los datos y revisar nombre, sección, temas y condición de tutor.
3. Pulsar «Crear aula» una única vez; bloquear envíos simultáneos y cambios de cuenta durante el proceso.
4. Crear el curso con `ownerId: 'me'` y `courseState: 'ACTIVE'`.
5. Conservar inmediatamente su ID y enlace para que un fallo posterior no provoque otra creación de curso.
6. Crear los temas con progreso, por ejemplo «Creando temas: 3 de 8».
7. Mostrar resultado completo o parcial con enlace al aula, código de acceso si está disponible, temas creados y pendientes.
8. Ante fallo parcial, ofrecer «Completar temas pendientes» en ese mismo curso; nunca invocar otra vez la creación del curso desde esa acción.

Separar funciones para construir datos, generar temas y ejecutar solicitudes. Usar un estado explícito del proceso con `courseId` y los identificadores de los temas creados. Mantenerlo al menos en memoria para reintentos dentro de la página. La recuperación tras recargar es opcional: si se implementa, guardar solo metadatos mínimos en `sessionStorage`, vinculados al usuario, nunca el token.

Antes de reintentar temas, consultar los temas existentes con paginación y reconciliar los nombres esperados para contemplar solicitudes que llegaron al servidor pero cuya respuesta se perdió. No reutilizar temas de otro curso ni recrear los ya confirmados. Ante resultado incierto del POST del curso, informar que debe comprobar Classroom antes de crear otra aula; no reintentar automáticamente ese POST.

Conservar código HTTP y detalles estructurados del error. Gestionar 401 como sesión expirada y 403 como permiso insuficiente o restricción institucional. Para 429/5xx, usar reintentos limitados con espera creciente solo cuando no puedan duplicar recursos; en escrituras con resultado incierto, reconciliar primero. No borrar automáticamente un aula parcialmente creada.

Cambiar `setStatus` para que datos del usuario y mensajes de API se inserten mediante `textContent`. Construir enlaces con elementos DOM y URL validada, evitando interpolarlos en `innerHTML`. Manejar carga pendiente o fallida de Google Identity Services y cierre del popup de autenticación. No persistir access tokens.

## 5. Pendientes institucionales al terminar

Mostrar una lista que pueda copiarse o imprimirse:

- Cargar los documentos, sesiones, tareas y grabaciones descritos arriba.
- Invitar como docente al personal de apoyo de seguimiento. La guía deja el correo en blanco: no inventarlo ni enviar invitaciones sin destinatario indicado.
- Registrar en la matriz institucional el código de acceso, enlace de Classroom y enlace de Zoom. No existe matriz identificada ni credenciales de Zoom; no simular estas integraciones.
- Configurar las categorías de calificación en Classroom después de resolver la inconsistencia de la guía.
- Invitar estudiantes con los correos institucionales del listado SGA y seguir sus aceptaciones antes del inicio del periodo.
- Realizar el seguimiento institucional indicado hasta dos semanas después del inicio de clases. No clasificar automáticamente estudiantes como desertores.

Calificaciones: transcribir «Docencia: mínimo 1, máximo 3; Prácticas de aplicación y experimentación: mínimo 1, máximo 3; Actividades de aprendizaje autónomo: mínimo 1, máximo 3; Exámenes parciales: 4; Total: 10». Los máximos suman 13. No normalizar a porcentajes ni decidir ponderaciones sin aclaración institucional. `gradebookSettings` aparece como solo lectura en la API consultada, por lo que esta entrega debe orientar la configuración manual y no prometer escribirla.

La guía también incluye cronograma institucional e indicadores CACES: conservarlos como contexto de la documentación, sin convertirlos en temas ni funcionalidades de administración.

## 6. Segunda entrega opcional

Solo si se amplía expresamente el alcance:

- Crear entradas `courseWorkMaterials` en estado `DRAFT`, asociadas mediante `topicId`, para los documentos esperados. Dejarlas identificadas como pendientes de adjuntar; no publicar documentos vacíos como si estuvieran completos.
- No generar tareas, evaluaciones calificadas ni formularios a partir de los títulos: faltan instrucciones, rúbricas y contenidos.
- Empezar sin subida de archivos ni integración Drive. Si se incorpora después, definir permisos y tratamiento de archivos de forma específica.
- Permitir un correo opcional de seguimiento y crear una invitación con rol `TEACHER`, informando su resultado de manera independiente del aula.
- Solicitar permisos OAuth adicionales solo para las funciones habilitadas: comprobar los scopes exactos en la documentación de cada método. Materiales e invitaciones necesitan permisos que el HTML actual no solicita.

## 7. Orden de implementación

1. Extraer la plantilla institucional a datos y funciones puras. Añadir el nuevo formulario y la vista previa.
2. Adaptar creación de curso/temas y verificar denominación, exclusión de tutoría y orden visible.
3. Implementar progreso, resultado parcial, reanudación y mensajes seguros.
4. Añadir la lista de pendientes, instrucciones de uso y limitaciones conocidas.
5. Ejecutar verificaciones con API simulada. Documentar por separado la prueba real pendiente si no hay autorización para crear un aula de prueba.

## 8. Criterios de aceptación y pruebas

- Una unidad sin tutoría produce 6 temas; con tutoría produce 8. Tres unidades producen 8 y 10 respectivamente.
- Nombres y sección coinciden con la vista previa y conservan tildes y caracteres españoles.
- Campos opcionales vacíos no bloquean; datos obligatorios vacíos sí.
- Los temas antiguos desaparecen y el orden visible coincide con el esquema de la guía.
- Un fallo en el tercer tema conserva el curso y permite terminar sin duplicar curso ni temas.
- Un doble clic no dispara dos POST de curso. Una respuesta perdida al crear un tema se reconcilia antes de repetirlo.
- Una sesión expirada y un permiso insuficiente producen acciones y mensajes distintos.
- Texto como `<img src=x onerror=alert(1)>` en un campo se muestra literalmente, sin ejecutarse.
- Vista usable a 360 px y en escritorio, etiquetas accesibles, foco visible y progreso anunciado con `aria-live`.
- La aplicación no declara completados documentos, invitaciones o calificaciones que no se han realizado.

Usar pruebas pequeñas de generación de plantilla y un `fetch` simulado para el flujo de fallo/reanudación. No añadir una infraestructura de pruebas grande. La autenticación institucional, consentimiento OAuth y posición visual de los temas requieren comprobación real en navegador con un aula de prueba autorizada.

## 9. Entrega esperada de Claude

Código actualizado, README breve con ejecución local y configuración OAuth de orígenes autorizados, y un resumen de pruebas realizadas y pendientes. No desplegar, enviar invitaciones, subir documentos ni crear aulas reales como parte de la implementación sin que el usuario lo pida.

## Referencias técnicas

Consultadas al preparar el plan; Claude debe comprobar los campos y permisos aplicables antes de implementar:

- Curso y restricciones de campos: https://developers.google.com/workspace/classroom/reference/rest/v1/courses
- Crear curso: https://developers.google.com/workspace/classroom/reference/rest/v1/courses/create
- Temas: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.topics
- Crear materiales: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWorkMaterials/create
- Invitaciones: https://developers.google.com/workspace/classroom/guides/manage-invitations

