'use strict';
const D = window.Badminton;
const KEY = 'court-gh-preview-v1';
const ACTOR_KEY = 'court-gh-preview-actor-v1';
let group;
try { group = JSON.parse(localStorage.getItem(KEY)); } catch (_) { group = null; }
if (!group || group.schemaVersion !== 1) group = window.BadmintonDemo.create(Date.now());
let actor = localStorage.getItem(ACTOR_KEY) || 'demo-1';
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
function view() {
  const settled = D.settlePending(group, Date.now());
  if (settled !== group) { localStorage.setItem(KEY, JSON.stringify(settled)); group = settled; }
  return D.publicGroup(group, actor);
}
function action(name, payload) {
  const next = D.mutate(group, name, payload, actor, Date.now(), 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2,8));
  // 写入成功后才更新内存状态；存储失败不会显示为已保存。
  localStorage.setItem(KEY, JSON.stringify(next));
  group = next;
  return view();
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
  return `<div class="between"><div><div class="brand">羽球记 <span class="eyebrow" style="margin-left:7px;font-size:9px">COURT CLUB</span></div><div class="subtitle">${esc(v.name)}</div></div><span class="badge">本设备体验</span></div><div class="card hero"><div class="court"></div><div class="eyebrow">PLAY. RECORD. IMPROVE.</div><div class="hero-title">今天的好球，<br>值得被记住。</div><div class="hero-sub">一场比赛，一个新的自己。</div><button class="hero-action" data-nav="record">＋ 记一场比赛</button></div><div class="stats">${[[v.members.filter(m=>!m.guest).length,'群内球友'],[all.filter(m=>m.status==='confirmed').length,'已确认比赛'],[Object.values(standing.people).filter(p=>p.stats.overall.played).length,'积分赛参与者']].map(([value,label])=>`<div class="stat"><span class="stat-number">${value}</span><span class="stat-label">${label}</span></div>`).join('')}</div><div class="between"><div class="section-title">待确认成绩 <span class="badge pending">${pending.length}</span></div><span class="muted">确认后自动计分</span></div>${pending.map(m=>matchCard(m,v,standing)).join('')||'<div class="card empty">所有成绩都已确认<br>去球场，再来一局。</div>'}<div class="between"><div class="section-title">最近比赛</div><button class="link small" style="background:none" data-nav="profile">我的战绩 →</button></div>${all.filter(m=>!['pending','disputed','draft'].includes(m.status)).slice(0,8).map(m=>matchCard(m,v,standing)).join('')}<div class="demo-note">演示球友与比赛均为虚构 · 仅保存在本机</div>`;
}
function record(v) {
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
function profile(v, standing) {
  const p = standing.people[focusId || v.meId];
  const s = p ? p.stats.overall : {played:0,won:0};
  const mine = p && p.id===v.meId;
  const records = p?v.matches.filter(m=>m.teams.flat().includes(p.id)).sort((a,b)=>b.playedAt-a.playedAt):[];
  return `${title('YOUR GAME, YOUR STORY.',mine?'我的羽球故事':'球友战绩','')}<label class="label" for="demo-identity">本设备体验身份</label><select id="demo-identity" data-identity>${v.members.filter(m=>m.claimed).map(m=>`<option value="${m.id}" ${m.id===v.meId?'selected':''}>${esc(m.name)}${m.id==='p1'?'（管理员）':''}</option>`).join('')}</select>${notice('切换身份可测试对方确认。本体验页只保存在当前浏览器，正式共享后台另行部署。')}${p?`<div class="profile-head"><div class="avatar ${p.gender}">${esc(p.name.slice(0,1))}</div><div><div class="title" style="font-size:21px">${esc(p.name)}</div><div class="subtitle">${esc(v.name)}</div></div></div><div class="stats">${[[s.played?D.score(p.ratings.overall):'—','综合实力'],[s.played,'已确认积分赛'],[(s.played?Math.round(s.won*100/s.played):0)+'%','胜率']].map(([value,label])=>`<div class="stat"><span class="stat-number">${value}</span><span class="stat-label">${label}</span></div>`).join('')}</div><div class="profile-grid">${Object.entries(D.TYPES).map(([id,name])=>`<div class="profile-item"><div class="muted">${name}实力</div><div class="stat-number">${p.stats[id].played?D.score(p.ratings[id]):'—'}</div><div class="person-meta">${p.stats[id].played} 场${p.stats[id].played<5?' · 暂定':''}</div></div>`).join('')}<div class="profile-item"><div class="muted">本季度参与积分</div><div class="stat-number">${p.points}</div><div class="person-meta">胜 +3 · 负 +1</div></div></div>`:''}${v.isAdmin?`<div class="section-title">管理员 · 添加球友</div><div class="card"><label class="label" style="margin-top:0" for="member-name">球场昵称</label><input id="member-name" maxlength="16" placeholder="球友熟悉的名字"><label class="label" for="member-gender">性别</label><select id="member-gender"><option value="male">男</option><option value="female">女</option></select><button class="primary full" data-action="addMember">加入球友名单</button></div>`:''}<div class="section-title">${mine?'我的':'球友'}比赛 <span class="badge">${records.length}</span></div>${records.map(m=>matchCard(m,v,standing)).join('')||'<div class="card empty">第一场比赛，等你上场。</div>'}<div class="version">羽球记 0.1 · 实验版 · 虚构演示数据</div>`;
}
function detail(v, standing) {
  const m = v.matches.find(m=>m.id===matchId);
  if (!m) return '<div class="empty">比赛不存在</div>';
  const x=D.matchView(m,v,standing.deltas);
  const audit=v.audit.filter(a=>a.matchId===m.id).slice().reverse();
  return `<button class="secondary small" data-nav="home" style="margin-bottom:15px">← 返回首页</button><div class="between"><div class="title">比赛详情</div><span class="badge ${m.status}">${x.statusText}</span></div><div class="subtitle">${x.fullDateText} · ${x.typeName} · ${m.ranked?'积分赛':'友谊赛'}</div><div class="card" style="margin-top:16px"><div class="match-teams"><div class="team ${m.winner===0?'winner':''}">${esc(x.teamA)}</div><div class="result">${x.resultText}</div><div class="team right ${m.winner===1?'winner':''}">${esc(x.teamB)}</div></div>${notice(`${m.target} 分 · ${m.status==='draft'?'已录':'提交'} ${m.games.length} 局${m.winner===null&&m.status!=='draft'?' · 平局':''} · ${m.rule==='sudden'?'到分即结束':'净胜 2 分，'+m.cap+' 分封顶'}`)}${m.games.map((g,i)=>`<div class="between audit-row"><span class="muted">第 ${i+1} 局</span><span class="person-name">${g.join(' : ')}</span></div>`).join('')}<div class="subtitle" style="font-size:12px">录入：${esc(m.recorderName)}${m.confirmedByName?' · 确认：'+esc(m.confirmedByName):''}</div></div>${x.deltaText?`<div class="card"><div class="person-name">本场综合实力变化</div><div class="subtitle">${esc(x.deltaText)}</div></div>`:''}${m.status==='pending'?notice('截至 '+x.deadlineText+'（北京时间）无人提出异议则自动计分；对方可提前确认。'):''}${m.status==='disputed'?`<div class="error">有异议，暂停计分：${esc(m.objectionNote)}。请由录入者修改，或由管理员核实处理。</div>`:''}${x.hasGuests?notice('临时队员不进入排名、不累计积分，以固定初始实力参与对阵估计。'):''}${m.status==='draft'?notice('草稿尚未提交，不计积分、不开始确认期限。可继续添加比分后提交。'):''}${m.canObject?'<button class="danger full" data-action="object">比分有误，提出异议</button>':''}${m.canConfirm?`<button class="primary full" data-action="confirm">${v.isAdmin?'管理员确认成绩':'核对并确认成绩'}</button>`:''}<div class="row gap" style="margin-top:15px">${m.canEdit?`<button class="secondary" style="flex:1" data-action="edit">${m.status==='draft'?'继续录入':'修改成绩'}</button>`:''}${m.canCancel?'<button class="danger" style="flex:1" data-action="cancel">撤销成绩</button>':''}</div><div class="section-title">操作记录</div><div class="card">${audit.map(a=>`<div class="audit-row"><div>${esc(a.note)}</div><div class="muted">${esc(a.actorName)} · ${D.dateText(a.at).date} ${D.dateText(a.at).time}</div>${a.before?`<div class="muted">操作前比分：${a.before.games.map(g=>g.join(':')).join(' · ')}</div>`:''}</div>`).join('')||'<div class="empty">这是一条演示历史成绩</div>'}</div>`;
}
function render(resetScroll) {
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
  dialog.onclick=e=>{ const button=e.target.closest('[data-dialog]'); if(!button)return;dialog.close();const b=buttons[Number(button.dataset.dialog)];if(b.run)b.run(); };
  dialog.showModal();
}
function save(draft) {
  const payload={...form,playedAt:Date.parse(form.date+'T'+form.time+':00+08:00'),matchId:form.editId};
  D.validateMatch(payload,group.members,Date.now(),draft);
  const v=action(draft?'saveDraft':form.editId?'edit':'record',payload);
  matchId=form.editId||v.matches.at(-1).id;
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
  if(t.hasAttribute('data-identity')){const m=group.members.find(m=>m.id===t.value);localStorage.setItem(ACTOR_KEY,m.user);actor=m.user;focusId='';render(true);}
});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-nav],[data-action]'); if(!t)return;
  if(t.dataset.nav){navigate(t.dataset.nav);return;}
  error='';
  try {
    const a=t.dataset.action;
    if(a==='choose'){
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
    else if(a==='save'||a==='saveDraft')save(a==='saveDraft');
    else if(a==='edit'||a==='resumeDraft'){
      const m=view().matches.find(m=>m.id===(a==='resumeDraft'?t.dataset.id:matchId));
      form={...D.clone(m),...D.dateText(m.playedAt),editId:m.id,editStatus:m.status};page='record';render(true);
    } else if(a==='object'){
      const m=view().matches.find(m=>m.id===matchId);
      showDialog('提出成绩异议','提交后暂停计分，由录入者或管理员核实。',[{text:'返回'},{text:'提交异议',primary:true,run:()=>{try{action('object',{matchId,revision:m.revision,reason:document.querySelector('#objection-reason').value});render(false);}catch(err){error=err.message;render(false);}}}],true);
    } else if(a==='confirm'||a==='cancel'){
      const m=view().matches.find(m=>m.id===matchId);
      showDialog(a==='confirm'?(view().isAdmin?'管理员确认成绩':'确认比赛成绩'):'撤销这场比赛',a==='confirm'?'确认后自动更新积分。请核对球员、赛制和每局比分。':'成绩保留为已撤销，积分按时间顺序重算，操作可追溯。',[{text:'返回'},{text:a==='confirm'?'确认成绩':'撤销成绩',primary:true,run:()=>{try{action(a,{matchId,revision:m.revision});render(false);}catch(err){error=err.message;render(false);}}}]);
    } else if(a==='addGuest'){
      action('addGuest',{name:document.querySelector('#guest-name').value,gender:document.querySelector('#guest-gender').value});render(false);
      showDialog('临时队员已添加','可在出场球员中选择；不会累计该队员的积分。',[{text:'知道了',primary:true}]);
    } else if(a==='addMember'){
      action('addMember',{name:document.querySelector('#member-name').value,gender:document.querySelector('#member-gender').value});render(false);
      showDialog('球友已添加','可以先代录比赛，再让球友认领自己的名字。',[{text:'知道了',primary:true}]);
    }
  } catch(err){error=err.message;render(false);screen.scrollTop=0;}
});
render(true);

setInterval(() => { if(group.matches.some(m=>m.status==='pending' && D.confirmationDeadline(m)<=Date.now())) render(false); }, 60000);
