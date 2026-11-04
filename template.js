// Plantilla institucional UNESUM PII 2026: datos declarativos y funciones puras.
// Sin acceso al DOM ni a la red, para poder probarse con Node (`node --test`).
(function (root) {
  'use strict';

  // Límites de la Classroom API (courses y courses.topics).
  const LIMITS = {
    courseName: 750,
    section: 2800,
    room: 650,
    topicName: 100,
    field: 200, // límite propio para cada dato del formulario
    maxUnits: 20,
  };

  const NIVELES = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo'];
  const JORNADAS = ['Semipresencial', 'En línea', 'Presencial'];

  const DEFAULTS = {
    modalidad: 'En línea',
    periodo: 'PII 2026',
  };

  // Separador de la guía: guion largo con espacios.
  const SEP = ' – ';

  // Contenidos esperados en cada tema (el documento los llama «secciones»).
  // Cada elemento genera un material en borrador; los archivos los aporta el docente.
  const CONTENIDOS = {
    unidad: {
      note: 'Sesiones de clases, actividades y tareas conforme al syllabus y guía de estudio. Su contenido lo aporta el docente.',
      groups: [],
    },
    lineamientos: {
      name: 'Lineamientos disciplinarios',
      groups: [{ title: null, items: [
        'Código de ética UNESUM — PDF',
        'Modelo Educativo',
        'Reglamento del régimen académico',
        'Modelo de oficio de justificación de inasistencia',
        'Modelo de oficio de retiro de asignatura',
        'Misión y visión institucional',
        'Misión y visión de la carrera',
      ] }],
    },
    encuadre: {
      name: 'Encuadre de la asignatura',
      groups: [{ title: null, items: [
        'Curriculum Vitae',
        'Guía de estudio',
        'Recursos bibliográficos',
        'Lineamientos internos para la justificación de inasistencia',
        'Programa analítico sin legalizar',
        'Programa analítico legalizado',
        'Syllabus sin legalizar',
        'Syllabus legalizado',
        'Formulario de acuerdos y compromisos',
        'Formulario de socialización del syllabus',
        'Socialización de código de ética',
      ] }],
    },
    habilidades: {
      name: 'Habilidades blandas',
      tutorOnly: true,
      groups: [{ title: null, items: [
        'Diapositivas de las habilidades blandas según el nivel',
        'Actividades de la habilidad blanda',
        'Evaluación de las habilidades blandas',
      ] }],
    },
    proyecto: {
      name: 'Proyecto en aula',
      tutorOnly: true,
      groups: [{ title: null, items: [
        'Guía metodológica',
        'Cronograma',
        'Ficha de inscripción',
        'Modelo estandarizado',
      ] }],
    },
    evaluacion: {
      name: 'Evaluación del aprendizaje',
      groups: [
        { title: 'PRIMER PARCIAL', items: [
          'Sistema de control de evaluación del aprendizaje — Pre actas, sin nota de examen',
          'Hoja electrónica de calificaciones',
          'Acta general de calificaciones SGA — PDF',
        ] },
        { title: 'SEGUNDO PARCIAL', items: [
          'Sistema de control de evaluación del aprendizaje — Pre actas, sin nota de examen',
          'Hoja electrónica de calificaciones',
          'Acta general de calificaciones SGA — PDF',
          'Acta final de las calificaciones de SGA — PDF, materia cerrada',
        ] },
      ],
    },
    grabadas: {
      name: 'Clases grabadas',
      note: 'Pendiente de incorporar las grabaciones reales. La guía no define títulos ni cantidad.',
      groups: [],
    },
    bienestar: {
      name: 'Información de Bienestar universitario',
      groups: [{ title: null, items: [
        'Reglamentos de becas',
        'Información de los servicios que presta',
      ] }],
    },
  };

  const SESIONES = [
    { title: 'Sesión 1 — Encuadre de la asignatura', unitIndex: 0 },
    { title: 'Sesión 2 — Introducción a la unidad temática', unitIndex: 0 },
    { title: 'Sesión 3 — Introducción a la unidad temática 2', unitIndex: 1 },
    { title: 'Sesión 4 — Aplicación práctica', unitIndex: 1 },
  ];

  function buildSessionDrafts(unitCount) {
    return SESIONES.filter((s) => s.unitIndex < unitCount).flatMap((s, index) => {
      const material = { ...s, kind: 'material', title: s.title + ' — Material' };
      if (index === 0) return [material];
      return [material, { ...s, kind: 'task', title: s.title + ' — Tarea' }];
    });
  }

  function buildFixedDrafts(topics) {
    return topics.flatMap((topic) => topic.groups.flatMap((group) => group.items.map((item) => ({
      kind: 'material',
      topicKey: topic.key,
      title: group.title ? group.title + ' — ' + item : item,
    }))));
  }

  // Orden visible exigido por la guía, después de las unidades.
  const ORDEN_FIJO = ['lineamientos', 'encuadre', 'habilidades', 'proyecto', 'evaluacion', 'grabadas', 'bienestar'];

  const PENDIENTES_INSTITUCIONALES = [
    'Cargar los documentos, sesiones, tareas y grabaciones indicados en cada tema.',
    'Invitar como docente al personal de apoyo de seguimiento (la guía no indica el correo; esta aplicación no envía invitaciones).',
    'Registrar en la matriz institucional el código de acceso, el enlace de Classroom y el enlace de Zoom.',
    'Configurar las categorías de calificación en Classroom.',
    'Invitar a los estudiantes con los correos institucionales del listado SGA y dar seguimiento a sus aceptaciones antes del inicio del periodo.',
    'Realizar el seguimiento institucional indicado hasta dos semanas después del inicio de clases.',
  ];

  // Recorta extremos y colapsa espacios internos (incluye espacios no separables).
  function clean(value) {
    return String(value == null ? '' : value).normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function compareKey(value) {
    return clean(value).toLocaleLowerCase('es');
  }

  function unitTopicName(index, title) {
    const t = clean(title);
    return 'Unidad temática ' + (index + 1) + (t ? ': ' + t : '');
  }

  function buildCourseName(v) {
    return [v.asignatura, v.docente].map(clean).filter(Boolean).join(SEP);
  }

  function buildSection(v) {
    return [v.nivel, clean(v.paralelo).toLocaleUpperCase('es'), v.jornada, DEFAULTS.periodo].map(clean).filter(Boolean).join(SEP);
  }

  // Devuelve los temas en orden visible: [{ key, name, note, groups }].
  function buildTopics(units, isTutor) {
    const topics = (units || []).map((u, i) => ({
      key: 'unidad-' + (i + 1),
      name: unitTopicName(i, u && u.title),
      note: CONTENIDOS.unidad.note,
      groups: [],
      sessions: SESIONES.filter((s) => s.unitIndex === i),
    }));
    for (const key of ORDEN_FIJO) {
      const c = CONTENIDOS[key];
      if (c.tutorOnly && !isTutor) continue;
      topics.push({ key, name: c.name, note: c.note || null, groups: c.groups });
    }
    return topics;
  }

  const REQUIRED = [
    ['asignatura', 'Asignatura'],
    ['docente', 'Nombre del docente'],
    ['nivel', 'Nivel'],
    ['paralelo', 'Paralelo'],
    ['jornada', 'Jornada'],
    ['modalidad', 'Modalidad'],
    ['periodo', 'Periodo académico'],
  ];

  // Valida y normaliza el formulario. Devuelve { ok, errors, values, plan }.
  // errors: lista de { field, message }; field puede ser 'unit-<i>' o 'units'.
  function validate(raw) {
    const errors = [];
    const values = {};
    for (const [field, label] of REQUIRED) {
      values[field] = clean(raw[field]);
      if (!values[field] && ['asignatura', 'nivel', 'paralelo', 'jornada'].includes(field)) {
        errors.push({ field, message: field === 'asignatura' ? 'Escribe el nombre del curso.' : label + ' es obligatorio.' });
      }
      else if (values[field].length > (field === 'asignatura' ? LIMITS.courseName : LIMITS.field)) {
        errors.push({ field, message: label + ' admite como máximo ' + LIMITS.field + ' caracteres.' });
      }
    }
    values.paralelo = values.paralelo.toLocaleUpperCase('es');
    values.periodo = DEFAULTS.periodo;
    if (values.nivel && !NIVELES.includes(values.nivel)) errors.push({ field: 'nivel', message: 'Selecciona un nivel de Primero a Octavo.' });
    if (values.jornada && !JORNADAS.includes(values.jornada)) errors.push({ field: 'jornada', message: 'Selecciona una jornada de la lista.' });
    values.aula = clean(raw.aula);
    if (values.aula.length > LIMITS.room) {
      errors.push({ field: 'aula', message: 'Aula admite como máximo ' + LIMITS.room + ' caracteres.' });
    }
    values.tutor = Boolean(raw.tutor);
    values.units = (raw.units || Array.from({ length: 4 }, () => ({ title: '' }))).map((u) => ({ title: clean(u && u.title) }));

    if (values.units.length === 0) {
      errors.push({ field: 'units', message: 'Añade al menos una unidad temática.' });
    } else if (values.units.length > LIMITS.maxUnits) {
      errors.push({ field: 'units', message: 'Como máximo ' + LIMITS.maxUnits + ' unidades temáticas.' });
    }
    const seen = new Map();
    values.units.forEach((u, i) => {
      const name = unitTopicName(i, u.title);
      if (name.length > LIMITS.topicName) {
        errors.push({ field: 'unit-' + i, message: 'El nombre de la unidad ' + (i + 1) + ' supera ' + LIMITS.topicName + ' caracteres.' });
      }
      if (!u.title) return;
      const k = compareKey(u.title);
      if (seen.has(k)) {
        errors.push({ field: 'unit-' + i, message: 'La unidad ' + (i + 1) + ' repite el título de la unidad ' + (seen.get(k) + 1) + '.' });
      } else {
        seen.set(k, i);
      }
    });

    const plan = {
      name: buildCourseName(values),
      section: buildSection(values),
      room: values.aula,
      subject: values.asignatura,
      tutor: values.tutor,
      topics: buildTopics(values.units, values.tutor),
      sessions: [
        ...buildSessionDrafts(values.units.length),
        ...buildFixedDrafts(buildTopics(values.units, values.tutor)),
      ],
    };
    if (errors.length === 0) {
      if (plan.name.length > LIMITS.courseName) errors.push({ field: 'asignatura', message: 'El nombre del curso supera ' + LIMITS.courseName + ' caracteres.' });
      if (plan.section.length > LIMITS.section) errors.push({ field: 'nivel', message: 'La sección supera ' + LIMITS.section + ' caracteres.' });
    }
    return { ok: errors.length === 0, errors, values, plan };
  }

  // Cuerpo para POST /v1/courses.
  function coursePayload(plan) {
    const body = {
      name: plan.name,
      section: plan.section,
      subject: plan.subject,
      ownerId: 'me',
      courseState: 'ACTIVE',
    };
    if (plan.room) body.room = plan.room;
    return body;
  }

  // Lista de pendientes en texto plano, apta para copiar o imprimir.
  function pendientesText(plan, result) {
    const lines = [];
    lines.push('Pendientes del aula: ' + plan.name);
    lines.push('Sección: ' + plan.section);
    if (result && result.link) lines.push('Enlace: ' + result.link);
    if (result && result.enrollmentCode) lines.push('Código de acceso: ' + result.enrollmentCode);
    lines.push('');
    lines.push('Completar los materiales institucionales y las sesiones en borrador: adjuntar los documentos y recursos antes de publicar.');
    lines.push('Borradores para actualizar con documentos y recursos:');
    for (const t of plan.topics) {
      lines.push('');
      lines.push('■ ' + t.name);
      if (t.note) lines.push('  ' + t.note);
      for (const g of t.groups) {
        if (g.title) lines.push('  ' + g.title);
        for (const item of g.items) lines.push((g.title ? '    ' : '  ') + '☐ ' + item);
      }
    }
    lines.push('');
    lines.push('Tareas institucionales:');
    for (const p of PENDIENTES_INSTITUCIONALES) lines.push('☐ ' + p);
    return lines.join('\n');
  }

  const api = {
    SESIONES, buildSessionDrafts, buildFixedDrafts, LIMITS, DEFAULTS, NIVELES, JORNADAS, SEP, CONTENIDOS, ORDEN_FIJO, PENDIENTES_INSTITUCIONALES,
    clean, compareKey, unitTopicName, buildCourseName, buildSection, buildTopics,
    validate, coursePayload, pendientesText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plantilla = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
