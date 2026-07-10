import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;
const model = process.env.GPT_LIVE_MODEL || 'gpt-live-1';

const demoActions = [
  { match: /calendar|meeting|schedule/i, app: 'Calendar', title: 'Schedule team sync', detail: 'Tomorrow at 10:00 · 30 min · Product team', icon: 'calendar', color: 'blue' },
  { match: /email|mail|inbox/i, app: 'Gmail', title: 'Draft follow-up email', detail: 'To the product team · “Next steps from today”', icon: 'mail', color: 'red' },
  { match: /slack|message|channel/i, app: 'Slack', title: 'Send message to #launch', detail: '“The new flow is ready for review.”', icon: 'hash', color: 'purple' },
  { match: /notion|note|document/i, app: 'Notion', title: 'Create project brief', detail: 'Workspace · Product / Launch 2026', icon: 'notion', color: 'dark' },
];

function json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(payload)); }
function body(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } }); }); }
function demoCommand(command) {
  const action = demoActions.find(item => item.match.test(command)) || { app: 'Workspace', title: 'Run workspace command', detail: command, icon: 'sparkles', color: 'teal' };
  const { match, ...cleanAction } = action;
  return { ...cleanAction, command, status: 'ready', source: 'demo' };
}

async function liveCommand(command) {
  const prompt = `You are an action router. Given a user's command, return JSON only with keys app, title, detail, icon, color, status. Pick one app from Calendar, Gmail, Slack, Notion, Workspace. Never execute anything. Command: ${command}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: prompt, text: { format: { type: 'json_object' } } }) });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const data = await response.json();
  return { ...JSON.parse(data.output_text), command, source: 'gpt-live-1' };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/api/health') return json(res, 200, { live: Boolean(process.env.OPENAI_API_KEY), model });
  if (req.url === '/api/command' && req.method === 'POST') {
    let command;
    try { ({ command } = await body(req)); if (!command?.trim()) return json(res, 400, { error: 'Command is required' }); const result = process.env.OPENAI_API_KEY ? await liveCommand(command.trim()) : demoCommand(command.trim()); return json(res, 200, result); }
    catch (error) { return json(res, 502, { ...demoCommand(command?.trim() || 'your command'), error: error.message, source: 'demo-fallback' }); }
  }
  const requested = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(root, 'public', requested);
  if (!file.startsWith(path.join(root, 'public'))) return json(res, 404, { error: 'Not found' });
  fs.readFile(file, (error, content) => { if (error) return json(res, 404, { error: 'Not found' }); const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'; res.writeHead(200, { 'Content-Type': type }); res.end(content); });
});
server.listen(port, () => console.log(`Masscall running at http://localhost:${port}`));
