import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './web-db.mjs';
mkdirSync(new URL('../.local/', import.meta.url), { recursive: true });
const db = openDatabase(fileURLToPath(new URL('../.local/web.sqlite', import.meta.url)));
const server = http.createServer(async (req, res) => {
  try {
    const module = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../dist/server/index.js', import.meta.url))).toString('base64'));
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = new Request('http://127.0.0.1:4174' + req.url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const response = await module.default.fetch(request, { DB: db });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end('本地预览错误'); console.error(error.message); }
});
server.listen(4174, '127.0.0.1', () => console.log('羽球记网页版：http://127.0.0.1:4174/'));
process.on('SIGINT', () => server.close(() => { db.close(); process.exit(); }));
