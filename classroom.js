// Cliente mínimo de Classroom API y flujo de creación con recuperación de fallos.
// No toca el DOM; recibe fetch, token y espera por inyección para poder probarse.
(function (root) {
  'use strict';

  const BASE = 'https://classroom.googleapis.com/v1';

  // Orden en que se envían los temas. Classroom muestra arriba los temas más
  // recientes según lo observado, por lo que se envían en orden inverso para
  // que el orden visible coincida con la guía. PENDIENTE de verificar en un
  // aula de prueba autorizada; si resulta al revés, cambiar a 'forward'.
  const DEFAULT_TOPIC_ORDER = 'reverse';

  class ApiError extends Error {
    constructor(status, message, details) {
      super(message);
      this.name = 'ApiError';
      this.status = status; // 0 = sin respuesta (red, CORS, cancelado)
      this.details = details || null;
      this.kind = classify(status);
    }
  }

  function classify(status) {
    if (status === 0) return 'network';
    if (status === 401) return 'auth';
    if (status === 403) return 'permission';
    if (status === 429) return 'rate';
    if (status >= 500) return 'server';
    return 'client';
  }

  // Errores en los que la solicitud pudo llegar (o no) al servidor y
  // conviene reintentar con cautela.
  function isTransient(err) {
    return err instanceof ApiError && (err.kind === 'network' || err.kind === 'rate' || err.kind === 'server');
  }

  function sameName(a, b) {
    const n = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    return n(a) === n(b); // Classroom distingue mayúsculas en nombres de tema
  }

  function createService(opts) {
    const fetchImpl = opts.fetch;
    const getToken = opts.getToken;
    const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const topicOrder = opts.topicOrder || DEFAULT_TOPIC_ORDER;
    const maxRetries = opts.maxRetries == null ? 3 : opts.maxRetries;
    const baseDelay = opts.baseDelay == null ? 800 : opts.baseDelay;
    const pause = opts.pauseBetweenTopics == null ? 250 : opts.pauseBetweenTopics;

    async function request(method, path, body) {
      const token = getToken();
      if (!token) throw new ApiError(401, 'No hay una sesión activa.');
      let res;
      try {
        res = await fetchImpl(BASE + path, {
          method,
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        throw new ApiError(0, 'Sin respuesta del servidor: ' + ((e && e.message) || 'error de red'));
      }
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok) {
        const err = data && data.error;
        throw new ApiError(res.status, (err && err.message) || res.statusText || ('HTTP ' + res.status), err);
      }
      return data || {};
    }

    // GET idempotente: se puede reintentar ante fallos transitorios.
    async function withRetry(fn) {
      for (let attempt = 0; ; attempt++) {
        try { return await fn(); } catch (e) {
          if (!isTransient(e) || attempt >= maxRetries) throw e;
          await sleep(baseDelay * 2 ** attempt);
        }
      }
    }

    async function listTopics(courseId) {
      const all = [];
      let pageToken = '';
      do {
        const q = '?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
        const data = await withRetry(() => request('GET', '/courses/' + encodeURIComponent(courseId) + '/topics' + q));
        for (const t of data.topic || []) all.push(t);
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return all;
    }

    // Estado explícito del proceso. Se conserva en memoria para reintentos.
    function newRun(plan, email) {
      return {
        email,
        plan,
        phase: 'idle', // idle | creating-course | creating-topics | done | partial | uncertain
        courseInFlight: false,
        courseUncertain: false,
        course: null, // { id, name, section, link, enrollmentCode }
        sessionIds: {},
        topicIds: {}, // nombre del tema -> topicId confirmado
        lastError: null,
      };
    }

    function pendingTopics(run) {
      return run.plan.topics.map((t) => t.name).filter((n) => !run.topicIds[n]);
    }

    // POST del curso: una única vez por run, nunca se reintenta automáticamente.
    async function createCourse(run, payload) {
      if (run.course) throw new Error('El curso ya fue creado en este proceso.');
      if (run.courseInFlight) throw new Error('La creación del curso ya está en curso.');
      if (run.courseUncertain) throw new Error('Resultado incierto: comprueba Classroom antes de crear otra aula.');
      run.courseInFlight = true;
      run.phase = 'creating-course';
      try {
        const c = await request('POST', '/courses', payload);
        if (!c.id) {
          run.courseUncertain = true;
          throw new ApiError(0, 'La respuesta no incluye el identificador del curso.');
        }
        run.course = {
          id: c.id,
          name: c.name,
          section: c.section,
          link: c.alternateLink || null,
          enrollmentCode: c.enrollmentCode || null,
        };
        return run.course;
      } catch (e) {
        // Sin respuesta o error del servidor: el curso pudo haberse creado.
        if (e instanceof ApiError && (e.kind === 'network' || e.kind === 'server')) run.courseUncertain = true;
        run.phase = run.courseUncertain ? 'uncertain' : 'idle';
        run.lastError = e;
        throw e;
      } finally {
        run.courseInFlight = false;
      }
    }

    // Crea los temas que falten en run.course, reconciliando primero con los
    // existentes. onProgress(hechos, total) se llama tras cada tema confirmado.
    async function completeTopics(run, onProgress) {
      if (!run.course) throw new Error('No hay curso sobre el que crear temas.');
      const courseId = run.course.id;
      const expected = run.plan.topics.map((t) => t.name);
      const total = expected.length;
      const done = () => expected.filter((n) => run.topicIds[n]).length;
      const report = () => { if (onProgress) onProgress(done(), total); };

      run.phase = 'creating-topics';
      run.lastError = null;
      try {
        const reconcile = async () => {
          const existing = await listTopics(courseId);
          for (const name of expected) {
            if (run.topicIds[name]) continue;
            const hit = existing.find((t) => sameName(t.name, name));
            if (hit) run.topicIds[name] = hit.topicId;
          }
        };
        await reconcile();
        report();

        const order = topicOrder === 'reverse' ? expected.slice().reverse() : expected.slice();
        let first = true;
        for (const name of order) {
          if (run.topicIds[name]) continue;
          if (!first && pause) await sleep(pause);
          first = false;
          for (let attempt = 0; ; attempt++) {
            try {
              const t = await request('POST', '/courses/' + encodeURIComponent(courseId) + '/topics', { name });
              run.topicIds[name] = t.topicId || true;
              break;
            } catch (e) {
              if (!isTransient(e) || attempt >= maxRetries) throw e;
              await sleep(baseDelay * 2 ** attempt);
              // La solicitud pudo llegar aunque se perdiera la respuesta.
              await reconcile();
              if (run.topicIds[name]) break;
            }
          }
          report();
        }
        run.phase = 'done';
      } catch (e) {
        run.phase = 'partial';
        run.lastError = e;
        throw e;
      }
      return run;
    }

    function pendingSessions(run) {
      return (run.plan.sessions || []).filter((s) => !run.sessionIds[s.title]);
    }

    async function completeTemplate(run, onProgress, onSessionProgress) {
      await completeTopics(run, onProgress);
      const sessions = run.plan.sessions || [];
      if (!sessions.length) return run;
      const coursePath = '/courses/' + encodeURIComponent(run.course.id);
      const topicFor = (session) => {
        const topic = session.topicKey
          ? run.plan.topics.find((t) => t.key === session.topicKey)
          : run.plan.topics[session.unitIndex || 0];
        if (!topic || !run.topicIds[topic.name]) throw new Error('No se encontró el tema del borrador: ' + session.title);
        return run.topicIds[topic.name];
      };
      const endpoint = (kind) => kind === 'task' ? '/courseWork' : '/courseWorkMaterials';
      async function reconcileSessions() {
        for (const kind of ['material', 'task']) {
          if (!sessions.some((s) => (s.kind || 'material') === kind)) continue;
          let pageToken = '';
          do {
            const stateParam = kind === 'task' ? 'courseWorkStates' : 'courseWorkMaterialStates';
            const q = '?pageSize=100&' + stateParam + '=DRAFT&' + stateParam + '=PUBLISHED' +
              (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
            const data = await withRetry(() => request('GET', coursePath + endpoint(kind) + q));
            for (const item of data[kind === 'task' ? 'courseWork' : 'courseWorkMaterial'] || []) {
              if (sessions.some((s) => (s.kind || 'material') === kind && s.title === item.title && topicFor(s) === item.topicId)) {
                run.sessionIds[item.title] = item.id;
              }
            }
            pageToken = data.nextPageToken || '';
          } while (pageToken);
        }
      }
      run.phase = 'creating-sessions';
      try {
        await reconcileSessions();
        for (const session of sessions.slice().reverse()) {
          if (run.sessionIds[session.title]) continue;
          if (onSessionProgress) onSessionProgress(sessions.length - pendingSessions(run).length, sessions.length);
          // Ante una respuesta perdida se detiene; al reanudar se reconcilia
          // antes de volver a escribir, sin duplicar los borradores confirmados.
          const payload = { title: session.title, topicId: topicFor(session), state: 'DRAFT' };
          if (session.kind === 'task') payload.workType = 'ASSIGNMENT';
          if (pause) await sleep(pause);
          const material = await request('POST', coursePath + endpoint(session.kind), payload);
          if (!material.id) throw new ApiError(0, 'No se recibió el identificador de la sesión. Reanuda para comprobar si se creó.');
          run.sessionIds[session.title] = material.id;
        }
        run.phase = 'done';
        return run;
      } catch (error) {
        run.phase = 'partial';
        run.lastError = error;
        throw error;
      }
    }

    return { request, listTopics, newRun, createCourse, completeTopics, pendingTopics, completeTemplate, pendingSessions };
  }

  // Acepta solo enlaces https de Classroom.
  function safeClassroomUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && u.hostname === 'classroom.google.com') return u.href;
    } catch (_) { /* inválida */ }
    return null;
  }

  const api = { ApiError, classify, isTransient, createService, safeClassroomUrl, DEFAULT_TOPIC_ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Classroom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
