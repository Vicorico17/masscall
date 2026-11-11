import {callStatusLabels} from './call-flow.js';
const terminal = new Set(['completed', 'canceled', 'busy', 'failed', 'no-answer', 'rejected']);
const phonePattern = /^\+[1-9]\d{7,14}$/;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizePhone = value => String(value || '').replace(/[\s()-]/g, '');

export function parallelCallRequests(setup, numbers, people = []) {
  const destinations = numbers.map(normalizePhone);
  if (destinations.length !== 2 || destinations.some(number => !phonePattern.test(number))) throw new Error('Introdu două numere valide cu prefix internațional.');
  if (destinations[0] === destinations[1]) throw new Error('Folosește două numere de telefon diferite.');
  if (!phonePattern.test(setup.from || '') || !setup.objective?.trim()) throw new Error('Alege numărul Twilio și obiectivul în meniul CALL înainte de test.');
  return destinations.map(to => {
    const person = people.find(item => normalizePhone(item.phone) === to);
    return {
      ...structuredClone(setup), to, contact: person?.name || '', consent: true, recordingConsent: true,
      // Never copy the person selected for a different single call into both calls.
      callPlan: {...structuredClone(setup.callPlan), category: person?.category || '', company: person?.company || '', role: person?.role || '', personNotes: person?.notes || ''}
    };
  });
}

export function parallelCallsMarkup() {
  return `<section class="card padded" id="parallel-calls" hidden>
    <span class="eyebrow">TEST REAL</span><h2 class="form-title">Test două apeluri</h2>
    <p>Apelează două persoane cu același agent și plan. Fiecare persoană are o conversație separată.</p>
    <p class="hint">Folosește configurația din CALL și MAX SETTINGS. Datele din Persoane se aleg separat pentru fiecare număr.</p>
    <div id="parallel-setup" class="call-agent-summary"></div>
    <button class="btn" type="button" data-panel="call">Modifică setările apelului</button>
    <form id="parallel-call-form">
      <div class="form-grid">
        <div class="field"><label for="parallel-first">Primul număr de telefon</label><input id="parallel-first" name="first" type="tel" required maxlength="24" placeholder="+407xxxxxxxx" autocomplete="off"></div>
        <div class="field"><label for="parallel-second">Al doilea număr de telefon</label><input id="parallel-second" name="second" type="tel" required maxlength="24" placeholder="+407xxxxxxxx" autocomplete="off"></div>
      </div>
      <label class="check-label"><input type="checkbox" name="permission" required>Am acordul pentru a apela și înregistra ambele persoane.</label>
      <p class="hint">Două apeluri reale, înregistrate, cu costuri de la furnizori. Fiecare apel durează cel mult 5 minute. Cererile pornesc împreună; telefoanele pot suna la momente ușor diferite.</p>
      <button class="btn primary" type="submit">Pornește ambele apeluri</button>
      <p id="parallel-error" class="inline-note" role="alert"></p>
    </form>
    <p id="parallel-overlap" role="status" aria-live="polite"></p>
    <div id="parallel-results" class="parallel-results" aria-live="polite"></div>
    <p class="hint">Ține pagina deschisă pentru a urmări testul. Închiderea paginii nu oprește apelurile. Înregistrările apar în Istoric după procesare.</p>
  </section>`;
}

// In-memory state survives dashboard panel refreshes; no credentials are persisted.
const run = { rows: [], observedOverlap: false, first: '', second: '' };
let disposePrevious = () => {};
export function stopParallelPolling() { disposePrevious(); }

export function bindParallelCalls({ provider, getSetup, getPeople, onCreated }) {
  disposePrevious();
  const root = document.querySelector('#parallel-calls');
  const form = root.querySelector('form');
  let disposed = false, timer, polling = false;
  disposePrevious = () => { disposed = true; clearTimeout(timer); };
  form.elements.first.value = run.first; form.elements.second.value = run.second;
  const busy = () => run.rows.some(row => !terminal.has(row.status));
  const render = () => {
    if (disposed || !root.isConnected) return;
    try { const setup = getSetup(); root.querySelector('#parallel-setup').textContent = [setup.from || 'Alege un număr', setup.agent.name, 'Română', setup.objective].filter(Boolean).join(' · '); } catch (error) { root.querySelector('#parallel-setup').textContent = error.message; }
    form.querySelector('button[type="submit"]').disabled = busy();
    for (const input of form.querySelectorAll('input')) input.disabled = busy();
    root.querySelector('#parallel-overlap').textContent = run.observedOverlap ? 'Ambele apeluri au fost observate în desfășurare simultan.' : run.rows.length ? 'Așteptăm ca ambele apeluri să fie conectate simultan.' : '';
    root.querySelector('#parallel-results').innerHTML = run.rows.map((row, index) => `<article class="parallel-call-result">
      <strong>${escape(row.to)}</strong><span class="tag">${escape(callStatusLabels[row.status] || {starting:"Se inițiază",unknown:"Necunoscut",rejected:"Respins"}[row.status] || "Verificăm starea")}</span>
      <p>${row.duration != null ? `${escape(row.duration)}s` : ''}</p>
      ${row.error ? `<p class="inline-note">${escape(row.error)}</p>` : ''}
      ${row.sid ? `<small>${escape(row.sid)}</small>` : ''}
      ${row.sid && !terminal.has(row.status) ? `<button class="btn danger" type="button" data-stop-parallel="${index}" ${row.stopping?'disabled':''}>Încheie apelul</button>` : ''}
    </article>`).join('');
    if (run.rows.length && !busy() && !run.observedOverlap) root.querySelector('#parallel-overlap').textContent = 'Test încheiat. Nu au fost observate apeluri conectate simultan.';
  };
  const poll = async () => {
    if (disposed || polling || !root.isConnected) return;
    polling = true;
    const rows = run.rows.filter(row => row.sid && !terminal.has(row.status));
    const observed = await Promise.all(rows.map(async row => {
      const revision = row.revision;
      try {
        const call = await provider('call-status&call=' + encodeURIComponent(row.sid));
        if (!row.stopping && row.revision === revision) { row.status = call.status; row.duration = call.duration; row.error = ''; }
        return call.status;
      } catch { row.error = 'Stare indisponibilă. Verifică Istoric înainte de alt test.'; return null; }
    }));
    if (observed.length === 2 && observed.every(status => status === 'in-progress')) run.observedOverlap = true;
    polling = false; render();
    if (!disposed && run.rows.some(row => row.status === 'starting' || row.sid && !terminal.has(row.status))) timer = setTimeout(poll, 3000);
  };
  form.addEventListener('input', () => { run.first = form.elements.first.value; run.second = form.elements.second.value; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy() || !form.reportValidity()) return;
    const error = root.querySelector('#parallel-error'); error.textContent = '';
    let requests;
    try { requests = parallelCallRequests(getSetup(), [form.elements.first.value, form.elements.second.value], getPeople()); }
    catch (problem) { error.textContent = problem.message; return; }
    clearTimeout(timer); run.observedOverlap = false;
    run.rows = requests.map(request => ({to: request.to, status: 'starting', sid: ''}));
    render();
    // Start both requests before awaiting either. Never automatically retry a dial.
    await Promise.all(requests.map(async (request, index) => {
      const row = run.rows[index];
      try {
        const result = await provider('call', request);
        if (!/^CA[0-9a-f]{32}$/i.test(result.sid || '')) throw new Error('Lipsește identificatorul apelului');
        row.sid = result.sid; row.status = result.status || 'queued';
        onCreated(result, request);
      } catch (problem) {
        // A timeout/5xx can occur after Twilio accepts a call. Do not offer an unsafe retry.
        row.status = problem.status >= 400 && problem.status < 500 ? 'rejected' : 'unknown';
        row.error = row.status === 'unknown' ? 'Rezultat necunoscut. Verifică Istoric înainte de alt test; telefonul poate suna deja.' : problem.message;
      }
      render();
      if (!polling) { clearTimeout(timer); void poll(); }
    }));
    render();
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-stop-parallel]'); if (!button) return;
    const row = run.rows[Number(button.dataset.stopParallel)];
    if (!row?.sid || row.stopping) return;
    row.stopping = true; row.revision = (row.revision || 0) + 1; render();
    try { const call = await provider('hangup', {call: row.sid}); row.status = call.status; row.duration = call.duration; row.error = ''; }
    catch (error) { row.error = error.message; }
    finally { row.stopping = false; render(); }
  });
  document.querySelector('#real-call').addEventListener('input', render);
  document.querySelector('#real-call').addEventListener('change', render);
  render(); void poll();
}
