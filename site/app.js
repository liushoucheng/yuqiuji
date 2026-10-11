'use strict';
const D = window.Badminton;
const KEY = 'court-web-group';
let group = null;
let invite = '';
let groups = [];
let busy = false;
let authenticated = false;
let welcomeMode = 'join';
let page = 'home';
let scope = 'overall';
let gender = 'all';
let focusId = '';
let matchId = '';
let form;
let error = '';
const screen = document.querySelector('#screen');
const dialog = document.querySelector('#dialog');
const esc = value => String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const initial = () => ({ type:'doubles', teams:[['',''],['','']], target:21, rule:'sudden', cap:30, ranked:true, games:[['','']], ...D.dateText(Date.now()), editId:'', editStatus:'', revision:0 });
form = initial();
function view() { return group; }
async function request(path, data) {
  let response;
  try { response = await fetch(path, data === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
  catch { throw new Error('网络连接失败，页面中的比分仍保留，请恢复网络后重试。'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败，请刷新后重试');
  return result;
}
function accept(result) {
  group = result.group;
  invite = result.invite;
  localStorage.setItem(KEY, group.id);
}
let pendingRequest;
async function action(name, payload) {
  const signature = JSON.stringify([group.id, name, payload]);
  if (pendingRequest?.signature !== signature) pendingRequest = { signature, id: crypto.randomUUID() };
  const result = await request('/api/action', { groupId: group.id, action: name, payload, requestId: pendingRequest.id });
  pendingRequest = null;
  accept(result);
  return result;
}
async function loadGroup(id) { accept(await request('/api/group?id=' + encodeURIComponent(id))); }
async function enter() { if (!authenticated) { await request('/api/session', {}); authenticated = true; } }
function welcome() {
  return `${title('PLAY. RECORD. IMPROVE.', '羽球记', '把每一次挥拍，记下来。')}<div class="card hero"><div class="court"></div><div class="hero-title">熟悉的球友，<br>共同的战绩。</div><div class="hero-sub">逐局录入 · 跨手机同步 · 个人排名</div></div>${groups.length ? `<div class="section-title">我的战绩簿</div>${groups.map(g => `<button class="secondary full" data-action="openGroup" data-id="${esc(g.id)}">${esc(g.name)} →</button>`).join('')}` : ''}<div class="chips" style="margin:24px 0">${[['join','加入球友群'],['create','创建战绩簿'],['recover','恢复我的身份']].map(([id,label])=>`<button class="chip ${welcomeMode===id?'active':''}" data-action="welcomeMode" data-value="${id}">${label}</button>`).join('')}</div><div class="card">${welcomeMode==='join'?`<label class="label" for="join-code">群邀请码</label><input id="join-code" autocomplete="off" value="${esc(new URL(location.href).searchParams.get('invite')||'')}" placeholder="向群管理员获取">${notice('首次进入会记住浏览器身份。加入后认领球友名单中的名字，由管理员确认，无需注册邮箱或手机号。')}<button class="primary full" data-action="joinGroup">加入战绩簿</button>`:welcomeMode==='create'?`<label class="label" for="group-name">战绩簿名称</label><input id="group-name" maxlength="16" placeholder="例如：周末羽球群"><label class="label" for="owner-name">我的球场昵称</label><input id="owner-name" maxlength="16" placeholder="群里熟悉的名字"><label class="label" for="owner-gender">性别</label><select id="owner-gender"><option value="male">男</option><option value="female">女</option></select>${notice('创建后你是管理员，可添加名单、分享邀请、审核名字认领。')}<button class="primary full" data-action="createGroup">创建战绩簿</button>`:`<label class="label" for="login-code">个人登录码</label><input id="login-code" type="password" autocomplete="off" placeholder="在原手机「我的」中查看并保存">${notice('个人登录码可以在新手机恢复身份，请只保存在自己手中。')}<button class="primary full" data-action="recover">恢复身份</button>`}</div><div class="version">羽球记网页版 · 实验版</div>`;
}
function chips(field, value, choices) { return `<div class="chips">${choices.map(([id,name])=>`<button class="chip ${String(value)===String(id)?'active':''}" data-action="choose" data-field="${field}" data-value="${id}">${name}</button>`).join('')}</div>`; }
function title(kicker, text, sub) { return `<div class="eyebrow">${kicker}</div><div class="title">${text}</div>${sub?`<div class="subtitle">${sub}</div>`:''}`; }
function notice(text) { return `<div class="notice">${text}</div>`; }
function matchCard(match, v, standing) {
  const m = D.matchView(match, v, standing.deltas);
  return `<button class="card full match-button" style="display:block;text-align:left;margin-top:0;padding:15px;font-weight:400;width:100%" data-action="match" data-id="${m.id}" aria-label="${esc(m.typeName+' '+m.teamA+' 对 '+m.teamB+' '+m.statusText)}"><div class="between match-top"><div class="row gap"><span class="badge">${m.typeName}</span><span class="muted">${m.dateText}</span></div><span class="badge ${m.status}">${m.statusText}</span></div><div class="match-teams"><div class="team ${m.winner===0?'winner':''}">${esc(m.teamA)}</div><div class="result">${m.resultText}</div><div class="team right ${m.winner===1?'winner':''}">${esc(m.teamB)}</div></div><div class="games">${m.gamesText}</div><div class="match-footer"><span class="muted">${m.ranked?'积分赛':'友谊赛'} · ${m.target} 分制</span><span class="link">${m.canConfirm?'确认成绩 →':'查看详情 →'}</span></div></button>`;
}
function home(v, standing) {
  const all = v.matches.slice().sort((a,b)=>b.playedAt-a.playedAt);
  const pending = all.filter(m=>['pending','disputed'].includes(m.status));
  return `<div class="between"><div><div class="brand">羽球记 <span class="eyebrow" style="margin-left:7px;font-size:9px">COURT CLUB</span></div><div class="subtitle">${esc(v.name)}</div></div><button class="badge" data-action="refresh">刷新数据</button></div><div class="card hero"><div class="court"></div><div class="eyebrow">PLAY. RECORD. IMPROVE.</div><div class="hero-title">今天的好球，<br>值得被记住。</div><div class="hero-sub">一场比赛，一个新的自己。</div><button class="hero-action" data-nav="record">＋ 记一场比赛</button></div><div class="stats">${[[v.members.filter(m=>!m.guest).length,'群内球友'],[all.filter(m=>m.status==='confirmed').length,'已确认比赛'],[Object.values(standing.people).filter(p=>p.stats.overall.played).length,'积分赛参与者']].map(([value,label])=>`<div class="stat"><span class="stat-number">${value}</span><span class="stat-label">${label}</span></div>`).join('')}</div><div class="between"><div class="section-title">待确认成绩 <span class="badge pending">${pending.length}</span></div><span class="muted">确认后自动计分</span></div>${pending.map(m=>matchCard(m,v,standing)).join('')||'<div class="card empty">所有成绩都已确认<br>去球场，再来一局。</div>'}<div class="between"><div class="section-title">最近比赛</div><button class="link small" style="background:none" data-nav="profile">我的战绩 →</button></div>${all.filter(m=>!['pending','disputed','draft'].includes(m.status)).slice(0,8).map(m=>matchCard(m,v,standing)).join('')}<div class="demo-note">比赛保存在共享数据库 · 提交后 24 小时无异议自动计分</div>`;
}
function record(v) {
  if (!v.meId) return title('JOIN YOUR TEAM.', '先认领自己的名字', '管理员确认后即可记录比赛。') + notice('在「我的」中选择名单里的名字。管理员可以先添加名单，也可以代录比赛。') + '<button class="primary full" data-nav="profile">去认领名字</button>';
  const chosen = form.teams.flat();
  const selects = form.teams.map((team, side)=>`<div><div class="team-label">${side===0?'我方 / A 队':'对方 / B 队'}</div>${team.map((id,slot)=>{
    const eligibleGender = form.type==='mixed'&&slot===1?'female':'male';
    return `<select data-team="${side}" data-slot="${slot}" aria-label="${side===0?'A':'B'}队球员${slot+1}" style="margin-top:8px"><option value="">${form.type==='mixed'?(slot===0?'＋ 男球员':'＋ 女球员'):'＋ 选球员'}</option>${v.members.filter(m=>m.gender===eligibleGender&&(!chosen.includes(m.id)||m.id===id)).map(m=>`<option value="${m.id}" ${m.id===id?'selected':''}>${esc(m.name)}${m.guest?'（临时）':''}</option>`).join('')}</select>`;
  }).join('')}</div>`).join('');
  return `${title('ONE MATCH, ONE MEMORY.',form.editId?'修改比赛':'记一场比赛','选球员，填比分，其余交给羽球记。')}${form.editId?notice(form.editStatus==='draft'?'正在继续录入草稿，提交后才开始确认期限。':'修改后重新开始 24 小时异议期限，并重算后续排名。'):v.matches.filter(m=>m.status==='draft'&&m.canEdit).map(m=>`<button class="secondary full" data-action="resumeDraft" data-id="${m.id}">继续草稿 · ${esc(D.matchView(m,v).teamA)} 对 ${esc(D.matchView(m,v).teamB)} · 已录 ${m.games.length} 局</button>`).join('')}<div class="card" style="margin-top:16px"><label class="label" style="margin-top:0">比赛项目</label>${chips('type',form.type,Object.entries(D.TYPES))}<label class="label">出场球员</label><div class="team-select">${selects}</div><details style="margin-top:16px"><summary class="link">＋ 添加未在群中的临时队员</summary><label class="label" for="guest-name">临时队员姓名</label><input id="guest-name" maxlength="16" placeholder="临时队员姓名"><label class="label" for="guest-gender">性别</label><select id="guest-gender"><option value="male">男</option><option value="female">女</option></select>${notice('临时队员不计个人积分；已登记队员正常计分。添加后可选择出场。')}<button class="secondary full" data-action="addGuest">添加临时队员</button></details><label class="label">每局目标分</label>${chips('target',form.target,[[15,'15 分'],[21,'21 分']])}${notice('不预设整场局数；打完一局添加一局，提交几局就记录几局。')}<label class="label">局末规则</label>${chips('rule',form.rule,[['sudden','到分即结束'],['deuce','净胜 2 分']])}${form.rule==='deuce'?`<label class="label" for="cap">封顶分</label><input id="cap" type="number" min="${form.target+1}" max="99" data-form="cap" value="${esc(form.cap)}">`:''}</div><div class="card"><div class="between"><div class="person-name">每局比分</div><span class="muted">A 队 : B 队</span></div><div class="muted" style="margin-top:8px">先填较低得分，空着的另一侧会自动补齐，可手动修改。</div>${form.games.map((g,i)=>`<div class="score-row"><span class="muted">第 ${i+1} 局</span><input type="number" inputmode="numeric" min="0" max="99" data-game="${i}" data-side="0" value="${esc(g[0])}" placeholder="0" aria-label="第${i+1}局 A队比分"><span class="score-colon">:</span><input type="number" inputmode="numeric" min="0" max="99" data-game="${i}" data-side="1" value="${esc(g[1])}" placeholder="0" aria-label="第${i+1}局 B队比分"></div>`).join('')}<div class="row gap" style="margin-top:16px"><button class="secondary small" data-action="addGame">＋ 加一局</button>${form.games.length>1?'<button class="chip small" data-action="removeGame">去掉末局</button>':''}</div></div><div class="card"><label class="label" style="margin-top:0">比赛类型</label>${chips('ranked',form.ranked,[[true,'积分赛'],[false,'友谊赛']])}<label class="label" for="match-date">实际比赛时间（北京）</label><div class="row gap"><input id="match-date" type="date" data-form="date" value="${form.date}" aria-label="比赛日期"><input type="time" data-form="time" value="${form.time}" aria-label="比赛时间"></div></div>${notice(form.ranked?'暂存不计分；提交按全部局数判断胜负，胜局相同记平局。整场只计分一次，24 小时无异议自动计分。':'友谊赛只保留战绩，不改变实力分和赛季积分。')}${!form.editId||form.editStatus==='draft'?'<button class="secondary full" data-action="saveDraft">暂存，稍后继续</button>':''}<button class="primary full" data-action="save">提交 ${form.games.length} 局成绩</button>`;
}
function rankings(v) {
  const rows = D.ranking(v,scope,gender,Date.now());
  return `${title('A LITTLE BETTER, EVERY GAME.','一起打，一起进步。',scope==='season'?D.seasonOf(Date.now())+' · 每场胜方 +3，负方 +1':'综合实力，来自每一次真实对阵。')}<div style="margin:20px 0 12px">${chips('scope',scope,[['overall','综合'],...Object.entries(D.TYPES),['season','赛季积分']])}</div>${chips('gender',gender,[['all','全部'],['male','男球友'],['female','女球友']])}<div class="card" style="margin-top:16px"><div class="between"><span class="muted">球友 / 场次 / 胜率</span><span class="muted">${scope==='season'?'赛季积分':'实力分'}</span></div>${rows.map(r=>`<button class="board-row" style="width:100%;text-align:left;background:none;border-radius:0;padding:15px 0" data-action="person" data-id="${r.id}" aria-label="查看${esc(r.name)}战绩"><div class="place ${r.rank<=3?'top':''}">${r.rank}</div><div class="avatar ${r.gender}">${esc(r.initial)}</div><div class="person"><div class="person-name">${esc(r.name)} ${r.provisional&&scope!=='season'?'<span class="badge">暂定</span>':''}</div><div class="person-meta">${r.played} 场 · 胜率 ${r.winRate}%</div></div><div class="rating">${r.value===null?'—':r.value}${r.change!==null&&r.played?`<div class="delta ${r.change<0?'negative':''}">最近 ${r.change>0?'+':''}${r.change}</div>`:''}</div></button>`).join('')||'<div class="empty">暂无记录</div>'}</div>${notice(scope==='season'?'赛季按季度统计，实力分跨赛季继承。友谊赛不计分。':'综合分独立计算，不是分项分数相加。满 5 场进入正式榜；新人暂定，5 场不代表已准确评估实力。')}<div class="subtitle" style="font-size:12px">固定搭档难以区分个人贡献；如果女球友只打混双，跨性别名次仅供参考。</div>`;
}
function membership(v) {
  const claim = v.claims[0];
  const available = v.members.filter(m=>!m.guest&&!m.claimed);
  const binding = v.meId ? notice('已绑定 '+esc(v.members.find(m=>m.id===v.meId).name)+'，历史成绩会持续计入同一个球员。') : claim ? notice('已申请认领 '+esc(claim.memberName)+'，等待管理员确认。') : `<div class="card"><div class="person-name">认领我的球场名字</div><label class="label" for="claim-member">球友名单</label><select id="claim-member"><option value="">请选择自己的名字</option>${available.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>${notice('没找到自己的名字时，请让管理员先加入名单。名字相同请使用能区分的昵称。')}<button class="primary full" data-action="claim">申请绑定名字</button></div>`;
  return binding + (v.isAdmin ? `<div class="section-title">群内邀请与认领</div><button class="secondary full" data-action="invite">查看群邀请链接</button>${v.claims.map(c=>`<div class="card" style="margin-top:12px"><div class="person-name">${esc(c.memberName)} · 待认领</div><div class="row gap" style="margin-top:12px"><button class="primary small" data-action="approveClaim" data-id="${c.id}">确认是本人</button><button class="danger small" data-action="rejectClaim" data-id="${c.id}">拒绝</button></div></div>`).join('')}` : '') + `<div class="row gap" style="margin:14px 0"><button class="secondary small" data-action="loginCode">个人登录码</button><button class="chip small" data-action="switchGroup">切换战绩簿</button><button class="chip small" data-action="logout">退出</button></div>${v.isAdmin?`<a class="link" href="/api/export?id=${encodeURIComponent(v.id)}" download>导出比赛记录备份</a>`:''}`;
}
function profile(v, standing) {
  const p = standing.people[focusId || v.meId];
  const s = p ? p.stats.overall : {played:0,won:0};
  const mine = !focusId || (p && p.id===v.meId);
  const records = p?v.matches.filter(m=>m.teams.flat().includes(p.id)).sort((a,b)=>b.playedAt-a.playedAt):[];
  return `${title('YOUR GAME, YOUR STORY.',mine?'我的羽球故事':'球友战绩','')}${!focusId?membership(v):''}${p?`<div class="profile-head"><div class="avatar ${p.gender}">${esc(p.name.slice(0,1))}</div><div><div class="title" style="font-size:21px">${esc(p.name)}</div><div class="subtitle">${esc(v.name)}</div></div></div><div class="stats">${[[s.played?D.score(p.ratings.overall):'—','综合实力'],[s.played,'已确认积分赛'],[(s.played?Math.round(s.won*100/s.played):0)+'%','胜率']].map(([value,label])=>`<div class="stat"><span class="stat-number">${value}</span><span class="stat-label">${label}</span></div>`).join('')}</div><div class="profile-grid">${Object.entries(D.TYPES).map(([id,name])=>`<div class="profile-item"><div class="muted">${name}实力</div><div class="stat-number">${p.stats[id].played?D.score(p.ratings[id]):'—'}</div><div class="person-meta">${p.stats[id].played} 场${p.stats[id].played<5?' · 暂定':''}</div></div>`).join('')}<div class="profile-item"><div class="muted">本季度参与积分</div><div class="stat-number">${p.points}</div><div class="person-meta">胜 +3 · 负 +1</div></div></div>`:''}${v.isAdmin?`<div class="section-title">管理员 · 添加球友</div><div class="card"><label class="label" style="margin-top:0" for="member-name">球场昵称</label><input id="member-name" maxlength="16" placeholder="球友熟悉的名字"><label class="label" for="member-gender">性别</label><select id="member-gender"><option value="male">男</option><option value="female">女</option></select><button class="primary full" data-action="addMember">加入球友名单</button></div>`:''}<div class="section-title">${mine?'我的':'球友'}比赛 <span class="badge">${records.length}</span></div>${records.map(m=>matchCard(m,v,standing)).join('')||'<div class="card empty">第一场比赛，等你上场。</div>'}<div class="version">羽球记网页版 · 实验版 · 共享战绩</div>`;
}
function detail(v, standing) {
  const m = v.matches.find(m=>m.id===matchId);
  if (!m) return '<div class="empty">比赛不存在</div>';
  const x=D.matchView(m,v,standing.deltas);
  const audit=v.audit.filter(a=>a.matchId===m.id).slice().reverse();
  return `<button class="secondary small" data-nav="home" style="margin-bottom:15px">← 返回首页</button><div class="between"><div class="title">比赛详情</div><span class="badge ${m.status}">${x.statusText}</span></div><div class="subtitle">${x.fullDateText} · ${x.typeName} · ${m.ranked?'积分赛':'友谊赛'}</div><div class="card" style="margin-top:16px"><div class="match-teams"><div class="team ${m.winner===0?'winner':''}">${esc(x.teamA)}</div><div class="result">${x.resultText}</div><div class="team right ${m.winner===1?'winner':''}">${esc(x.teamB)}</div></div>${notice(`${m.target} 分 · ${m.status==='draft'?'已录':'提交'} ${m.games.length} 局${m.winner===null&&m.status!=='draft'?' · 平局':''} · ${m.rule==='sudden'?'到分即结束':'净胜 2 分，'+m.cap+' 分封顶'}`)}${m.games.map((g,i)=>`<div class="between audit-row"><span class="muted">第 ${i+1} 局</span><span class="person-name">${g.join(' : ')}</span></div>`).join('')}<div class="subtitle" style="font-size:12px">录入：${esc(m.recorderName)}${m.confirmedByName?' · 确认：'+esc(m.confirmedByName):''}</div></div>${x.deltaText?`<div class="card"><div class="person-name">本场综合实力变化</div><div class="subtitle">${esc(x.deltaText)}</div></div>`:''}${m.status==='pending'?notice('截至 '+x.deadlineText+'（北京时间）无人提出异议则自动计分；对方可提前确认。'):''}${m.status==='disputed'?`<div class="error">有异议，暂停计分：${esc(m.objectionNote)}。请由录入者修改，或由管理员核实处理。</div>`:''}${x.hasGuests?notice('临时队员不进入排名、不累计积分，以固定初始实力参与对阵估计。'):''}${m.status==='draft'?notice('草稿尚未提交，不计积分、不开始确认期限。可继续添加比分后提交。'):''}${m.canObject?'<button class="danger full" data-action="object">比分有误，提出异议</button>':''}${m.canConfirm?`<button class="primary full" data-action="confirm">${v.isAdmin?'管理员确认成绩':'核对并确认成绩'}</button>`:''}<div class="row gap" style="margin-top:15px">${m.canEdit?`<button class="secondary" style="flex:1" data-action="edit">${m.status==='draft'?'继续录入':'修改成绩'}</button>`:''}${m.canCancel?'<button class="danger" style="flex:1" data-action="cancel">撤销成绩</button>':''}</div><div class="section-title">操作记录</div><div class="card">${audit.map(a=>`<div class="audit-row"><div>${esc(a.note)}</div><div class="muted">${esc(a.actorName)} · ${D.dateText(a.at).date} ${D.dateText(a.at).time}</div>${a.before?`<div class="muted">操作前比分：${a.before.games.map(g=>g.join(':')).join(' · ')}</div>`:''}</div>`).join('')||'<div class="empty">暂无操作记录</div>'}</div>`;
}
function render(resetScroll) {
  document.querySelector('.tabbar').hidden = !group;
  if (!group) {
    document.querySelector('#nav-title').textContent = '羽球记 · 网页版';
    screen.innerHTML = `<div class="page">${error?`<div class="error" role="alert">${esc(error)}</div>`:''}${welcome()}</div>`;
    if (resetScroll) screen.scrollTop = 0;
    return;
  }
  const v=view(), standing=D.buildStandings(v,Date.now());
  document.querySelector('#nav-title').textContent=({home:'羽球记',record:'记比赛',rankings:'排行榜',profile:'我的',detail:'比赛详情'})[page];
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));
  const content=({home,record,rankings,profile,detail})[page](v,standing);
  screen.innerHTML=`<div class="page">${error?`<div class="error" role="alert">${esc(error)}</div>`:''}${content}</div>`;
  if(resetScroll) screen.scrollTop=0;
}
function navigate(name) { page=name; error=''; if(name==='profile') focusId=''; render(true); }
function showDialog(text, body, buttons, editable) {
  dialog.innerHTML=`<h2>${esc(text)}</h2><p>${esc(body)}</p>${editable?'<label class="label" for="objection-reason">异议原因</label><input id="objection-reason" maxlength="200" placeholder="说明比分或球员哪里有误">':''}<div class="dialog-buttons">${buttons.map((b,i)=>`<button class="${b.primary?'primary':'secondary'}" data-dialog="${i}">${esc(b.text)}</button>`).join('')}</div>`;
  dialog.onclick=async e=>{ const button=e.target.closest('[data-dialog]'); if(!button || busy)return;const b=buttons[Number(button.dataset.dialog)];dialog.close();busy=true;try{if(b.run)await b.run();}catch(err){error=err.message;render(false);}finally{busy=false;} };
  dialog.showModal();
}
async function save(draft) {
  const payload={...form,playedAt:Date.parse(form.date+'T'+form.time+':00+08:00'),matchId:form.editId};
  D.validateMatch(payload,group.members,Date.now(),draft);
  const result=await action(draft?'saveDraft':form.editId?'edit':'record',payload);
  const v=result.group;
  matchId=form.editId||result.createdId;
  const m=v.matches.find(m=>m.id===matchId);
  if(draft){
    form.editId=matchId;form.editStatus='draft';form.revision=m.revision;
    render(false);
    showDialog('已暂存','比分已保存，退出后可从「记比赛」继续草稿。尚未开始 24 小时确认期限。',[{text:'继续录入',primary:true},{text:'查看详情',run:()=>{page='detail';render(true);}}]);
    return;
  }
  form.editId='';form.editStatus='';form.revision=0;
  showDialog('成绩已提交','按本次提交的 '+m.games.length+' 局计一场'+(m.winner===null?'，胜局相同记为平局':'')+'。24 小时无异议自动计分。',[{text:'查看详情',run:()=>{page='detail';render(true);}},{text:'再打一场',primary:true,run:()=>{form.games=[['','']];Object.assign(form,D.dateText(Date.now()));render(true);}}]);
}
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.form)form[t.dataset.form]=t.value;
  if(t.dataset.game!==undefined)form.games[Number(t.dataset.game)][Number(t.dataset.side)]=t.value;
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.game!==undefined){
    const game=Number(t.dataset.game), other=1-Number(t.dataset.side);
    if(form.games[game][other]===''){
      const value=D.suggestOpponentScore(t.value,form.target,form.rule,form.cap);
      if(value!==''){
        form.games[game][other]=value;
        screen.querySelector(`[data-game="${game}"][data-side="${other}"]`).value=value;
      }
    }
  }
  if(t.dataset.team!==undefined){form.teams[Number(t.dataset.team)][Number(t.dataset.slot)]=t.value;render(false);}
});
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-nav],[data-action]'); if(!t || busy)return;
  if(t.dataset.nav){navigate(t.dataset.nav);return;}
  error='';busy=true;
  try {
    const a=t.dataset.action;
    if(a==='welcomeMode'){welcomeMode=t.dataset.value;render(false);}
    else if(a==='openGroup'){await loadGroup(t.dataset.id);page='home';render(true);}
    else if(a==='refresh'){await loadGroup(group.id);render(false);}
    else if(a==='createGroup'){
      const data={name:document.querySelector('#group-name').value,memberName:document.querySelector('#owner-name').value,gender:document.querySelector('#owner-gender').value};
      await enter();accept(await request('/api/create',data));page='home';history.replaceState({},'',location.pathname);render(true);
      showDialog('战绩簿已创建','在「我的」中添加群内名单、复制邀请链接，并保存自己的个人登录码。',[{text:'去设置',primary:true,run:()=>navigate('profile')}]);
    } else if(a==='joinGroup'){
      const code=document.querySelector('#join-code').value;await enter();accept(await request('/api/join',{invite:code,requestId:crypto.randomUUID()}));history.replaceState({},'',location.pathname);page='profile';render(true);
    } else if(a==='recover'){
      await request('/api/session',{loginCode:document.querySelector('#login-code').value});authenticated=true;await startup();
    } else if(a==='switchGroup'){
      const session=await request('/api/session');groups=session.groups;group=null;render(true);
    } else if(a==='logout'){
      showDialog('退出当前身份','请先保存「个人登录码」，以后可用它恢复身份及历史战绩。',[{text:'返回'},{text:'已保存，退出',primary:true,run:async()=>{await request('/api/logout',{});group=null;groups=[];authenticated=false;render(true);}}]);
    } else if(a==='loginCode'){
      const data=await request('/api/login-code');showDialog('个人登录码','它等同于登录凭证，可以恢复你的身份。请只保存给自己，不要发到群里。',[{text:'已保存',primary:true}]);
      const input=document.createElement('textarea');input.value=data.loginCode;input.readOnly=true;input.setAttribute('aria-label','个人登录码');input.style.width='100%';dialog.querySelector('.dialog-buttons').before(input);
    } else if(a==='invite'){
      const link=location.origin+'/?invite='+encodeURIComponent(invite);showDialog('邀请球友','把下面的链接发到球友群。球友进入后选择自己的名字，由你审核认领。',[{text:'知道了',primary:true}]);
      const input=document.createElement('textarea');input.value=link;input.readOnly=true;input.setAttribute('aria-label','群邀请链接');input.style.width='100%';dialog.querySelector('.dialog-buttons').before(input);
    } else if(a==='claim'){await action('claim',{memberId:document.querySelector('#claim-member').value});render(false);}
    else if(a==='approveClaim'||a==='rejectClaim'){await action(a,{claimId:t.dataset.id});render(false);}
    else if(a==='choose'){
      const f=t.dataset.field, val=t.dataset.value;
      if(f==='scope')scope=val;
      else if(f==='gender')gender=val;
      else if(f==='type'){form.type=val;form.teams=[Array(val==='singles'?1:2).fill(''),Array(val==='singles'?1:2).fill('')];}
      else if(f==='ranked')form.ranked=val==='true';
      else if(f==='target'){form.target=Number(val);form.cap=form.target===21?30:21;}
      else form[f]=val;
      render(false);
    } else if(a==='match'){matchId=t.dataset.id;page='detail';render(true);}
    else if(a==='person'){focusId=t.dataset.id;page='profile';render(true);}
    else if(a==='addGame'){form.games.push(['','']);render(false);}
    else if(a==='removeGame'){if(form.games.length>1)form.games.pop();render(false);}
    else if(a==='save'||a==='saveDraft')await save(a==='saveDraft');
    else if(a==='edit'||a==='resumeDraft'){
      const m=view().matches.find(m=>m.id===(a==='resumeDraft'?t.dataset.id:matchId));
      form={...D.clone(m),...D.dateText(m.playedAt),editId:m.id,editStatus:m.status};page='record';render(true);
    } else if(a==='object'){
      const m=view().matches.find(m=>m.id===matchId);
      showDialog('提出成绩异议','提交后暂停计分，由录入者或管理员核实。',[{text:'返回'},{text:'提交异议',primary:true,run:async()=>{try{await action('object',{matchId,revision:m.revision,reason:document.querySelector('#objection-reason').value});render(false);}catch(err){error=err.message;render(false);}}}],true);
    } else if(a==='confirm'||a==='cancel'){
      const m=view().matches.find(m=>m.id===matchId);
      showDialog(a==='confirm'?(view().isAdmin?'管理员确认成绩':'确认比赛成绩'):'撤销这场比赛',a==='confirm'?'确认后自动更新积分。请核对球员、赛制和每局比分。':'成绩保留为已撤销，积分按时间顺序重算，操作可追溯。',[{text:'返回'},{text:a==='confirm'?'确认成绩':'撤销成绩',primary:true,run:async()=>{try{await action(a,{matchId,revision:m.revision});render(false);}catch(err){error=err.message;render(false);}}}]);
    } else if(a==='addGuest'){
      await action('addGuest',{name:document.querySelector('#guest-name').value,gender:document.querySelector('#guest-gender').value});render(false);
      showDialog('临时队员已添加','可在出场球员中选择；不会累计该队员的积分。',[{text:'知道了',primary:true}]);
    } else if(a==='addMember'){
      await action('addMember',{name:document.querySelector('#member-name').value,gender:document.querySelector('#member-gender').value});render(false);
      showDialog('球友已添加','可以先代录比赛，再让球友认领自己的名字。',[{text:'知道了',primary:true}]);
    }
  } catch(err){error=err.message;render(false);screen.scrollTop=0;} finally {busy=false;}
});
async function startup() {
  try {
    const session=await request('/api/session');authenticated=session.authenticated;groups=session.groups;
    const id=groups.find(g=>g.id===localStorage.getItem(KEY))?.id||groups[0]?.id;
    if (id && !new URL(location.href).searchParams.has('invite')) await loadGroup(id);
    else group=null;
  } catch(err){error=err.message;}
  render(true);
}
startup();
setInterval(async()=>{
  if (!group || busy || dialog.open) return;
  try{await loadGroup(group.id);if(page!=='record')render(false);}catch{ /* 网络恢复后刷新，不打断正在填写的比分。 */ }
},30000);
