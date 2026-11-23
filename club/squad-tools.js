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
  const styles = [
    { id:'control', name:'연결하며 만드는 공격', formation:'4-2-3-1', other:'4-3-3(2)', text:'중앙과 2선에 패스 받을 선수를 두는 구성이 잘 맞아요. 공을 받아 주는 미드필더와 짧은 패스 선택지를 먼저 살펴보세요.' },
    { id:'wide', name:'측면에서 여는 공격', formation:'4-3-3', other:'4-2-1-3', text:'윙어가 넓게 벌리고 풀백이 도와주는 구성을 추천해요. 측면 돌파 뒤 컷백과 반대편 침투를 함께 노려 보세요.' },
    { id:'direct', name:'빠르게 전진하는 공격', formation:'4-2-2-2', other:'5-2-3', text:'공을 되찾은 뒤 전방으로 빠르게 연결하는 구성이 잘 맞아요. 침투하는 공격수와 그 뒤를 받칠 수비형 미드필더를 먼저 골라 보세요.' },
    { id:'pair', name:'두 공격수가 함께 만드는 공격', formation:'4-1-2-1-2(2)', other:'4-4-2(2)', text:'투톱의 원투 패스와 역할 분담을 살릴 수 있는 구성이에요. 연계하는 선수와 뒷공간을 노리는 선수를 한 명씩 두면 선택지가 늘어요.' },
  ];
  const questions = [
    { text:'공격을 시작할 때 편한 방식은?', choices:[
      { text:'미드필더끼리 짧게 연결하며 올라가기', points:{control:3} },
      { text:'공을 측면으로 보내 넓게 전개하기', points:{wide:3} },
      { text:'전방 공격수에게 빠르게 보내기', points:{direct:3,pair:1} },
    ] },
    { text:'공격진은 어떤 구성이 편한가요?', choices:[
      { text:'원톱 아래에 패스를 받아 줄 2선', points:{control:2} },
      { text:'가운데 공격수와 양쪽 윙어', points:{wide:2} },
      { text:'서로 주고받는 두 명의 공격수', points:{pair:4,direct:1} },
    ] },
    { text:'공을 되찾은 직후 먼저 하고 싶은 것은?', choices:[
      { text:'안전한 패스로 공격 대형 갖추기', points:{control:2} },
      { text:'넓은 쪽의 동료에게 연결하기', points:{wide:2} },
      { text:'수비가 돌아오기 전에 침투 패스하기', points:{direct:3,pair:1} },
    ] },
    { text:'골 앞에서 자주 노리는 방법은?', choices:[
      { text:'중앙에서 패스를 한 번 더 주고받기', points:{control:2,pair:1} },
      { text:'측면 돌파 뒤 컷백이나 크로스', points:{wide:3} },
      { text:'공격수끼리 움직이며 빈 공간 만들기', points:{pair:3,direct:1} },
    ] },
  ];
  function scoreAnswers(answers) {
    if (!Array.isArray(answers) || answers.length !== questions.length || answers.some((n, i) => !Number.isInteger(n) || !questions[i].choices[n])) throw new TypeError('질문마다 답을 하나 골라 주세요.');
    const points = Object.fromEntries(styles.map(s => [s.id, 0]));
    answers.forEach((n,i) => Object.entries(questions[i].choices[n].points).forEach(([k,v]) => { points[k] += v; }));
    const ordered = styles.map((s,i) => ({...s, points:points[s.id], order:i})).sort((a,b) => b.points-a.points || a.order-b.order);
    return { ...ordered[0], alternatives: ordered.slice(1), scores: points };
  }
  root.NVSquadTools = Object.freeze({ applyGrades, mapLineup, questions, scoreAnswers });
})(globalThis);
