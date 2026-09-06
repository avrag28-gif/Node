import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NODE_PORT = 3000;
const PUBLIC_PORT = 3001;
const AI_PORT = Number(process.env.NODETRADE_AI_PORT || 8010);
const PY = process.env.NODETRADE_PYTHON || join(ROOT, '.venv', 'Scripts', 'python.exe');
const children = [];
function start(cmd, args, name, env = {}) { const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: false }); children.push(p); p.on('exit', (code, signal) => console.log(`[NodeTrade] ${name} exited code=${code} signal=${signal || ''}`)); p.on('error', err => console.error(`[NodeTrade] ${name} spawn error:`, err.message)); return p; }
if (!existsSync(PY)) throw new Error(`Python venv not found: ${PY}`);
// --app-dir makes ai_service/main.py able to import its sibling ensemble.py correctly.
start(PY, ['-m', 'uvicorn', 'main:app', '--app-dir', join(ROOT, 'ai_service'), '--host', '127.0.0.1', '--port', String(AI_PORT)], 'Python AI');
start(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], 'Node server');
function readBody(req) { return new Promise((resolve, reject) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
function request(port, method, path, headers = {}, body = null) { return new Promise((resolve, reject) => { const h = { ...headers, host: `127.0.0.1:${port}`, connection: 'close' }; delete h['content-length']; if (body) h['content-length'] = Buffer.byteLength(body); const r = http.request({ hostname: '127.0.0.1', port, path, method, headers: h }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode || 500, headers: res.headers, body: Buffer.concat(chunks) })); }); r.on('error', reject); if (body) r.write(body); r.end(); }); }
async function ai(path, method, payload) { const body = payload == null ? null : JSON.stringify(payload); const r = await request(AI_PORT, method, path, { 'content-type': 'application/json' }, body); const text = r.body.toString('utf8'); let data; try { data = JSON.parse(text); } catch { data = { error: text }; } return { ...r, data }; }
async function ngrokUrl() { try { const r = await request(4040, 'GET', '/api/tunnels'); const j = JSON.parse(r.body.toString('utf8')); return j.tunnels?.find(t => t.public_url?.startsWith('https://'))?.public_url || j.tunnels?.[0]?.public_url || null; } catch { return null; } }

async function handle(req, res) {
  const body = await readBody(req);

  if (req.url === '/api/market/train' && req.method === 'POST') {
    let payload = {}; try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch {}
    const requestResult = await ai('/training/request', 'POST', { symbol: 'XAUUSD', timeframe: payload.timeframe || '15m', startDate: payload.startDate || null, endDate: payload.endDate || null });
    if (requestResult.status >= 400) return sendJson(res, requestResult.status, requestResult.data);
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const q = await ai('/training/request', 'GET', null);
      if (!q.data?.pending) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const started = await ai('/train', 'POST', { symbol: 'XAUUSD', timeframe: payload.timeframe || '15m', startDate: payload.startDate || null, endDate: payload.endDate || null, epochs: Math.max(1, Math.min(100, Number(payload.epochs) || 20)), horizon: 10 });
    if (started.status >= 400) return sendJson(res, started.status, started.data);
    const trainDeadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < trainDeadline) {
      const s = await ai('/training/status', 'GET', null);
      if (!s.data?.isTraining) {
        const summary = s.data?.summary || null;
        if (s.data?.status === 'error') return sendJson(res, 500, { error: s.data.error || 'AI training failed' });
        return sendJson(res, 200, { trainingSummary: summary, status: 'completed', source: 'MT5 → CSV → Python Ensemble' });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return sendJson(res, 504, { error: 'Training timeout' });
  }

  if (req.url === '/api/market/training-status' && req.method === 'GET') {
    const s = await ai('/training/status', 'GET', null); const d = s.data || {};
    return sendJson(res, s.status, { isTraining: !!d.isTraining, currentEpoch: d.currentEpoch || 0, totalEpochs: d.totalEpochs || 0, currentLoss: d.currentLoss ?? null, currentAccuracy: d.currentAccuracy ?? null, status: d.status || 'idle', hasTrainedModel: !!d.summary, summary: d.summary || null, error: d.error || undefined });
  }

  if (req.url === '/v1/analyze' && req.method === 'POST') {
    const node = await request(NODE_PORT, req.method, req.url, req.headers, body); let original;
    try { original = JSON.parse(node.body.toString('utf8')); } catch { original = null; }
    if (node.status < 200 || node.status >= 300 || !original) return sendRaw(res, node);
    let payload; try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch { payload = {}; }
    if (Array.isArray(payload.candles) && payload.candles.length) {
      await ai('/ingest', 'POST', { symbol: payload.symbol || 'XAUUSD', timeframe: payload.timeframe || '15m', candles: payload.candles });
      const pred = await ai('/predict', 'POST', { symbol: payload.symbol || 'XAUUSD', timeframe: payload.timeframe || '15m', candles: payload.candles });
      if (pred.status < 400 && pred.data?.model_ready) return sendJson(res, 200, { ...original, ...pred.data, server_signal_source: 'python_ensemble' });
    }
    return sendRaw(res, node);
  }

  if (req.url === '/api/market/analyze' && req.method === 'POST') {
    const node = await request(NODE_PORT, req.method, req.url, req.headers, body); let data;
    try { data = JSON.parse(node.body.toString('utf8')); } catch { return sendRaw(res, node); }
    if (Array.isArray(data.candles) && data.candles.length) { const pred = await ai('/predict', 'POST', { symbol: 'XAUUSD', timeframe: '15m', candles: data.candles }); if (pred.status < 400 && pred.data?.model_ready) data.signal = { ...data.signal, ...pred.data }; }
    return sendJson(res, node.status, data);
  }

  if (req.url === '/api/status' && req.method === 'GET') {
    const node = await request(NODE_PORT, req.method, req.url, req.headers, body); let data;
    try { data = JSON.parse(node.body.toString('utf8')); } catch { return sendRaw(res, node); }
    const url = await ngrokUrl(); if (url) { data.publicUrl = url; data.customDomain = url; }
    return sendJson(res, node.status, data);
  }

  const node = await request(NODE_PORT, req.method, req.url, req.headers, body); return sendRaw(res, node);
}
function sendRaw(res, r) { for (const [k, v] of Object.entries(r.headers)) if (v !== undefined && k !== 'content-length' && k !== 'transfer-encoding') res.setHeader(k, v); res.statusCode = r.status; res.end(r.body); }
function sendJson(res, status, data) { const b = Buffer.from(JSON.stringify(data)); res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('content-length', b.length); res.end(b); }
const server = http.createServer((req, res) => { handle(req, res).catch(err => { console.error('[NodeTrade proxy]', err); sendJson(res, 502, { error: err?.message || 'proxy error' }); }); });
server.listen(PUBLIC_PORT, '0.0.0.0', () => console.log(`[NodeTrade] Public gateway listening on http://0.0.0.0:${PUBLIC_PORT}`));
function shutdown() { for (const p of children) p.kill(); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
