import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './web-db.mjs';
// 本地预览和服务器共用入口。公网地址固定配置，不信任来访请求的 Host。
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT ?? 4174);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 无效');
const address = new URL(process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`);
if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.pathname !== '/' || address.search || address.hash) throw new Error('PUBLIC_ORIGIN 必须是网站地址，不含路径');
const origin = address.origin;
const trustProxy = process.env.TRUST_PROXY === '1';
if (trustProxy && !['127.0.0.1', '::1'].includes(host)) throw new Error('代理模式必须只监听本机');
const database = process.env.DATABASE_PATH || fileURLToPath(new URL('../.local/web.sqlite', import.meta.url));
mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
const db = openDatabase(database);
const worker = (await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../dist/server/index.js', import.meta.url))).toString('base64'))).default;
const reject = (res, status, error) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
const server = http.createServer(async (req, res) => {
  try {
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reject(res, 400, '请求地址无效');
    // 在缓冲请求之前限制体积，避免远端大请求耗尽内存。
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 64000) return reject(res, 413, '单次提交内容过多');
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    // 只有本机代理设置的真实地址可用于来源限流，客户端自带 CF 头无效。
    const forwarded = String(req.headers['x-real-ip'] || '');
    headers.set('cf-connecting-ip', trustProxy && isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'local');
    const request = new Request(origin + req.url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, { DB: db });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { if (!res.headersSent) reject(res, 500, '服务器暂时无法处理，请稍后重试'); else res.end(); console.error(error.message); }
});
server.requestTimeout = 30000;
server.listen(port, host, () => console.log(`羽球记：${origin}；listening on ${host}:${server.address().port}`));
const stop = () => server.close(() => { db.close(); process.exit(); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
