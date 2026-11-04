'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../template.js');

const base = {
  asignatura: 'Psicología Educativa',
  docente: 'Ana Pérez',
  nivel: 'Tercero',
  paralelo: 'A',
  jornada: 'Semipresencial',
  modalidad: 'En línea',
  periodo: 'PII 2026',
  aula: '',
  tutor: false,
  units: [{ title: '' }],
};
const form = (over) => Object.assign({}, base, over);

test('número de temas: 1 unidad → 6 / 8; 3 unidades → 8 / 10', () => {
  const three = [{ title: '' }, { title: 'Fundamentos' }, { title: '' }];
  assert.equal(P.validate(form()).plan.topics.length, 6);
  assert.equal(P.validate(form({ tutor: true })).plan.topics.length, 8);
  assert.equal(P.validate(form({ units: three })).plan.topics.length, 8);
  assert.equal(P.validate(form({ units: three, tutor: true })).plan.topics.length, 10);
});

test('orden visible exacto, con y sin tutoría', () => {
  const units = [{ title: '' }, { title: 'Teorías del aprendizaje' }];
  assert.deepEqual(P.validate(form({ units, tutor: true })).plan.topics.map((t) => t.name), [
    'Unidad temática 1',
    'Unidad temática 2: Teorías del aprendizaje',
    'Lineamientos disciplinarios',
    'Encuadre de la asignatura',
    'Habilidades blandas',
    'Proyecto en aula',
    'Evaluación del aprendizaje',
    'Clases grabadas',
    'Información de Bienestar universitario',
  ]);
  const names = P.validate(form({ units })).plan.topics.map((t) => t.name);
  assert.ok(!names.includes('Habilidades blandas') && !names.includes('Proyecto en aula'));
});

test('no quedan temas antiguos', () => {
  const names = P.validate(form({ tutor: true })).plan.topics.map((t) => t.name).join('|');
  for (const old of ['Enlace Meet', 'Tareas', 'Exámenes', 'Calificaciones', 'Grabaciones de clases', 'Encuadre Pedagógico']) {
    assert.ok(!names.split('|').includes(old), old);
  }
});

test('nombre y sección según la guía, con tildes', () => {
  const { plan, ok } = P.validate(form({ docente: '  Ana   Pérez ' }));
  assert.ok(ok);
  assert.equal(plan.name, 'Psicología Educativa – Ana Pérez');
  assert.equal(plan.section, 'Tercero – A – Semipresencial – PII 2026');
  const body = P.coursePayload(plan);
  assert.equal(body.ownerId, 'me');
  assert.equal(body.courseState, 'ACTIVE');
  assert.equal(body.subject, 'Psicología Educativa');
  assert.ok(!('room' in body), 'aula vacía no se envía');
});

test('obligatorios vacíos bloquean; opcionales vacíos no', () => {
  assert.ok(P.validate(form({ aula: '', units: [{ title: '' }] })).ok);
  for (const f of ['asignatura', 'nivel', 'paralelo', 'jornada']) {
    const r = P.validate(form({ [f]: '   ' }));
    assert.ok(!r.ok, f);
    assert.ok(r.errors.some((e) => e.field === f), f);
  }
  assert.ok(!P.validate(form({ units: [] })).ok);
});

test('unidades duplicadas y límites de longitud', () => {
  const dup = P.validate(form({ units: [{ title: 'Ética' }, { title: ' ética ' }] }));
  assert.ok(!dup.ok);
  assert.equal(dup.errors[0].field, 'unit-1');
  assert.ok(!P.validate(form({ units: [{ title: 'x'.repeat(100) }] })).ok, 'tema > 100');
  assert.ok(!P.validate(form({ aula: 'x'.repeat(651) })).ok, 'room > 650');
  assert.ok(P.validate(form({ aula: 'Aula 12' })).ok);
});

test('evaluación agrupa parciales sin crear temas nuevos', () => {
  const ev = P.validate(form()).plan.topics.find((t) => t.key === 'evaluacion');
  assert.deepEqual(ev.groups.map((g) => g.title), ['PRIMER PARCIAL', 'SEGUNDO PARCIAL']);
  assert.equal(ev.groups[1].items.length, 4);
});

test('pendientes diferencian programa y syllabus, y no declaran nada completado', () => {
  const { plan } = P.validate(form({ tutor: true }));
  const txt = P.pendientesText(plan, { link: 'https://classroom.google.com/c/x', enrollmentCode: 'abc123' });
  for (const s of ['Programa analítico sin legalizar', 'Programa analítico legalizado', 'Syllabus sin legalizar', 'Syllabus legalizado', 'Código de acceso: abc123']) {
    assert.ok(txt.includes(s), s);
  }
  assert.ok(!txt.includes('Los máximos suman 13'));
  assert.ok(!txt.includes('Según la guía'));
  assert.ok(!/☑|completad[oa]/i.test(txt));
});

test('texto con HTML se conserva literal en los datos', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { plan } = P.validate(form({ asignatura: evil }));
  assert.equal(plan.name, evil + ' – Ana Pérez');
});

test('plantilla genérica con sección y periodo fijo', () => {
  const r = P.validate({ asignatura: 'Psicología Educativa', nivel: 'Primero', paralelo: 'A', jornada: 'Semipresencial', periodo: 'Otro periodo' });
  assert.ok(r.ok);
  assert.equal(r.plan.name, 'Psicología Educativa');
  assert.equal(r.plan.section, 'Primero – A – Semipresencial – PII 2026');
  assert.equal(r.plan.topics.length, 9);
  for (const topic of r.plan.topics.slice(2, 4)) {
    assert.deepEqual(topic.sessions, []);
    assert.deepEqual(topic.groups, []);
    assert.ok(!r.plan.sessions.some((s) => s.topicKey === topic.key || s.unitIndex === r.plan.topics.indexOf(topic)));
  }
  assert.equal(r.plan.sessions.length, 34);
  assert.deepEqual(r.plan.sessions.filter((s) => s.title.startsWith('Sesión 1 —')).map((s) => s.kind), ['material']);
  assert.equal(P.validate({ asignatura: 'Curso', tutor: true }).plan.topics.length, 11);
});


test('materiales institucionales completos en su tema y tutoría opcional', () => {
  for (const tutor of [false, true]) {
    const plan = P.validate(form({ tutor })).plan;
    const fixed = plan.sessions.filter((s) => s.topicKey);
    assert.equal(fixed.length, tutor ? 34 : 27);
    for (const topic of plan.topics) {
      const expected = topic.groups.reduce((n, g) => n + g.items.length, 0);
      assert.equal(fixed.filter((s) => s.topicKey === topic.key).length, expected);
    }
    assert.equal(new Set(plan.sessions.map((s) => s.title)).size, plan.sessions.length);
    assert.ok(fixed.every((s) => s.kind === 'material' && !('description' in s)));
    const grades = fixed.filter((s) => s.topicKey === 'evaluacion');
    assert.equal(grades.filter((s) => s.title.startsWith('PRIMER PARCIAL')).length, 3);
    assert.equal(grades.filter((s) => s.title.startsWith('SEGUNDO PARCIAL')).length, 4);
    assert.equal(fixed.some((s) => s.topicKey === 'habilidades'), tutor);
  }
});
