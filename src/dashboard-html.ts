// Self-contained single-page dashboard. No external assets, no build step.
// Vanilla HTML + CSS + JS, talking to the JSON API on the same origin.

export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>procm-mcp dashboard</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --panel-2: #1f232c;
    --border: #2a2f3a;
    --text: #e6e8eb;
    --muted: #8a93a3;
    --accent: #4f9dff;
    --ok: #3fb950;
    --warn: #d29922;
    --err: #f85149;
    --spawning: #d29922;
    --running: #3fb950;
    --exited: #8a93a3;
    --error: #f85149;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 13px; }
  main { padding: 20px; max-width: 1200px; margin: 0 auto; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .card h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 8px 0 4px; }
  input, select, textarea {
    width: 100%;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 7px 9px;
    font-size: 13px;
    font-family: inherit;
  }
  textarea { resize: vertical; min-height: 56px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  button {
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 13px;
    font-family: inherit;
  }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #07121f; font-weight: 600; }
  button.danger { border-color: var(--err); color: var(--err); }
  button.danger:hover { background: var(--err); color: #1a0707; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .empty { color: var(--muted); padding: 18px; text-align: center; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    color: var(--bg);
  }
  .badge.running { background: var(--running); }
  .badge.spawning { background: var(--spawning); }
  .badge.exited { background: var(--exited); color: var(--text); }
  .badge.error { background: var(--error); }
  .row-actions button { padding: 4px 9px; font-size: 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  /* log drawer */
  .drawer-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 20;
  }
  .drawer-backdrop.open { display: block; }
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: min(720px, 92vw);
    background: var(--panel);
    border-left: 1px solid var(--border);
    z-index: 21;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    display: flex; flex-direction: column;
  }
  .drawer.open { transform: translateX(0); }
  .drawer header { background: var(--panel-2); border-bottom: 1px solid var(--border); }
  .drawer-body { padding: 14px 18px; overflow: auto; flex: 1; }
  .log-streams { display: flex; gap: 8px; margin-bottom: 12px; }
  pre.log {
    background: #0b0d12;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    overflow: auto;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: calc(100vh - 200px);
  }
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--border);
    padding: 10px 16px; border-radius: 8px; font-size: 13px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4); z-index: 30;
    opacity: 0; transition: opacity 0.2s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .toast.err { border-color: var(--err); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>procm-mcp</h1>
    <div class="meta" id="server-meta">loading…</div>
  </div>
  <div>
    <button id="refresh-btn">Refresh</button>
    <label style="display:inline-flex; align-items:center; gap:6px; margin:0 0 0 10px;">
      <input type="checkbox" id="auto-refresh" /> auto (3s)
    </label>
  </div>
</header>

<main>
  <div class="card">
    <h2>Start a process</h2>
    <div class="grid">
      <div>
        <label for="f-name">Name (optional)</label>
        <input id="f-name" placeholder="my-server" />
      </div>
      <div>
        <label for="f-script">Script *</label>
        <input id="f-script" placeholder="npm" />
      </div>
      <div>
        <label for="f-args">Args (space-separated)</label>
        <input id="f-args" placeholder="run dev" />
      </div>
      <div>
        <label for="f-cwd">Working directory *</label>
        <input id="f-cwd" placeholder="/path/to/project" />
      </div>
    </div>
    <label for="f-envs">Environment variables (KEY=VALUE per line)</label>
    <textarea id="f-envs" placeholder="NODE_ENV=development&#10;PORT=3000"></textarea>
    <div class="actions">
      <button class="primary" id="start-btn">Start process</button>
    </div>
    <div class="hint">Note: the dashboard is a human-driven localhost UI. Starting a process here bypasses the allow-x gate, equivalent to running the command yourself in a terminal.</div>
  </div>

  <div class="card">
    <h2>Processes <span id="count" class="hint"></span></h2>
    <div id="table-wrap">
      <div class="empty">No processes.</div>
    </div>
  </div>
</main>

<div class="drawer-backdrop" id="drawer-backdrop"></div>
<div class="drawer" id="drawer">
  <header>
    <div>
      <h2 id="drawer-title" style="margin:0">Logs</h2>
      <div class="meta" id="drawer-sub" class="mono"></div>
    </div>
    <div class="log-streams">
      <button data-stream="stdout" class="primary">stdout</button>
      <button data-stream="stderr">stderr</button>
      <label style="margin:0 0 0 6px;">count <input id="log-count" type="number" value="200" style="width:80px; display:inline;" /></label>
      <button id="drawer-close">Close</button>
    </div>
  </header>
  <div class="drawer-body">
    <pre class="log" id="log-output">Select a stream above.</pre>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let autoTimer = null;
  let currentLogId = null;

  const $ = (id) => document.getElementById(id);

  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, 2600);
  }

  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function parseEnvs(text) {
    const envs = {};
    for (const line of text.split('\\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      envs[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return envs;
  }

  $('start-btn').addEventListener('click', async () => {
    const script = $('f-script').value.trim();
    const cwd = $('f-cwd').value.trim();
    if (!script || !cwd) { toast('script and working directory are required', true); return; }
    const argsStr = $('f-args').value.trim();
    const body = {
      name: $('f-name').value.trim() || undefined,
      script,
      args: argsStr ? argsStr.split(/\\s+/) : [],
      cwd,
      envs: parseEnvs($('f-envs').value),
    };
    try {
      const r = await api('POST', '/api/processes', body);
      toast('Started: ' + r.id);
      $('f-script').value = ''; $('f-args').value = '';
      refresh();
    } catch (e) { toast(e.message, true); }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function refresh() {
    try {
      const data = await api('GET', '/api/processes');
      $('server-meta').textContent = 'server ' + data.serverId + (data.pid ? ' (pid ' + data.pid + ')' : '') + ' · ' + new Date().toLocaleTimeString();
      const procs = data.processes || [];
      $('count').textContent = procs.length ? '(' + procs.length + ')' : '';
      const wrap = $('table-wrap');
      if (procs.length === 0) {
        wrap.innerHTML = '<div class="empty">No processes.</div>';
        return;
      }
      let rows = procs.map(p => {
        const cmd = escapeHtml(p.script + (p.args && p.args.length ? ' ' + p.args.join(' ') : ''));
        return '<tr>'
          + '<td class="name">' + escapeHtml(p.name) + '</td>'
          + '<td><code>' + cmd + '</code></td>'
          + '<td class="badge ' + p.status + '">' + p.status + '</td>'
          + '<td>' + (p.pid != null ? p.pid : '—') + '</td>'
          + '<td>' + (p.exitCode != null ? p.exitCode : '—') + '</td>'
          + '<td class="row-actions">'
          +   '<button onclick="window._logs(\\''+p.id+'\\', \\''+escapeHtml(p.name).replace(/'/g,"&#39;")+'\\')">Logs</button>'
          +   '<button onclick="window._restart(\\''+p.id+'\\')">Restart</button>'
          +   '<button class="danger" onclick="window._stop(\\''+p.id+'\\')">Stop</button>'
          + '</td>'
          + '</tr>';
      }).join('');
      wrap.innerHTML = '<table>'
        + '<thead><tr><th>Name</th><th>Command</th><th>Status</th><th>PID</th><th>Exit</th><th>Actions</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>';
    } catch (e) {
      $('server-meta').textContent = 'error: ' + e.message;
    }
  }

  window._stop = async (id) => {
    if (!confirm('Stop and delete process ' + id + '?')) return;
    try { await api('POST', '/api/processes/' + encodeURIComponent(id) + '/stop'); toast('Stopped ' + id); refresh(); }
    catch (e) { toast(e.message, true); }
  };
  window._restart = async (id) => {
    try { await api('POST', '/api/processes/' + encodeURIComponent(id) + '/restart'); toast('Restarted ' + id); refresh(); }
    catch (e) { toast(e.message, true); }
  };
  window._logs = async (id, name) => {
    currentLogId = id;
    $('drawer-title').textContent = 'Logs: ' + name;
    $('drawer-sub').textContent = id;
    $('log-output').textContent = 'Select a stream above.';
    $('drawer').classList.add('open');
    $('drawer-backdrop').classList.add('open');
  };

  document.querySelectorAll('.log-streams button[data-stream]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentLogId) return;
      const stream = btn.getAttribute('data-stream');
      const count = $('log-count').value || 200;
      $('log-output').textContent = 'loading…';
      try {
        const data = await api('GET', '/api/processes/' + encodeURIComponent(currentLogId) + '/logs?stream=' + stream + '&count=' + count);
        $('log-output').textContent = data.text || '(empty)';
      } catch (e) {
        $('log-output').textContent = 'error: ' + e.message;
      }
    });
  });

  $('drawer-close').addEventListener('click', () => {
    $('drawer').classList.remove('open');
    $('drawer-backdrop').classList.remove('open');
  });
  $('drawer-backdrop').addEventListener('click', () => {
    $('drawer').classList.remove('open');
    $('drawer-backdrop').classList.remove('open');
  });
  $('refresh-btn').addEventListener('click', refresh);
  $('auto-refresh').addEventListener('change', (e) => {
    if (e.target.checked) {
      autoTimer = setInterval(refresh, 3000);
      refresh();
    } else if (autoTimer) {
      clearInterval(autoTimer); autoTimer = null;
    }
  });

  refresh();
</script>
</body>
</html>`;
}
