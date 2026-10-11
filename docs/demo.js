(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domain'));
  else root.BadmintonDemo = factory(root.Badminton);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  function create(now) {
    const group = D.createGroup('周末羽球俱乐部', 'demo-1', '阿泽', 'male', 'DEMO2026', now);
    group.members = ['阿泽', '子昂', '嘉树', '亦辰', '小雨', '可可', '宁宁', '安然'].map((name, i) => ({ id: 'p' + (i + 1), name, gender: i < 4 ? 'male' : 'female', user: 'demo-' + (i + 1) }));
    group.users = group.members.map(m => m.user);
    const fixtures = [
      ['singles', [['p1'], ['p2']]], ['doubles', [['p1', 'p3'], ['p2', 'p4']]],
      ['mixed', [['p1', 'p5'], ['p2', 'p6']]], ['mixed', [['p3', 'p7'], ['p4', 'p8']]],
      ['singles', [['p3'], ['p4']]], ['doubles', [['p1', 'p4'], ['p2', 'p3']]],
      ['mixed', [['p2', 'p7'], ['p3', 'p5']]], ['mixed', [['p1', 'p8'], ['p4', 'p6']]]
    ];
    for (let i = 0; i < 24; i++) {
      const [type, teams] = fixtures[i % fixtures.length];
      const target = i % 2 ? 21 : 15;
      const game = i % 5 === 0 ? [target - 3, target] : [target, target - 4];
      const playedAt = now - (25 - i) * 8 * 3600000;
      const valid = D.validateMatch({ type, teams, target, bestOf: 1, rule: 'sudden', cap: target, ranked: true, games: [game], playedAt }, group.members, now);
      group.matches.push({ ...valid, id: 'demo-' + String(i).padStart(3, '0'), status: 'confirmed', revision: 2, recordedBy: 'demo-1', recorderName: '阿泽', createdAt: playedAt, updatedAt: playedAt, confirmedAt: playedAt, confirmedByName: '子昂' });
    }
    const pending = D.validateMatch({ type: 'mixed', teams: [['p1', 'p5'], ['p2', 'p6']], target: 21, bestOf: 3, rule: 'deuce', cap: 30, ranked: true, games: [[21, 18], [17, 21], [22, 20]], playedAt: now - 3600000 }, group.members, now);
    group.matches.push({ ...pending, id: 'demo-pending', status: 'pending', revision: 1, recordedBy: 'demo-2', recorderName: '子昂', createdAt: now - 3600000, updatedAt: now - 3600000 });
    return group;
  }
  return { create };
});
