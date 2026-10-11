/* 两队、无平局的 Gaussian / TrueSkill 类更新。客户端与云端共用规则。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Badminton = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = { singles: '男单', doubles: '男双', mixed: '混双' };
  const INITIAL = { mu: 25, sigma: 25 / 3 };
  const BETA = 25 / 6;
  const TAU = 25 / 300;
  const CONFIRM_WINDOW = 24 * 3600000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const ensure = (condition, message) => { if (!condition) fail(message); };
  const cleanName = value => {
    ensure(typeof value === 'string', '请输入名字');
    const name = value.trim();
    ensure(name.length >= 1 && name.length <= 16, '名字需为 1–16 个字');
    return name;
  };
  function seasonOf(time) {
    const d = new Date(Number(time) + 8 * 3600000);
    return d.getUTCFullYear() + '-Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  }
  function score(rating) {
    return Math.round(1000 + 40 * (rating.mu - 3 * rating.sigma));
  }
  function normalCDF(x) {
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return (1 + sign * erf) / 2;
  }
  function rateTeams(winners, losers) {
    const teams = [winners, losers].map(team => team.map(r => ({ mu: r.mu, variance: r.sigma * r.sigma + TAU * TAU })));
    const c2 = teams.flat().reduce((sum, r) => sum + r.variance + BETA * BETA, 0);
    const c = Math.sqrt(c2);
    const t = (teams[0].reduce((sum, r) => sum + r.mu, 0) - teams[1].reduce((sum, r) => sum + r.mu, 0)) / c;
    // 极小尾概率用 Mills 比率的渐近展开，避免爆冷时除以零。
    const v = t < -8 ? -t + 1 / -t - 2 / Math.pow(-t, 3) + 10 / Math.pow(-t, 5) : Math.exp(-t * t / 2) / Math.sqrt(2 * Math.PI) / Math.max(normalCDF(t), 1e-16);
    const w = Math.min(1 - 1e-12, Math.max(0, v * (v + t)));
    return teams.map((team, side) => team.map(r => ({
      mu: r.mu + (side === 0 ? 1 : -1) * r.variance / c * v,
      sigma: Math.sqrt(Math.max(1e-8, r.variance * (1 - r.variance / c2 * w)))
    })));
  }
  function integer(value, label) {
    ensure(value !== '' && value !== null && value !== undefined && !(typeof value === 'string' && !value.trim()), label + '不能为空');
    const n = Number(value);
    ensure(Number.isInteger(n) && n >= 0 && n <= 99, label + '需为 0–99 的整数');
    return n;
  }
  function gameWinner(game, target, rule, cap) {
    ensure(Array.isArray(game) && game.length === 2, '每局需填写双方比分');
    const a = integer(game[0], '比分');
    const b = integer(game[1], '比分');
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    ensure(a !== b, '一局不能以平分结束');
    if (rule === 'sudden') {
      ensure(high === target && low < target, '到分即结束：胜方须为 ' + target + ' 分');
    } else {
      const legal = high === target ? low <= target - 2 : high < cap ? high > target && high - low === 2 : high === cap && low >= cap - 2 && low < cap;
      ensure(legal, '比分不符合净胜 2 分 / ' + cap + ' 分封顶规则');
    }
    return { winner: a > b ? 0 : 1, game: [a, b] };
  }
  function suggestOpponentScore(value, target, rule, cap) {
    if (value === '' || value === null || value === undefined || (typeof value === 'string' && !value.trim())) return '';
    const low = Number(value);
    if (!Number.isInteger(low) || low < 0 || low >= target) return '';
    const high = rule === 'deuce' ? Math.min(Number(cap), Math.max(Number(target), low + 2)) : Number(target);
    try { return gameWinner([low, high], Number(target), rule, Number(cap)).game[1]; }
    catch (_) { return ''; }
  }
  function validateMatch(input, members, now, draft) {
    ensure(input && TYPES[input.type], '请选择比赛项目');
    const target = Number(input.target);
    ensure([15, 21].includes(target), '每局支持 15 或 21 分');
    ensure(['sudden', 'deuce'].includes(input.rule), '请选择局末规则');
    const cap = input.rule === 'sudden' ? target : integer(input.cap, '封顶分');
    ensure(input.rule === 'sudden' || (cap > target && cap <= 99), '封顶分须大于目标分且不超过 99');
    const size = input.type === 'singles' ? 1 : 2;
    ensure(Array.isArray(input.teams) && input.teams.length === 2 && input.teams.every(team => Array.isArray(team) && team.length === size), '请选齐双方球员');
    const ids = input.teams.flat();
    ensure(new Set(ids).size === ids.length, '同一球员不能重复出场');
    const map = Object.fromEntries(members.map(m => [m.id, m]));
    ensure(ids.every(id => map[id]), '球员不在当前球友名单中');
    if (input.type === 'mixed') {
      ensure(input.teams.every(team => team.filter(id => map[id].gender === 'male').length === 1 && team.filter(id => map[id].gender === 'female').length === 1), '混双每队需一男一女');
    } else ensure(ids.every(id => map[id].gender === 'male'), TYPES[input.type] + '请选择男球员');
    ensure(typeof input.ranked === 'boolean', '请选择积分赛或友谊赛');
    ensure(Array.isArray(input.games) && input.games.length > 0, '请添加每局比分');
    const wins = [0, 0];
    const games = input.games.map(game => {
      if (draft) {
        ensure(Array.isArray(game) && game.length === 2, '每局需填写双方比分');
        const saved = game.map(value => value === '' ? '' : integer(value, '比分'));
        // 草稿可保存尚未打完的局；只有合法的完整比分才计入胜局预览。
        try { wins[gameWinner(saved, target, input.rule, cap).winner]++; } catch (_) {}
        return saved;
      }
      const result = gameWinner(game, target, input.rule, cap);
      wins[result.winner]++;
      return result.game;
    });
    const playedAt = Number(input.playedAt);
    ensure(Number.isFinite(playedAt) && playedAt >= Date.UTC(2000, 0, 1) && playedAt <= now + 5 * 60000, '比赛时间无效或晚于当前时间');
    return { type: input.type, target, rule: input.rule, cap, ranked: input.ranked, teams: clone(input.teams), games, wins, winner: wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1, playedAt };
  }
  function buildStandings(group, now) {
    const people = {};
    const memberMap = Object.fromEntries(group.members.map(m => [m.id, m]));
    group.members.filter(m => !m.guest).forEach(member => {
      people[member.id] = { id: member.id, name: member.name, gender: member.gender, ratings: {}, stats: {}, points: 0, changes: {}, partners: {} };
      ['overall', ...Object.keys(TYPES)].forEach(scope => {
        people[member.id].ratings[scope] = { ...INITIAL };
        people[member.id].stats[scope] = { played: 0, won: 0 };
        people[member.id].changes[scope] = 0;
      });
    });
    const deltas = {};
    const matches = group.matches.filter(m => m.status === 'confirmed').slice().sort((a, b) => a.playedAt - b.playedAt || a.id.localeCompare(b.id));
    matches.forEach(match => {
      if (!match.ranked) return;
      const draw = match.winner === null;
      const scopes = ['overall', match.type];
      deltas[match.id] = {};
      scopes.forEach(scope => {
        const winIds = match.teams[draw ? 0 : match.winner];
        const loseIds = match.teams[draw ? 1 : 1 - match.winner];
        // 临时队员只以固定初始实力参与估计，不更新或保存个人积分。
        const rating = id => people[id] ? people[id].ratings[scope] : INITIAL;
        const updated = draw ? [winIds.map(rating), loseIds.map(rating)] : rateTeams(winIds.map(rating), loseIds.map(rating));
        [winIds, loseIds].forEach((ids, side) => ids.forEach((id, i) => {
          const person = people[id];
          if (!person) return;
          const before = score(person.ratings[scope]);
          person.ratings[scope] = updated[side][i];
          person.changes[scope] = score(updated[side][i]) - before;
          person.stats[scope].played++;
          if (!draw && side === 0) person.stats[scope].won++;
          if (scope === 'overall') deltas[match.id][id] = person.changes[scope];
        }));
      });
      match.teams.forEach((team, side) => team.forEach(id => {
        if (!people[id]) return;
        if (seasonOf(match.playedAt) === seasonOf(now)) people[id].points += !draw && side === match.winner ? 3 : 1;
        team.filter(other => other !== id).forEach(other => {
          const partner = people[id].partners[other] || { id: other, name: memberMap[other].name + (memberMap[other].guest ? '（临时）' : ''), played: 0, won: 0 };
          partner.played++;
          if (!draw && side === match.winner) partner.won++;
          people[id].partners[other] = partner;
        });
      }));
    });
    return { people, deltas };
  }
  function ranking(group, scope, gender, now) {
    const standings = buildStandings(group, now);
    const statScope = scope === 'season' ? 'overall' : scope;
    ensure(['overall', 'singles', 'doubles', 'mixed'].includes(statScope), '排名项目无效');
    let rows = Object.values(standings.people).filter(p => !gender || gender === 'all' || p.gender === gender).map(p => {
      const stat = p.stats[statScope];
      const rating = p.ratings[statScope];
      return { ...p, initial: p.name.slice(0, 1), value: scope === 'season' ? p.points : stat.played ? score(rating) : null, played: stat.played, won: stat.won, winRate: stat.played ? Math.round(stat.won * 100 / stat.played) : 0, provisional: stat.played < 5, sigma: Number(rating.sigma.toFixed(2)), change: scope === 'season' ? null : p.changes[statScope] };
    });
    rows.sort((a, b) => (b.value === null ? -Infinity : b.value) - (a.value === null ? -Infinity : a.value) || b.won - a.won || a.id.localeCompare(b.id));
    let previous;
    let previousRank = 0;
    rows = rows.map((row, index) => {
      const official = scope === 'season' ? row.value > 0 : !row.provisional;
      if (index === 0 || row.value !== previous) previousRank = index + 1;
      previous = row.value;
      return { ...row, rank: official ? previousRank : '—' };
    });
    // 实力榜正式成员在前，新人单列为暂定；不凭空给无记录者实力分。
    if (scope !== 'season') {
      rows.sort((a, b) => Number(a.provisional) - Number(b.provisional) || (b.value === null ? -Infinity : b.value) - (a.value === null ? -Infinity : a.value) || a.id.localeCompare(b.id));
      let rank = 0;
      let last;
      rows = rows.map((row, i) => { if (!row.provisional && (i === 0 || row.value !== last)) rank = i + 1; last = row.value; return { ...row, rank: row.provisional ? '—' : rank }; });
    }
    return rows;
  }
  function createGroup(name, actor, ownerName, gender, id, now) {
    ensure(actor && id, '登录状态无效');
    ensure(['male', 'female'].includes(gender), '请选择性别');
    return { schemaVersion: 1, id, name: cleanName(name), owner: actor, users: [actor], members: [{ id: 'p1', name: cleanName(ownerName), gender, user: actor }], claims: [], matches: [], audit: [], createdAt: now, updatedAt: now };
  }
  function identity(group, actor) {
    return group.members.find(m => !m.guest && m.user === actor);
  }
  function confirmationDeadline(match) {
    return match.confirmationDueAt || (match.updatedAt || match.createdAt || match.playedAt) + CONFIRM_WINDOW;
  }
  function updateDeadline(group) {
    const due = group.matches.filter(m => m.status === 'pending').map(confirmationDeadline);
    group.nextConfirmationAt = due.length ? Math.min(...due) : null;
  }
  function settlePending(group, now) {
    if (!group.matches.some(m => m.status === 'pending' && confirmationDeadline(m) <= now)) return group;
    const g = clone(group);
    g.matches.forEach(match => {
      if (match.status !== 'pending' || confirmationDeadline(match) > now) return;
      const before = clone(match);
      match.status = 'confirmed';
      match.confirmedAt = confirmationDeadline(match);
      match.confirmedByName = '24 小时无异议，自动确认';
      match.confirmationMethod = 'timeout';
      match.updatedAt = now;
      match.revision++;
      g.audit.push({ id: 'auto-' + match.id + '-' + before.revision, kind: 'autoConfirm', matchId: match.id, actorName: '系统', at: now, note: '提交后 24 小时无人提出异议，自动确认并计分', before });
    });
    g.updatedAt = now;
    updateDeadline(g);
    return g;
  }
  function permissions(group, match, actor) {
    const me = identity(group, actor);
    const admin = group.owner === actor;
    const recorder = match.recordedBy === actor;
    const recorderMember = identity(group, match.recordedBy);
    const recorderSide = recorderMember ? match.teams.findIndex(team => team.includes(recorderMember.id)) : -1;
    const mySide = me ? match.teams.findIndex(team => team.includes(me.id)) : -1;
    const opponent = !recorder && mySide >= 0 && (recorderSide < 0 || mySide !== recorderSide);
    return {
      canConfirm: (match.status === 'pending' && (admin || opponent)) || (match.status === 'disputed' && admin),
      canObject: match.status === 'pending' && (admin || opponent),
      canEdit: match.status !== 'cancelled' && (admin || recorder),
      canCancel: match.status !== 'cancelled' && (admin || recorder)
    };
  }
  function publicGroup(group, actor) {
    ensure(group.users.includes(actor), '请先加入该战绩簿');
    const me = identity(group, actor);
    const admin = group.owner === actor;
    return {
      id: group.id, name: group.name, createdAt: group.createdAt, updatedAt: group.updatedAt,
      members: group.members.map(({ user, ...m }) => ({ ...m, claimed: Boolean(user) })),
      meId: me ? me.id : '', isAdmin: admin,
      claims: group.claims.filter(c => admin || c.user === actor).map(({ user, ...c }) => c),
      matches: group.matches.map(({ recordedBy, ...m }) => ({ ...m, ...permissions(group, { ...m, recordedBy }, actor) })),
      audit: group.audit.map(entry => {
        const item = clone(entry);
        if (item.before) delete item.before.recordedBy;
        return item;
      })
    };
  }
  function mutate(group, action, payload, actor, now, newId) {
    const g = clone(settlePending(group, now));
    const data = payload || {};
    const admin = g.owner === actor;
    ensure(actor, '请先登录');
    ensure(action === 'join' || g.users.includes(actor), '请先加入该战绩簿');
    const me = identity(g, actor);
    const audit = (kind, match, before, note) => g.audit.push({ id: newId, kind, matchId: match ? match.id : '', actorName: me ? me.name : '待认领成员', at: now, note: note || '', before: before || null });
    if (action === 'join') {
      ensure(g.users.includes(actor) || g.users.length < 150, '试用版每个战绩簿最多 150 个账号');
      if (!g.users.includes(actor)) g.users.push(actor);
    } else if (action === 'addMember' || action === 'addGuest') {
      ensure(action === 'addMember' ? admin : (me || admin), action === 'addMember' ? '只有管理员可维护球友名单' : '请先认领自己的球员身份');
      const name = cleanName(data.name);
      ensure(['male', 'female'].includes(data.gender), '请选择性别');
      ensure(!g.members.some(m => m.name === name), '已有同名球友，请增加可区分的名字');
      ensure(g.members.length < 100, '试用版最多支持 100 位球友');
      g.members.push({ id: newId, name, gender: data.gender, user: '', guest: action === 'addGuest' });
      audit(action, null, null, (action === 'addGuest' ? '新增临时队员 ' : '新增球友 ') + name);
    } else if (action === 'claim') {
      ensure(!me, '你已经绑定球员身份');
      const member = g.members.find(m => m.id === data.memberId);
      ensure(member && !member.guest && !member.user, '该球员已被认领、为临时队员或不存在');
      ensure(!g.claims.some(c => c.user === actor), '你已有待审核认领');
      g.claims.push({ id: newId, memberId: member.id, memberName: member.name, user: actor, at: now });
    } else if (action === 'approveClaim' || action === 'rejectClaim') {
      ensure(admin, '只有管理员可审核认领');
      const claim = g.claims.find(c => c.id === data.claimId);
      ensure(claim, '该申请已处理，请刷新');
      if (action === 'approveClaim') {
        const member = g.members.find(m => m.id === claim.memberId);
        ensure(member && !member.guest && !member.user && !identity(g, claim.user), '身份已绑定，请拒绝该申请');
        member.user = claim.user;
      }
      g.claims = g.claims.filter(c => c.id !== claim.id);
      audit(action, null, null, (action === 'approveClaim' ? '通过' : '拒绝') + '认领 ' + claim.memberName);
    } else if (action === 'record' || action === 'edit' || action === 'saveDraft') {
      ensure(me || admin, '请先认领自己的球员身份');
      const draft = action === 'saveDraft';
      const valid = validateMatch(data, g.members, now, draft);
      ensure(admin || valid.teams.flat().includes(me.id), '只能录入自己参加的比赛');
      const state = { status: draft ? 'draft' : 'pending', updatedAt: now, confirmationDueAt: draft ? null : now + CONFIRM_WINDOW };
      if (action === 'record' || (draft && !data.matchId)) {
        ensure(g.matches.length < 500, '试用版每个战绩簿最多保存 500 场，请先导出备份');
        const match = { ...valid, ...state, id: newId, revision: 1, recordedBy: actor, recorderName: me ? me.name : '管理员', createdAt: now };
        g.matches.push(match);
        audit(action, match, null, draft ? '暂存比赛草稿，尚未提交' : '提交比赛；24 小时无异议自动计分');
      } else {
        const match = g.matches.find(m => m.id === data.matchId);
        ensure(match && permissions(g, match, actor).canEdit, '无权修改这场比赛');
        ensure(!draft || match.status === 'draft', '已提交的成绩不能改为草稿，请修改后重新提交');
        ensure(data.revision === match.revision, '成绩已变化，请刷新后重试');
        const before = clone(match);
        Object.assign(match, valid, state, { revision: match.revision + 1, recordedBy: actor, recorderName: me ? me.name : '管理员' });
        delete match.bestOf;
        delete match.confirmedAt;
        delete match.confirmedByName;
        delete match.confirmationMethod;
        delete match.objectionNote;
        audit(action, match, before, draft ? '更新比赛草稿，尚未提交' : '提交成绩；重新开始 24 小时异议期限');
      }
    } else if (action === 'confirm' || action === 'cancel' || action === 'object') {
      const match = g.matches.find(m => m.id === data.matchId);
      ensure(match, '比赛不存在');
      ensure(data.revision === match.revision, '成绩已变化，请刷新后重试');
      ensure(permissions(g, match, actor)[{ confirm: 'canConfirm', cancel: 'canCancel', object: 'canObject' }[action]], action === 'confirm' ? '需由对方已认领球员或管理员确认' : action === 'object' ? '需由对方已认领球员或管理员提出异议，且在期限内' : '无权撤销这场比赛');
      const before = clone(match);
      match.status = { confirm: 'confirmed', cancel: 'cancelled', object: 'disputed' }[action];
      match.updatedAt = now;
      match.revision++;
      if (action === 'confirm') {
        match.confirmedAt = now;
        match.confirmedByName = me ? me.name : '管理员';
        match.confirmationMethod = 'manual';
      }
      if (action === 'object') {
        ensure(typeof data.reason === 'string' && data.reason.trim().length >= 1 && data.reason.trim().length <= 200, '请填写 1–200 字的异议原因');
        match.objectionNote = data.reason.trim();
      }
      audit(action, match, before, action === 'confirm' ? (admin ? '管理员确认成绩' : '对方确认成绩') : action === 'object' ? '提出异议，暂停计分：' + match.objectionNote : '撤销成绩；已重算后续积分');
    } else fail('不支持的操作');
    g.updatedAt = now;
    updateDeadline(g);
    return g;
  }
  function dateText(time) {
    const d = new Date(Number(time) + 8 * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return { date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) };
  }
  function matchView(match, group, deltas) {
    const names = Object.fromEntries(group.members.map(m => [m.id, m.name + (m.guest ? '（临时）' : '')]));
    const dt = dateText(match.playedAt);
    const due = dateText(confirmationDeadline(match));
    return { ...match, typeName: TYPES[match.type], dateText: dt.date.slice(5) + ' ' + dt.time, fullDateText: dt.date + ' ' + dt.time, deadlineText: due.date + ' ' + due.time, hasGuests: match.teams.flat().some(id => group.members.find(m => m.id === id).guest), teamA: match.teams[0].map(id => names[id]).join(' / '), teamB: match.teams[1].map(id => names[id]).join(' / '), gamesText: match.games.map(g => g.map(v => v === '' ? '—' : v).join(' : ')).join(' · '), resultText: match.wins.join(' : '), statusText: { draft: '草稿', confirmed: '已确认', pending: '待确认', disputed: '有异议', cancelled: '已撤销' }[match.status], deltaText: Object.entries((deltas || {})[match.id] || {}).map(([id, v]) => names[id] + ' ' + (v > 0 ? '+' : '') + v).join(' · ') };
  }
  return { TYPES, INITIAL, CONFIRM_WINDOW, confirmationDeadline, settlePending, score, rateTeams, gameWinner, suggestOpponentScore, validateMatch, buildStandings, ranking, createGroup, publicGroup, mutate, identity, permissions, seasonOf, dateText, matchView, clone };
});
