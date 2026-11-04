// Interfaz: formulario, vista previa, autenticación y presentación del resultado.
(function () {
  'use strict';

  // ============ CONFIGURACIÓN ============
  const CLIENT_ID = '817417709733-fjubvuv2lctd0ca3jkrbnubpr7dp54qm.apps.googleusercontent.com';
  const SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');
  const GIS_TIMEOUT_MS = 15000;
  // =======================================

  const P = window.Plantilla;
  const C = window.Classroom;
  const $ = (id) => document.getElementById(id);

  let tokenClient = null;
  let gisReady = false;
  let accessToken = null; // solo en memoria; nunca se persiste
  let userEmail = null;
  let busy = false; // bloquea envíos simultáneos y cambios de cuenta
  let run = null; // estado del proceso actual (ver Classroom.newRun)
  let showErrors = false;

  const service = C.createService({
    fetch: (...a) => window.fetch(...a),
    getToken: () => accessToken,
  });

  // ---------- Utilidades DOM seguras ----------
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  // Todo texto entra como nodo de texto: nunca innerHTML.
  function setStatus(type, ...parts) {
    const s = $('status');
    s.className = 'status show ' + type;
    s.replaceChildren(...parts.flat().filter((p) => p != null).map((p) => (p instanceof Node ? p : document.createTextNode(String(p)))));
  }

  function clearStatus() {
    $('status').className = 'status';
    $('status').replaceChildren();
  }

  function errorDetail(err) {
    if (err instanceof C.ApiError) {
      const code = err.status ? 'HTTP ' + err.status : 'sin respuesta';
      const reason = err.details && err.details.status ? ' ' + err.details.status : '';
      return ' (' + code + reason + ': ' + String(err.message).replace(/\.+$/, '') + ')';
    }
    return err && err.message ? ' (' + String(err.message).replace(/\.+$/, '') + ')' : '';
  }

  // ---------- Autenticación ----------
  window.onGisLoad = function () {
    gisReady = true;
    const b = $('signinButton');
    b.disabled = false;
    b.textContent = 'Iniciar sesión con Google';
    if ($('status').classList.contains('gis')) clearStatus();
  };

  window.onGisError = function () {
    $('signinButton').textContent = 'Google no disponible';
    setStatus('error gis', 'No se pudo cargar el servicio de inicio de sesión de Google. Revisa tu conexión o bloqueadores de contenido y recarga la página.');
  };

  setTimeout(() => {
    if (!gisReady) {
      setStatus('error gis', 'El servicio de inicio de sesión de Google tarda en cargar. Revisa tu conexión o bloqueadores de contenido y recarga la página.');
    }
  }, GIS_TIMEOUT_MS);

  function initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: onToken,
      error_callback: (err) => {
        const type = err && err.type;
        if (type === 'popup_closed') setStatus('error', 'Se cerró la ventana de inicio de sesión antes de terminar.');
        else if (type === 'popup_failed_to_open') setStatus('error', 'El navegador bloqueó la ventana de inicio de sesión. Permite ventanas emergentes para este sitio.');
        else setStatus('error', 'No se pudo iniciar sesión.' + (type ? ' (' + type + ')' : ''));
      },
    });
  }

  async function onToken(response) {
    if (response.error) {
      setStatus('error', 'Error de autenticación: ' + response.error);
      return;
    }
    const token = response.access_token;
    let email;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      email = (await res.json()).email;
    } catch (err) {
      setStatus('error', 'No se pudo obtener el correo de la cuenta' + errorDetail(err) + '.');
      return;
    }
    // Un proceso iniciado solo se continúa con la misma cuenta.
    if (run && run.course && run.email !== email) {
      google.accounts.oauth2.revoke(token, () => {});
      setStatus('error', 'El aula en curso se creó con ' + run.email + '. Inicia sesión con esa cuenta para completar los temas pendientes.');
      return;
    }
    accessToken = token;
    userEmail = email;
    $('userEmail').textContent = email;
    $('signin-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    clearStatus();
    if (run && run.course) {
      // La sesión nueva resuelve el 401 anterior: no debe volver a tratarse.
      if (isAuthError(run.lastError)) run.lastError = null;
      renderResult();
    }
  }

  function isAuthError(err) {
    return err instanceof C.ApiError && err.kind === 'auth';
  }

  // Se llama una sola vez, cuando la API responde 401: descarta el token
  // caducado y conserva el proceso para reanudarlo tras iniciar sesión.
  function onProcessError(err) {
    if (run) run.lastError = err;
    if (isAuthError(err)) accessToken = null;
  }

  function handleSignin() {
    if (!gisReady || !window.google || !google.accounts || !google.accounts.oauth2) {
      setStatus('error', 'El servicio de inicio de sesión de Google aún no está disponible. Espera unos segundos o recarga la página.');
      return;
    }
    if (!tokenClient) initTokenClient();
    tokenClient.requestAccessToken({ prompt: run && run.course ? '' : 'consent' });
  }

  function dropSession() {
    accessToken = null;
    userEmail = null;
    $('signin-view').classList.remove('hidden');
    $('app-view').classList.add('hidden');
  }

  function handleSignout() {
    if (busy) return;
    if (accessToken && window.google) google.accounts.oauth2.revoke(accessToken, () => {});
    run = null; // cerrar sesión descarta el proceso en memoria
    resetForm();
    dropSession();
    clearStatus();
  }

  // ---------- Formulario ----------
  const FIELDS = ['asignatura', 'nivel', 'paralelo', 'jornada'];

  function readForm() {
    const raw = { tutor: $('tutor').checked };
    for (const f of FIELDS) raw[f] = $(f).value;
    return raw;
  }

  function showFieldErrors(errors) {
    const byField = {};
    for (const e of errors) (byField[e.field] = byField[e.field] || []).push(e.message);
    const ids = FIELDS;
    for (const f of ids) {
      const msgs = showErrors ? byField[f] || [] : [];
      const input = $(f);
      const box = $(f + '-error');
      if (input) input.setAttribute('aria-invalid', msgs.length ? 'true' : 'false');
      if (box) box.textContent = msgs.join(' ');
    }
  }

  function renderPreview(plan) {
    $('previewName').textContent = plan.name;
    $('previewSection').textContent = plan.section;
    $('previewTutor').textContent = plan.tutor
      ? 'Docente tutor: incluye «Habilidades blandas» y «Proyecto en aula».'
      : 'Docente no tutor: sin temas de tutoría.';
    $('previewCount').textContent = plan.topics.length + ' temas';
    const ol = $('previewTopics');
    ol.replaceChildren(...plan.topics.map((t) => {
      const body = [];
      for (const session of t.sessions || []) body.push(el('p', { class: 'topic-note' }, session.title + (session === P.SESIONES[0] ? ' — Material en borrador' : ' — Material y tarea en borrador')));
      if (t.note) body.push(el('p', { class: 'topic-note' }, t.note));
      for (const g of t.groups) {
        if (g.title) body.push(el('p', { class: 'topic-group' }, g.title));
        body.push(el('ul', null, g.items.map((it) => el('li', null, it + ' (material en borrador)'))));
      }
      return el('li', null,
        body.length
          ? el('details', null, el('summary', null, t.name), body)
          : el('span', null, t.name));
    }));
  }

  function update() {
    const v = P.validate(readForm());
    renderPreview(v.plan);
    showFieldErrors(v.errors);
    return v;
  }

  function setFormLocked(locked) {
    $('formFields').disabled = locked;
  }

  function resetForm() {
    $('courseForm').reset();
    showErrors = false;
    setFormLocked(false);
    update();
    $('result').classList.add('hidden');
    $('createButton').classList.remove('hidden');
    $('createButton').disabled = false;
  }

  // ---------- Proceso ----------
  function setBusy(value) {
    busy = value;
    $('signoutButton').disabled = value;
    $('createButton').disabled = value;
    $('resumeButton').disabled = value;
    $('newButton').disabled = value;
    $('app-view').setAttribute('aria-busy', value ? 'true' : 'false');
  }

  function onProgress(done, total) {
    setStatus('loading', 'Creando temas: ' + done + ' de ' + total);
    const bar = $('progress');
    bar.max = total;
    bar.value = done;
    bar.classList.remove('hidden');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (busy || (run && (run.course || run.courseUncertain))) return; // nunca un segundo POST de curso
    showErrors = true;
    const v = update();
    if (!v.ok) {
      setStatus('error', 'Revisa los campos marcados antes de crear el aula.');
      const first = $(v.errors[0].field) || $('unit-0');
      if (first) first.focus();
      return;
    }
    setBusy(true); // síncrono, antes de cualquier await: un doble clic no entra aquí dos veces
    setFormLocked(true);
    run = service.newRun(v.plan, userEmail);
    try {
      setStatus('loading', 'Creando el curso…');
      await service.createCourse(run, P.coursePayload(v.plan));
      await service.completeTemplate(run, onProgress, (done, total) => setStatus('loading', 'Creando materiales y tareas: ' + done + ' de ' + total));
    } catch (err) {
      onProcessError(err);
    } finally {
      setBusy(false);
      renderResult();
    }
  }

  async function handleResume() {
    if (busy || !run || !run.course) return;
    if (!accessToken) { handleSignin(); return; }
    setBusy(true);
    try {
      setStatus('loading', 'Comprobando los temas existentes del curso…');
      await service.completeTemplate(run, onProgress, (done, total) => setStatus('loading', 'Creando materiales y tareas: ' + done + ' de ' + total));
    } catch (err) {
      onProcessError(err);
    } finally {
      setBusy(false);
      renderResult();
    }
  }

  function handleNew() {
    if (busy) return;
    run = null;
    resetForm();
    clearStatus();
    $('progress').classList.add('hidden');
    $('asignatura').focus();
  }

  function errorMessage(err, stage) {
    const detail = errorDetail(err);
    if (err instanceof C.ApiError && err.kind === 'auth') {
      return { text: 'La sesión expiró o no es válida' + detail + '. Vuelve a iniciar sesión con la misma cuenta para continuar.', action: 'relogin' };
    }
    if (err instanceof C.ApiError && err.kind === 'permission') {
      return { text: 'Permiso insuficiente o restricción institucional' + detail + '. Tu cuenta o el dominio no permite esta operación; consulta con el administrador de Google Workspace.', action: null };
    }
    if (stage === 'course' && run.courseUncertain) {
      return { text: 'No se sabe si el curso llegó a crearse' + detail + '. Comprueba en Classroom antes de crear otra aula; esta aplicación no repetirá la creación.', action: null };
    }
    return { text: (stage === 'course' ? 'No se pudo crear el curso' : 'No se pudo completar la plantilla') + detail + '.', action: null };
  }

  function renderResult() {
    const err = run && run.lastError;
    $('progress').classList.add('hidden');

    if (!run || !run.course) {
      // Fallo al crear el curso: no hay aula que mostrar.
      if (err) {
        const m = errorMessage(err, 'course');
        const parts = [m.text];
        if (m.action === 'relogin') parts.push(' ', el('button', { type: 'button', class: 'inline-button', onclick: reLogin }, 'Volver a iniciar sesión'));
        setStatus('error', parts);
        if (run && run.courseUncertain) {
          $('createButton').disabled = true;
          $('result').classList.remove('hidden');
          $('resultBody').replaceChildren(el('p', null, 'Cuando hayas comprobado Classroom, pulsa «Nueva aula» para empezar de nuevo.'));
          $('resumeButton').classList.add('hidden');
          $('pendientesBox').classList.add('hidden');
        } else {
          setFormLocked(false);
          run = null;
        }
      }
      return;
    }

    const plan = run.plan;
    const pending = service.pendingTopics(run);
    const pendingSessions = service.pendingSessions(run);
    const complete = pending.length === 0 && pendingSessions.length === 0;
    $('createButton').classList.add('hidden');
    $('result').classList.remove('hidden');
    $('resultTitle').textContent = complete ? 'Aula creada' : 'Aula creada parcialmente';

    const body = [];
    body.push(el('p', null, el('strong', null, 'Nombre: '), run.course.name || plan.name));
    body.push(el('p', null, el('strong', null, 'Sección: '), run.course.section || plan.section));
    const link = C.safeClassroomUrl(run.course.link);
    if (link) body.push(el('p', null, el('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir el aula en Classroom')));
    body.push(el('p', null, el('strong', null, 'Código de acceso: '),
      run.course.enrollmentCode || 'no disponible en la respuesta; consúltalo en Classroom'));
    body.push(el('p', { class: 'topic-summary' }, 'Temas creados: ' + (plan.topics.length - pending.length) + ' de ' + plan.topics.length));
    body.push(el('ol', { class: 'topic-status' }, plan.topics.map((t) => {
      const ok = Boolean(run.topicIds[t.name]);
      return el('li', { class: ok ? 'ok' : 'pending' }, t.name, ' — ', el('span', null, ok ? 'creado' : 'pendiente'));
    })));
    body.push(el('p', null, 'Materiales y tareas en borrador: ' + ((plan.sessions || []).length - pendingSessions.length) + ' de ' + (plan.sessions || []).length));
    $('resultBody').replaceChildren(...body);

    $('resumeButton').classList.toggle('hidden', complete);
    $('pendientesBox').classList.remove('hidden');
    $('pendientesText').textContent = P.pendientesText(plan, { link, enrollmentCode: run.course.enrollmentCode });

    if (complete) {
      setStatus('success', 'Se creó el aula con sus ' + plan.topics.length + ' temas, con los materiales institucionales y las sesiones en borrador. Adjunta los documentos y completa los contenidos antes de publicarlos.');
    } else if (!err) {
      // Sesión recuperada tras un 401: listo para reanudar.
      setStatus('info','Sesión iniciada de nuevo. Faltan ' + pending.length + ' temas y ' + pendingSessions.length + ' materiales o tareas: pulsa «Completar plantilla pendiente» para terminarlos en este mismo curso.');
    } else {
      const m = errorMessage(err, 'topics');
      const parts = [m.text, ' El curso se conserva: usa «Completar plantilla pendiente» para terminarlo sin crear otro.'];
      if (m.action === 'relogin') parts.push(' ', el('button', { type: 'button', class: 'inline-button', onclick: reLogin }, 'Volver a iniciar sesión'));
      setStatus('error', parts);
    }
  }

  function reLogin() {
    accessToken = null;
    handleSignin();
  }

  async function copyPendientes() {
    const text = $('pendientesText').textContent;
    try {
      await navigator.clipboard.writeText(text);
      $('copyFeedback').textContent = 'Lista copiada.';
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents($('pendientesText'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      $('copyFeedback').textContent = 'No se pudo copiar automáticamente: el texto quedó seleccionado; usa Ctrl+C o ⌘+C.';
    }
  }

  // ---------- Inicio ----------
  function init() {
    $('signinButton').addEventListener('click', handleSignin);
    $('signoutButton').addEventListener('click', handleSignout);
    $('courseForm').addEventListener('submit', handleCreate);
    $('paralelo').addEventListener('input', () => {
      const input = $('paralelo');
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.toLocaleUpperCase('es');
      input.setSelectionRange(start, end);
    });
    $('courseForm').addEventListener('input', (e) => { if (!e.target.id.startsWith('unit-')) update(); });
    $('courseForm').addEventListener('change', update);
    $('resumeButton').addEventListener('click', handleResume);
    $('newButton').addEventListener('click', handleNew);
    $('copyButton').addEventListener('click', copyPendientes);
    $('printButton').addEventListener('click', () => window.print());
    for (const f of FIELDS) {
      if ($(f).tagName === 'INPUT') $(f).maxLength = f === 'asignatura' ? P.LIMITS.courseName : P.LIMITS.field;
    }
    $('pendientesInstitucionales').replaceChildren(...P.PENDIENTES_INSTITUCIONALES.map((t) => el('li', null, t)));
    resetForm();
  }

  init();
})();
