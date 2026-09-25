const form = document.querySelector('#commandForm');
const input = document.querySelector('#commandInput');
const list = document.querySelector('#activityList');
const statusText = document.querySelector('#statusText');
const commandView = document.querySelector('#commandView');
const ideasView = document.querySelector('#ideasView');
const pageEyebrow = document.querySelector('#pageEyebrow');
const pageTitle = document.querySelector('#pageTitle');

document.querySelectorAll('[data-view]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const ideas = link.dataset.view === 'ideas';
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === link));
  commandView.hidden = ideas;
  ideasView.hidden = !ideas;
  pageEyebrow.textContent = ideas ? 'STARTUP IDEAS' : 'COMMAND CENTER';
  pageTitle.textContent = ideas ? 'Build something people need.' : 'Make it happen.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.command; input.focus(); }));
input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') form.requestSubmit(); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const command = input.value.trim();
  if (!command) return input.focus();
  const run = form.querySelector('.run-btn'); run.disabled = true; run.innerHTML = '<span>Thinking...</span><span class="spinner">◌</span>';
  try {
    const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
    const action = await response.json();
    addActivity(action); input.value = ''; statusText.textContent = action.source === 'gpt-live-1' ? 'GPT-LIVE-1 active' : 'Demo mode';
  } catch { statusText.textContent = 'Offline'; }
  run.disabled = false; run.innerHTML = '<span>Run command</span><span class="arrow">↗</span>';
});

function addActivity(action) {
  const item = document.createElement('div'); item.className = 'activity-item fresh';
  item.innerHTML = `<span class="app-icon ${action.color || 'teal'}">${action.icon === 'mail' ? '✉' : action.icon === 'hash' ? '#' : action.icon === 'notion' ? 'N' : action.icon === 'calendar' ? '◫' : '✦'}</span><div class="activity-copy"><strong>${escapeHtml(action.title || 'Command ready')}</strong><span>${escapeHtml(action.app || 'Workspace')} · Just now · ${escapeHtml(action.detail || action.command || '')}</span></div><span class="success">Ready</span><span class="activity-arrow">↗</span>`;
  list.prepend(item); setTimeout(() => item.classList.remove('fresh'), 700);
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

fetch('/api/health').then(r => r.json()).then(data => { if (data.live) statusText.textContent = 'GPT-LIVE-1 active'; }).catch(() => { statusText.textContent = 'Offline'; });
