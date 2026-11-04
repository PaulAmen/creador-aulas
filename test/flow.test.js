'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../template.js');
const C = require('../classroom.js');

const plan = P.validate({
  asignatura: 'Psicología Educativa', docente: 'Ana Pérez', nivel: 'Tercero', paralelo: 'A',
  jornada: 'Semipresencial', modalidad: 'En línea', periodo: 'PII 2026', tutor: true,
  units: [{ title: '' }],
}).plan; // 8 temas

// Servidor Classroom simulado. `faults` decide, por llamada, si falla.
function fakeServer() {
  const s = { courses: [], topics: [], calls: [], faults: [] };
  s.fetch = async (url, opts) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const call = { method, path: u.pathname, body: opts.body ? JSON.parse(opts.body) : null };
    s.calls.push(call);
    const fault = s.faults.find((f) => f.when(call, s));
    const respond = (status, data) => ({ ok: status < 400, status, statusText: '', json: async () => data });
    if (fault && fault.type === 'network-before') throw new TypeError('Failed to fetch');
    if (fault && typeof fault.type === 'number') {
      return respond(fault.type, { error: { code: fault.type, message: 'Simulado', status: 'SIM' } });
    }
    let result;
    if (method === 'POST' && u.pathname === '/v1/courses') {
      const c = { id: 'c' + (s.courses.length + 1), ...call.body, alternateLink: 'https://classroom.google.com/c/xyz', enrollmentCode: 'k3y9' };
      s.courses.push(c);
      result = respond(200, c);
    } else if (method === 'POST' && /\/topics$/.test(u.pathname)) {
      const t = { courseId: u.pathname.split('/')[3], topicId: 't' + (s.topics.length + 1), name: call.body.name };
      s.topics.push(t);
      result = respond(200, t);
    } else if (method === 'GET' && /\/topics$/.test(u.pathname)) {
      const cid = u.pathname.split('/')[3];
      const mine = s.topics.filter((t) => t.courseId === cid);
      const start = Number(u.searchParams.get('pageToken') || 0);
      const page = mine.slice(start, start + 3); // páginas pequeñas para probar paginación
      const next = start + 3 < mine.length ? String(start + 3) : undefined;
      result = respond(200, { topic: page, nextPageToken: next });
    } else {
      result = respond(404, { error: { message: 'no' } });
    }
    // La solicitud se procesó pero la respuesta se pierde.
    if (fault && fault.type === 'network-after') throw new TypeError('Failed to fetch');
    return result;
  };
  return s;
}

function service(s, extra) {
  return C.createService(Object.assign({ fetch: s.fetch, getToken: () => 'tok', sleep: async () => {}, pauseBetweenTopics: 0 }, extra));
}

const topicPosts = (s) => s.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/topics'));
const coursePosts = (s) => s.calls.filter((c) => c.method === 'POST' && c.path === '/v1/courses');

test('flujo completo: un curso y 8 temas, enviados en orden inverso', async () => {
  const s = fakeServer();
  const svc = service(s);
  const run = svc.newRun(plan, 'ana@unesum.edu.ec');
  const progress = [];
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run, (d, t) => progress.push(d + '/' + t));
  assert.equal(s.courses.length, 1);
  assert.equal(s.courses[0].name, 'Psicología Educativa – Ana Pérez');
  assert.deepEqual(s.topics.map((t) => t.name), plan.topics.map((t) => t.name).reverse());
  assert.equal(run.phase, 'done');
  assert.deepEqual(svc.pendingTopics(run), []);
  assert.equal(progress.at(-1), '8/8');
});

test('orden forward configurable', async () => {
  const s = fakeServer();
  const svc = service(s, { topicOrder: 'forward' });
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run);
  assert.deepEqual(s.topics.map((t) => t.name), plan.topics.map((t) => t.name));
});

test('fallo en el tercer tema conserva el curso y se completa sin duplicar', async () => {
  const s = fakeServer();
  const svc = service(s);
  let n = 0;
  s.faults.push({ type: 403, when: (c) => c.method === 'POST' && c.path.endsWith('/topics') && ++n === 3 });
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await assert.rejects(svc.completeTopics(run), (e) => e.status === 403 && e.kind === 'permission');
  assert.equal(run.phase, 'partial');
  assert.equal(svc.pendingTopics(run).length, 6);

  await svc.completeTopics(run); // «Completar temas pendientes»
  assert.equal(coursePosts(s).length, 1);
  assert.equal(s.topics.length, 8);
  assert.equal(new Set(s.topics.map((t) => t.name)).size, 8);
  assert.equal(run.phase, 'done');
});

test('respuesta perdida al crear un tema se reconcilia antes de repetir', async () => {
  const s = fakeServer();
  const svc = service(s);
  let n = 0;
  s.faults.push({ type: 'network-after', when: (c) => c.method === 'POST' && c.path.endsWith('/topics') && ++n === 2 });
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run);
  assert.equal(s.topics.length, 8, 'sin temas duplicados');
  assert.equal(topicPosts(s).length, 8, 'el tema perdido no se volvió a enviar');
  assert.equal(run.phase, 'done');
});

test('5xx sin crear el tema: reintenta tras reconciliar', async () => {
  const s = fakeServer();
  const svc = service(s);
  let n = 0;
  s.faults.push({ type: 503, when: (c) => c.method === 'POST' && c.path.endsWith('/topics') && ++n === 1 });
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run);
  assert.equal(s.topics.length, 8);
  assert.equal(topicPosts(s).length, 9);
});

test('reanudación usa paginación y no recrea temas ya existentes', async () => {
  const s = fakeServer();
  const svc = service(s);
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run);
  run.topicIds = {}; // simula pérdida de los IDs en memoria
  await svc.completeTopics(run);
  assert.equal(s.topics.length, 8);
  assert.equal(Object.keys(run.topicIds).length, 8);
  // 1 GET en la primera pasada (curso vacío) + 3 páginas de 3 para 8 temas.
  assert.equal(s.calls.filter((c) => c.method === 'GET').length, 4, 'varias páginas');
});

test('no reutiliza temas de otro curso', async () => {
  const s = fakeServer();
  s.topics.push({ courseId: 'otro', topicId: 'zz', name: 'Clases grabadas' });
  const svc = service(s);
  const run = svc.newRun(plan, 'x');
  await svc.createCourse(run, P.coursePayload(plan));
  await svc.completeTopics(run);
  assert.notEqual(run.topicIds['Clases grabadas'], 'zz');
});

test('doble clic: un segundo createCourse simultáneo no hace otro POST', async () => {
  const s = fakeServer();
  const svc = service(s);
  const run = svc.newRun(plan, 'x');
  const a = svc.createCourse(run, P.coursePayload(plan));
  await assert.rejects(svc.createCourse(run, P.coursePayload(plan)));
  await a;
  await assert.rejects(svc.createCourse(run, P.coursePayload(plan)));
  assert.equal(coursePosts(s).length, 1);
});

test('resultado incierto del curso: no se reintenta', async () => {
  const s = fakeServer();
  s.faults.push({ type: 'network-after', when: (c) => c.path === '/v1/courses' });
  const svc = service(s);
  const run = svc.newRun(plan, 'x');
  await assert.rejects(svc.createCourse(run, P.coursePayload(plan)), (e) => e.kind === 'network');
  assert.equal(run.courseUncertain, true);
  assert.equal(run.phase, 'uncertain');
  await assert.rejects(svc.createCourse(run, P.coursePayload(plan)), /incierto/);
  assert.equal(coursePosts(s).length, 1);
});

test('401 y 403 se distinguen', async () => {
  for (const [code, kind] of [[401, 'auth'], [403, 'permission']]) {
    const s = fakeServer();
    s.faults.push({ type: code, when: (c) => c.path === '/v1/courses' });
    const svc = service(s);
    const run = svc.newRun(plan, 'x');
    await assert.rejects(svc.createCourse(run, P.coursePayload(plan)), (e) => e.status === code && e.kind === kind);
    assert.equal(run.courseUncertain, false);
  }
});

test('URL de Classroom validada', () => {
  assert.equal(C.safeClassroomUrl('https://classroom.google.com/c/abc'), 'https://classroom.google.com/c/abc');
  assert.equal(C.safeClassroomUrl('javascript:alert(1)'), null);
  assert.equal(C.safeClassroomUrl('https://evil.example/classroom.google.com'), null);
  assert.equal(C.safeClassroomUrl(undefined), null);
});


test('sesiones en borrador: respuesta perdida y reanudación sin duplicados', async () => {
  const server = fakeServer();
  const materials = [];
  let loseResponse = true;
  const fetch = async (url, options) => {
    if (!url.includes('/courseWork')) return server.fetch(url, options);
    const isTask = new URL(url).pathname.endsWith('/courseWork');
    const respond = (body) => ({ ok: true, status: 200, json: async () => body });
    if (options.method === 'GET') {
      assert.ok(url.includes(isTask ? 'courseWorkStates=DRAFT' : 'courseWorkMaterialStates=DRAFT'));
      return respond({ [isTask ? 'courseWork' : 'courseWorkMaterial']: materials.filter((m) => Boolean(m.workType) === isTask) });
    }
    const body = JSON.parse(options.body);
    const material = { ...body, id: 'm' + (materials.length + 1) };
    materials.push(material);
    if (loseResponse) { loseResponse = false; throw new Error('Respuesta perdida'); }
    return respond(material);
  };
  const svc = C.createService({ fetch, getToken: () => 'token', sleep: async () => {}, pauseBetweenTopics: 0 });
  const run = svc.newRun({ ...plan, sessions: P.buildSessionDrafts(1) }, 'ana@unesum.edu.ec');
  await svc.createCourse(run, P.coursePayload(plan));
  await assert.rejects(svc.completeTemplate(run));
  assert.equal(run.phase, 'partial');
  await svc.completeTemplate(run);
  assert.equal(materials.length, 3);
  assert.equal(server.courses.length, 1);
  assert.equal(server.topics.length, 8);
  assert.deepEqual(svc.pendingSessions(run), []);
  assert.ok(materials.every((m) => m.state === 'DRAFT' && m.topicId === run.topicIds[plan.topics[0].name]));
  assert.ok(materials.some((m) => m.title === 'Sesión 1 — Encuadre de la asignatura — Material'));
  assert.ok(!materials.some((m) => m.title === 'Sesión 1 — Encuadre de la asignatura — Tarea'));
  await svc.completeTemplate(run);
  assert.equal(materials.length, 3);
});


test('plantilla completa: sesiones y materiales fijos en borrador con recuperación', async () => {
  const server = fakeServer();
  const items = [];
  let loseTask = true;
  const fetch = async (url, opts) => {
    const route = new URL(url).pathname;
    if (!route.includes('/courseWork')) return server.fetch(url, opts);
    const task = route.endsWith('/courseWork');
    const respond = (data) => ({ ok: true, status: 200, json: async () => data });
    if (opts.method === 'GET') return respond({ [task ? 'courseWork' : 'courseWorkMaterial']: items.filter((i) => Boolean(i.workType) === task) });
    const body = JSON.parse(opts.body);
    assert.equal(body.state, 'DRAFT');
    assert.ok(!('unitIndex' in body) && !('kind' in body));
    assert.ok(!('dueDate' in body) && !('maxPoints' in body));
    assert.ok(!('description' in body), 'los borradores solo llevan título');
    if (task) assert.equal(body.workType, 'ASSIGNMENT');
    items.push({ ...body, id: String(items.length + 1) });
    if (task && loseTask) { loseTask = false; throw new Error('Respuesta de tarea perdida'); }
    return respond(items.at(-1));
  };
  const fullPlan = P.validate({ asignatura: 'Curso', nivel: 'Primero', paralelo: 'A', jornada: 'Presencial' }).plan;
  const svc = C.createService({ fetch, getToken: () => 'tok', sleep: async () => {}, pauseBetweenTopics: 0 });
  const run = svc.newRun(fullPlan, 'a@b.ec');
  await svc.createCourse(run, P.coursePayload(fullPlan));
  await assert.rejects(svc.completeTemplate(run));
  await svc.completeTemplate(run);
  assert.equal(items.length, 34);
  assert.equal(items.filter((i) => !i.workType).length, 31);
  assert.equal(items.filter((i) => i.workType === 'ASSIGNMENT').length, 3);
  for (let unit = 0; unit < 2; unit++) {
    const topicId = run.topicIds[fullPlan.topics[unit].name];
    assert.equal(items.filter((i) => i.topicId === topicId).length, unit === 0 ? 3 : 4);
  }
  assert.equal(server.courses.length, 1);
  assert.equal(server.topics.length, 9);
  for (const topic of fullPlan.topics.filter((t) => t.groups.length)) {
    assert.equal(items.filter((i) => i.topicId === run.topicIds[topic.name]).length,
      topic.groups.reduce((n, g) => n + g.items.length, 0));
  }
  await svc.completeTemplate(run);
  assert.equal(items.length, 34);
  assert.equal(svc.pendingSessions(run).length, 0);
});
