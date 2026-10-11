// 检查实际 Node HTTP 入口、HTTPS 代理语义和数据库重启保存。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = await mkdtemp(join(tmpdir(), 'court-http-'));
const origin = 'https://court.test';
let server;
async function start() {
  server = spawn(process.execPath, ['scripts/web-preview.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, HOST: '127.0.0.1', PORT: '0', PUBLIC_ORIGIN: origin, DATABASE_PATH: join(directory, 'web.sqlite'), TRUST_PROXY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  server.stderr.on('data', chunk => { errors += chunk; });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.kill(); reject(new Error('HTTP 入口启动超时：' + errors)); }, 5000);
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error('HTTP 入口退出：' + code + ' ' + errors)); });
    server.stdout.on('data', chunk => { output += chunk; const found = output.match(/listening on 127\.0\.0\.1:(\d+)/); if (found) { clearTimeout(timer); resolve('http://127.0.0.1:' + found[1]); } });
  });
}
async function stop() { if (server?.exitCode === null) { const closed = once(server, 'exit'); server.kill('SIGTERM'); await closed; } }
try {
  let base = await start();
  const session = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Host: 'spoofed.test' }, body: '{}' });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /; Secure/);
  const headers = { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie.split(';')[0] };
  const created = await fetch(base + '/api/create', { method: 'POST', headers, body: JSON.stringify({ name: '重启保存检查', memberName: '测试成员', gender: 'male' }) });
  assert.equal(created.status, 200);
  const { group } = await created.json();
  const forged = await fetch(base + '/api/session', { method: 'POST', headers: { ...headers, Origin: 'https://spoofed.test', Host: 'spoofed.test' }, body: '{}' });
  assert.equal(forged.status, 403, 'Host 不能改变配置的可信来源');
  const large = await fetch(base + '/api/session', { method: 'POST', headers, body: 'x'.repeat(65000) });
  assert.equal(large.status, 413);
  await stop(); base = await start();
  const saved = await fetch(base + '/api/group?id=' + group.id, { headers });
  assert.equal(saved.status, 200);
  const restored = (await saved.json()).group;
  assert.equal(restored.id, group.id); assert.equal(restored.isAdmin, true);
  console.log('Node HTTP 检查通过：固定 HTTPS 来源、Secure/HttpOnly Cookie、跨站拦截、请求大小限制、数据库和身份重启保存。');
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
