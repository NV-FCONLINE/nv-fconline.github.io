// 2대2·어워드 로컬 검증. 모든 계정·경기는 가상 데이터이며 외부 API·운영 DB에 접속하지 않는다.
// 실행: node tools/preview-duo.mjs / 종료: Ctrl+C 또는 20분 뒤 자동 종료.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const port = 8794;
const ids = Array.from({ length: 8 }, (_, i) => `00000000000000000${i + 1}`);
const members = ['하늘', '바람', '레오', '유성', '겨울', '노을', '구름', '새벽'].map((name, i) => ({ id: ids[i], name: `NV예시${name}` }));
const me = { id: ids[0], name: '예시하늘', is_staff: false, is_admin: false };
const now = Date.now();
const matches = [];
let index = 0;
function add(pairA, pairB, results) {
  for (const result of results) {
    index++;
    matches.push({ id: `example-${index}`, at: now - index * 2 * 3600000,
      teams: [{ ids: pairA.map(i => ids[i]), score: result === 'w' ? 3 : result === 'd' ? 1 : 0 },
        { ids: pairB.map(i => ids[i]), score: result === 'l' ? 2 : 1 }] });
  }
}
add([0, 1], [2, 3], 'wwdwwlwwww');
add([0, 4], [1, 5], 'wlwwdwlw');
add([0, 2], [4, 6], 'lwlwdw');
add([0, 7], [3, 5], 'ww');
add([1, 2], [4, 5], 'wwwdwlww');
add([2, 6], [3, 7], 'wlwdw');
add([4, 7], [1, 6], 'wwdlww');
add([3, 6], [5, 7], 'wwwwdl');
const duplicate = matches[0];
matches.push({ ...duplicate, teams: duplicate.teams.toReversed().map(t => ({ ...t, ids: t.ids.toReversed() })) });

const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const scenario = new URL(req.headers.referer || url, url).searchParams.get('scenario');
    const currentMe = scenario === 'no-me' ? { ...me, id: '000000000000000099', name: '기록없는예시' } : me;
    if (req.method === 'POST' && url.pathname === '/__stop') { json(res, 200, { ok: true }); stop(); return; }
    if (url.pathname === '/api/session' && req.method === 'POST') return json(res, 200, { token: 'local-preview-placeholder', me: currentMe, next: '#/stats/duo' });
    if (url.pathname === '/api/me') return json(res, 200, { me: currentMe });
    if (url.pathname === '/api/boards') return json(res, 200, { boards: [
      { slug: 'notice', name: '공지' }, { slug: 'free', name: '자유' }, { slug: 'ideas', name: '기능 제안' }
    ] });
    if (url.pathname === '/api/stats/duo') {
      if (scenario === 'error') return json(res, 503, { error: 'server' });
      return json(res, 200, { source: 'demo', members, matches: scenario === 'empty' ? [] : matches });
    }
    if (url.pathname === '/api/stats/awards') {
      const type = Number(url.searchParams.get('type') || 50);
      if (scenario === 'awards-error') return json(res, 503, { error: 'server' });
      const list = scenario === 'empty' ? [] : members.map((member, i) => ({
        rank: i < 2 ? 1 : i + 1, member: { discord_id: member.id, name: member.name, nickname: member.name, is_staff: false },
        played: 30 - i, avg_possession: (type === 52 ? [61, 61, 57, 55, 52, 50, 48, 0] : [65.2, 65.2, 60.4, 58.2, 55, 52, 45.1, 0])[i]
      }));
      const raw = members.map((member, i) => ({
        member: { discord_id: member.id, name: member.name, nickname: member.name, is_staff: false }, played: 30,
        draw: [6, 6, 3, 8, 9, 3, 2, 1][i], shots: [450, 450, 420, 360, 480, 300, 300, 270][i],
        gf: [90, 75, 87, 60, 80, 40, 45, 33][i] + (type === 52 ? 6 : 0),
        ga: [60, 75, 30, 45, 30, 18, 18, 21][i] + (type === 52 ? 3 : 0),
        heading_goals: [12, 12, 11, 7, 6, 3, 4, 2][i], heading_games: 30
      }));
      const memberList = (value, extras, low = false, digits = 2) => {
        const rows = scenario === 'empty' ? [] : raw.map(row => ({ member: row.member, played: row.played,
          value: Number(value(row).toFixed(digits)), ...extras(row) }))
          .sort((a, b) => (low ? a.value - b.value : b.value - a.value) || a.member.discord_id.localeCompare(b.member.discord_id));
        let rank = 0;
        return { count: rows.length, list: rows.map((row, i) => {
          if (!i || row.value !== rows[i - 1].value) rank = i + 1;
          return { ...row, rank };
        }) };
      };
      const awards = Object.fromEntries(['goals', 'assists', 'tackle', 'save', 'possession'].map(key => [key, { count: key === 'possession' ? list.length : 0, list: key === 'possession' ? list : [] }]));
      Object.assign(awards, {
        peace: memberList(r => r.draw * 100 / r.played, r => ({ draw: r.draw }), false, 1),
        shots: memberList(r => r.shots / r.played, r => ({ shots: r.shots })),
        heading: ['heading-pending', 'heading-empty'].includes(scenario) ? { count: 0, list: [] }
          : memberList(r => r.heading_goals / r.heading_games, r => ({ heading_goals: r.heading_goals, heading_games: r.heading_games })),
        bonfrere: memberList(r => (r.gf + r.ga) / r.played, r => ({ gf: r.gf, ga: r.ga })),
        low_conceded: memberList(r => r.ga / r.played, r => ({ ga: r.ga }), true)
      });
      if (scenario === 'cards') {
        const card = { rank: 1, spid: 101000190, pos: 25, grade: 8, apps: 30, goals: 20, assists: 12,
          tackle_try: 40, tackle: 30, gk_apps: 30, faced: 80, saved: 60, member: raw[0].member };
        for (const key of ['goals', 'assists', 'tackle', 'save']) awards[key] = { count: 1, list: [{ ...card, pos: key === 'save' ? 0 : key === 'tackle' ? 5 : 25 }] };
      }
      const payload = { type, updated_at: now, members_counted: scenario === 'cards' ? 1 : 0, possession_members_counted: list.length,
        member_awards_counted: list.length, min_member_games: 15,
        heading_coverage: { collected: scenario === 'heading-pending' ? 0 : list.length, total: list.length },
        min_possession_games: 15, rules: { min_apps: 15, min_tackles: 30, min_faced: 30, top: 10 },
        window: { size: 30, total: list.length, done: list.length, ready: true }, tackle_data: false,
        awards };
      if (scenario === 'old-awards') {
        for (const key of ['peace', 'shots', 'heading', 'bonfrere', 'low_conceded']) delete payload.awards[key];
        delete payload.member_awards_counted; delete payload.min_member_games; delete payload.heading_coverage;
      }
      return json(res, 200, payload);
    }
    const files = new Map([['/club/', ['club/index.html', 'text/html; charset=utf-8']],
      ['/club/index.html', ['club/index.html', 'text/html; charset=utf-8']],
      ['/club/demo/duo.json', ['club/demo/duo.json', 'application/json; charset=utf-8']],
      ['/assets/nv-mark.png', ['assets/nv-mark.png', 'image/png']], ['/favicon-32.png', ['favicon-32.png', 'image/png']]]);
    const file = files.get(url.pathname);
    if (!file) return json(res, 404, { error: 'not_found' });
    const body = await readFile(new URL(file[0], root));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }); res.end(body);
  } catch { json(res, 500, { error: 'preview_error' }); }
});
function stop() {
  server.close();
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 500).unref();
}
const expiry = setTimeout(stop, 20 * 60000);
server.on('close', () => { clearTimeout(expiry); process.exit(0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
server.listen(port, '127.0.0.1', () => console.log(`예시 데이터 시안: http://127.0.0.1:${port}/club/?api=http%3A%2F%2F127.0.0.1%3A${port}&duo=preview#ticket=preview`));
