/* 스쿼드 편의 기능의 순수 계산. 브라우저와 가짜 자료 시험에서 함께 쓴다. */
(function (root) {
  'use strict';
  const POS = ['GK', 'SW', 'RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB', 'RDM', 'CDM', 'LDM', 'RM', 'RCM', 'CM', 'LCM', 'LM', 'RAM', 'CAM', 'LAM', 'RF', 'CF', 'LF', 'RW', 'RS', 'ST', 'LS', 'LW'];
  const GROUP = { GK:'GK', SW:'CB', RWB:'RWB', RB:'RB', RCB:'CB', CB:'CB', LCB:'CB', LB:'LB', LWB:'LWB', RDM:'CDM', CDM:'CDM', LDM:'CDM', RM:'RM', RCM:'CM', CM:'CM', LCM:'CM', LM:'LM', RAM:'CAM', CAM:'CAM', LAM:'CAM', RF:'CF', CF:'CF', LF:'CF', RW:'RW', RS:'ST', ST:'ST', LS:'ST', LW:'LW' };
  function applyGrades(squad, grade, includeBench) {
    if (!Number.isInteger(grade) || grade < 1 || grade > 13) throw new RangeError('강화 단계는 1~13이에요.');
    const change = (p) => p ? { ...p, grade } : null;
    return { ...squad, slots: squad.slots.map(change), bench: includeBench ? squad.bench.map(change) : squad.bench.slice() };
  }
  function mapLineup(players, formations) {
    if (!Array.isArray(players) || players.length !== 11 || players.some(p => !p || !Number.isSafeInteger(p.spid) || p.spid <= 0) || new Set(players.map(p => p.spid)).size !== 11) throw new TypeError('선발 11명을 확인하지 못했어요.');
    const roleOf = p => p.position != null && p.position !== '' && Number.isInteger(Number(p.position)) ? POS[Number(p.position)] || p.role || '' : p.role || '';
    if (players.filter(p => roleOf(p) === 'GK').length !== 1) throw new TypeError('골키퍼 한 명을 포함한 선발을 확인해 주세요.');
    let best = null;
    for (const [formation, lines] of Object.entries(formations)) {
      const roles = ['GK', ...lines.flat()];
      if (roles.length !== 11) continue;
      const remaining = players.map(p => ({ p, role: roleOf(p), used: false }));
      const slots = Array(11).fill(null);
      let score = 0;
      const take = (test, points) => roles.forEach((role, i) => {
        if (slots[i]) return;
        const hit = remaining.find(x => !x.used && test(x, role));
        if (hit) { slots[i] = hit.p; hit.used = true; score += points; }
      });
      take((x, role) => x.role === role, 100);
      take((x, role) => GROUP[x.role] && GROUP[x.role] === GROUP[role], 20);
      take((x, role) => x.p.pos && Number.isFinite(x.p.pos[GROUP[role]]), 1);
      take(() => true, 0);
      if (!best || score > best.score) best = { formation, slots, score };
    }
    if (!best) throw new TypeError('선발을 배치할 포메이션이 없어요.');
    return best;
  }
  root.NVSquadTools = Object.freeze({ applyGrades, mapLineup });
})(globalThis);
