// 构建时嵌入共享积分规则与静态资源；线上使用 Sites 提供的 D1。
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const cookieName = 'court_session';
const sessionKey = request => (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
const digest = async key => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), b => b.toString(16).padStart(2, '0')).join('');
const cookie = (request, key) => `${cookieName}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${key ? 31536000 : 0}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);

async function identity(db, request, required = true) {
  const key = sessionKey(request);
  const user = /^[a-f0-9]{48}$/.test(key) ? await stmt(db, 'SELECT actor FROM sessions WHERE token_hash = ?', await digest(key)).first() : null;
  if (!user && required) fail('请重新进入，或使用个人登录码恢复身份', 401);
  return user?.actor || '';
}
async function body(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) fail('请从本站操作', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('请求格式错误', 415);
  const raw = await request.text();
  if (raw.length > 64000) fail('单次提交内容过多', 413);
  try { return JSON.parse(raw); } catch { fail('请求格式错误'); }
}
async function limited(db, request) {
  // 登录码和邀请码使用高熵随机值，并限制同一来源的尝试次数。
  const source = await digest(request.headers.get('cf-connecting-ip') || 'local');
  const bucket = Math.floor(Date.now() / 60000);
  const row = await stmt(db, 'INSERT INTO request_limits (source, bucket, count) VALUES (?, ?, 1) ON CONFLICT(source) DO UPDATE SET bucket = excluded.bucket, count = CASE WHEN request_limits.bucket = excluded.bucket THEN request_limits.count + 1 ELSE 1 END RETURNING count', source, bucket).first();
  if (row.count > 30) fail('操作太频繁，请一分钟后重试', 429);
}
async function load(db, id) {
  const row = await stmt(db, 'SELECT document, version, invite FROM groups WHERE id = ?', id).first();
  if (!row) fail('战绩簿不存在', 404);
  return { ...row, group: JSON.parse(row.document) };
}
function result(row, actor, createdId = '') {
  const group = D.publicGroup(row.group, actor);
  // 只有管理员可分发群邀请码。球友仍需认领审核才能写比赛。
  return { group, invite: group.isAdmin ? row.invite : '', createdId };
}
async function settled(db, id, actor) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await load(db, id);
    if (!row.group.users.includes(actor)) fail('请使用群邀请码加入战绩簿', 403);
    const next = D.settlePending(row.group, Date.now());
    if (next === row.group) return row;
    const update = await stmt(db, 'UPDATE groups SET document = ?, version = version + 1 WHERE id = ? AND version = ?', JSON.stringify(next), id, row.version).run();
    if (update.meta.changes) return { ...row, group: next, version: row.version + 1 };
  }
  fail('其他球友正在更新成绩，请稍后刷新', 409);
}
async function change(db, id, actor, action, payload, requestId) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')) fail('缺少提交标识，请刷新');
  const previous = await stmt(db, 'SELECT actor, group_id, created_id FROM mutations WHERE id = ?', requestId).first();
  if (previous) {
    if (previous.actor !== actor || previous.group_id !== id) fail('提交标识不匹配', 409);
    return result(await settled(db, id, actor), actor, previous.created_id);
  }
  const row = await load(db, id);
  let next;
  const createdId = crypto.randomUUID();
  try { next = D.mutate(row.group, action, payload, actor, Date.now(), createdId); }
  catch (error) { fail(error.message, /无权|只有|只能|请先|需由/.test(error.message) ? 403 : 400); }
  const document = JSON.stringify(next);
  if (new TextEncoder().encode(document).length > 800000) fail('战绩簿已达到试用容量，请导出备份');
  let updates;
  try {
    updates = await db.batch([
      stmt(db, 'UPDATE groups SET document = ?, version = version + 1 WHERE id = ? AND version = ?', document, id, row.version),
      stmt(db, 'INSERT INTO mutations (id, actor, group_id, created_id) SELECT ?, ?, ?, ? WHERE changes() = 1', requestId, actor, id, createdId)
    ]);
  } catch (error) {
    // 同一提交在网络重试中已成功时，返回当前数据，不再重复新增比赛。
    const saved = await stmt(db, 'SELECT actor, group_id, created_id FROM mutations WHERE id = ?', requestId).first();
    if (saved?.actor === actor && saved.group_id === id) return result(await settled(db, id, actor), actor, saved.created_id);
    throw error;
  }
  if (!updates[0].meta.changes) fail('成绩已被其他球友更新，请刷新后重试', 409);
  return result({ ...row, group: next }, actor, createdId);
}

async function api(request, env, path) {
  if (!env.DB) fail('共享数据库尚未连接', 503);
  const db = env.DB;
  const url = new URL(request.url);
  if (path === '/api/session' && request.method === 'GET') {
    const actor = await identity(db, request, false);
    const rows = actor ? await stmt(db, "SELECT id, json_extract(document, '$.name') AS name FROM groups WHERE EXISTS (SELECT 1 FROM json_each(document, '$.users') WHERE value = ?) ORDER BY rowid DESC", actor).all() : { results: [] };
    return json({ authenticated: Boolean(actor), groups: rows.results });
  }
  if (path === '/api/session' && request.method === 'POST') {
    const input = await body(request);
    await limited(db, request);
    if (input.loginCode) {
      const key = String(input.loginCode).trim();
      if (!/^[a-f0-9]{48}$/.test(key) || !(await stmt(db, 'SELECT actor FROM sessions WHERE token_hash = ?', await digest(key)).first())) fail('个人登录码无效');
      return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, key) });
    }
    if (await identity(db, request, false)) return json({ authenticated: true });
    const key = randomKey();
    await stmt(db, 'INSERT INTO sessions (token_hash, actor, created_at) VALUES (?, ?, ?)', await digest(key), crypto.randomUUID(), Date.now()).run();
    return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, key) });
  }
  if (path === '/api/logout' && request.method === 'POST') {
    await body(request);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '') });
  }
  const actor = await identity(db, request);
  if (path === '/api/login-code' && request.method === 'GET') return json({ loginCode: sessionKey(request) });
  if (path === '/api/group' && request.method === 'GET') return json(result(await settled(db, url.searchParams.get('id'), actor), actor));
  if (path === '/api/export' && request.method === 'GET') {
    const row = await settled(db, url.searchParams.get('id'), actor);
    if (row.group.owner !== actor) fail('只有管理员可导出', 403);
    return json(result(row, actor).group, 200, { 'Content-Disposition': 'attachment; filename="court-records.json"' });
  }
  if (request.method !== 'POST') fail('接口不存在', 404);
  const input = await body(request);
  if (path === '/api/create') {
    await limited(db, request);
    const id = crypto.randomUUID();
    const invite = randomKey().slice(0, 24);
    let group;
    try { group = D.createGroup(input.name, actor, input.memberName, input.gender, id, Date.now()); }
    catch (error) { fail(error.message); }
    await stmt(db, 'INSERT INTO groups (id, invite, document, version) VALUES (?, ?, ?, 1)', id, invite, JSON.stringify(group)).run();
    return json(result({ group, invite }, actor));
  }
  if (path === '/api/join') {
    await limited(db, request);
    const found = await stmt(db, 'SELECT id FROM groups WHERE invite = ?', String(input.invite || '').trim()).first();
    if (!found) fail('邀请码无效，请向群管理员确认');
    return json(await change(db, found.id, actor, 'join', {}, input.requestId));
  }
  if (path === '/api/action') {
    if (!['addMember', 'addGuest', 'claim', 'approveClaim', 'rejectClaim', 'record', 'edit', 'saveDraft', 'confirm', 'cancel', 'object'].includes(input.action)) fail('不支持的操作');
    return json(await change(db, input.groupId, actor, input.action, input.payload, input.requestId));
  }
  fail('接口不存在', 404);
}

export default {
  async fetch(request, env) {
    let response;
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/')) response = await api(request, env, path);
      else if (ASSETS[path] && ['GET', 'HEAD'].includes(request.method)) response = new Response(request.method === 'HEAD' ? null : ASSETS[path].body, { headers: { 'Content-Type': ASSETS[path].type, 'Cache-Control': 'no-cache' } });
      else response = new Response('Not found', { status: 404 });
    } catch (error) {
      response = json({ error: error.status ? error.message : '服务器暂时无法处理，请稍后重试' }, error.status || 500);
      if (!error.status) console.error('court-api:', error.message);
    }
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return response;
  }
};
