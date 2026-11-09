import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../club/index.html', import.meta.url), 'utf8');
const source = html.match(/\/\* DUO_MODEL_START[\s\S]*?\*\/([\s\S]*?)\/\* DUO_MODEL_END \*\//)?.[1];
assert.ok(source, '2대2 집계 함수를 찾을 수 있어야 함');
const context = vm.createContext({});
vm.runInContext(source, context);
const build = vm.runInContext('buildDuoStats', context);
const now = Date.UTC(2026, 10, 9, 8);
const members = ['a', 'b', 'c', 'd'].map(id => ({ id, name: `예시${id}` }));
const match = (id, score = [2, 1], days = 0) => ({ id, at: now - days * 86400000,
  teams: [{ ids: ['a', 'b'], score: score[0] }, { ids: ['c', 'd'], score: score[1] }] });
const stats = (matches, opts = {}, roster = members) => build({ members: roster, matches }, { now, ...opts });
const player = (s, id) => s.players.find(p => p.key === id);
const pair = (s, a = 'a', b = 'b') => s.pairs.find(p => p.ids.includes(a) && p.ids.includes(b));

test('승·무·패와 무승부를 포함한 승률을 양쪽 팀에 집계', () => {
  const s = stats([match('w'), match('d', [1, 1]), match('l', [0, 1])]);
  const a = player(s, 'a');
  assert.deepEqual([a.played, a.win, a.draw, a.lose, a.winRate], [3, 1, 1, 1, 33.3]);
  assert.equal(pair(s).winRate, 33.3);
  assert.equal(player(s, 'c').lose, 1);
});

test('A+B/B+A, 팀 순서가 뒤집힌 같은 경기는 한 번만 집계', () => {
  const m = match('same');
  const inverted = { ...m, teams: m.teams.toReversed().map(t => ({ ...t, ids: t.ids.toReversed() })) };
  const s = stats([m, inverted, m]);
  assert.equal(s.matches.length, 1);
  assert.equal(s.pairs.length, 2);
  assert.equal(pair(s).played, 1);
});

test('같은 경기 번호에 서로 다른 점수·시각·참가자가 오면 그 경기 제외', () => {
  for (const altered of [match('bad', [9, 0]), match('bad', [2, 1], 1),
    { ...match('bad'), teams: [{ ids: ['a', 'z'], score: 2 }, { ids: ['c', 'd'], score: 1 }] }]) {
    const s = stats([match('bad'), altered, match('bad')]);
    assert.equal(s.matches.length, 0);
    assert.equal(s.ignored, 1);
  }
});

test('미래·28일 초과·잘못된 팀/인원/점수 제외, 28일 경계는 포함', () => {
  const bad = [match('old', [1, 0], 29), { ...match('future'), at: now + 1 },
    { ...match('teams'), teams: [] },
    { ...match('repeat'), teams: [{ ids: ['a', 'a'], score: 1 }, { ids: ['c', 'd'], score: 0 }] },
    match('negative', [-1, 0]), match('fraction', [1.5, 0]), match('string', ['1', 0]),
    { ...match('time'), at: '2026-11-09' }, { ...match('id'), id: 123 }, null];
  const s = stats([...bad, match('boundary', [1, 0], 28)]);
  assert.equal(s.matches.length, 1);
  assert.equal(s.matches[0].id, 'boundary');
  assert.equal(s.ignored, bad.length);
});

test('개인·조합마다 최신 30경기만 별도로 집계', () => {
  const games = Array.from({ length: 35 }, (_, i) => match(`g${i}`, i < 30 ? [1, 0] : [0, 1], i / 2));
  for (let i = 0; i < 7; i++) games.push({ ...match(`other${i}`, [0, 1], i / 10),
    teams: [{ ids: ['a', 'c'], score: 0 }, { ids: ['b', 'd'], score: 1 }] });
  const s = stats(games.toReversed());
  assert.equal(pair(s).played, 30);
  assert.equal(pair(s).win, 30);
  assert.equal(player(s, 'a').played, 30);
  assert.equal(player(s, 'a').win, 23);
  assert.equal(pair(s, 'a', 'c').played, 7);
});

test('5경기 미만 100% 조합은 정식 순위 아래 참고 기록으로 표시', () => {
  const games = Array.from({ length: 5 }, (_, i) => match(`rank${i}`, i < 3 ? [1, 0] : [0, 1], i));
  games.push({ ...match('reference'), teams: [{ ids: ['a', 'c'], score: 1 }, { ids: ['b', 'd'], score: 0 }] });
  const s = stats(games);
  assert.equal(pair(s).rank, 1);
  assert.equal(pair(s, 'a', 'c').rank, null);
  assert.equal(s.pairs[0].eligible, true);
  assert.equal(s.pairs.at(-2).winRate, 100);
});

test('승률이 같으면 경기 수로 정렬, 둘 다 같으면 공동 순위', () => {
  const s = stats(Array.from({ length: 5 }, (_, i) => match(`tie${i}`, i < 3 ? [1, 0] : [0, 1])));
  assert.deepEqual(s.players.map(p => p.rank).join(','), '1,1,3,3');
  const t = stats([match('one'), match('two', [1, 0], 1),
    { ...match('three'), teams: [{ ids: ['a', 'c'], score: 1 }, { ids: ['b', 'd'], score: 0 }] }], { minGames: 1 });
  assert.equal(t.pairs[0].played, 2);
});

test('외부 참가자와 뛴 개인 기록은 포함, 클럽원 조합으로는 세지 않음', () => {
  const s = stats([match('guest')], {}, [members[0], members[1], { ...members[2], active: false }]);
  assert.equal(s.players.length, 2);
  assert.equal(s.pairs.length, 1);
  const t = stats([match('external')], {}, [members[0]]);
  assert.equal(player(t, 'a').played, 1);
  assert.equal(t.pairs.length, 0);
  assert.equal(stats([match('none')], {}, []).matches.length, 0);
});

test('동명이인도 계정 번호로 구분하고 원본 배열·경기 데이터를 바꾸지 않음', () => {
  const roster = members.map(p => ({ ...p, name: '같은이름' }));
  const input = { members: roster, matches: [match('one')] };
  const before = JSON.stringify(input);
  const s = build(input, { now });
  assert.equal(s.players.length, 4);
  assert.notEqual(s.players[0].key, s.players[1].key);
  assert.equal(JSON.stringify(input), before);
});

test('빈 입력은 오류 없이 빈 목록 반환', () => {
  for (const input of [undefined, null, {}, { members: null, matches: 'bad' }]) {
    const s = build(input, { now });
    assert.equal(s.players.length, 0);
    assert.equal(s.pairs.length, 0);
  }
});

test('공개 기본 경로는 실제 개인 랭킹을 조회하고 가상 조합은 별도 예시에서만 표시', () => {
  const live = html.slice(html.indexOf('async function renderDuoLive(seq)'), html.indexOf('async function renderDuo(seq'));
  const demo = html.slice(html.indexOf('async function renderDuo(seq'), html.indexOf('const RANK_CATS'));
  assert.match(html, /if \(hsh === '#\/stats\/duo' \|\| hsh === '#\/stats\/duo\/demo'\)/);
  assert.match(demo, /if \(!demo\) return renderDuoLive\(seq\)/);
  assert.match(live, /await api\('\/api\/stats\/duo'\)/);
  assert.match(live, /next\?\.source !== 'nexon-website'/);
  assert.match(live, /attempt < 12/);
  assert.match(live, /if \(stale\(seq\)\) return;\s*const next = await api/);
  assert.doesNotMatch(live, /buildDuoStats|example_member_id|최근 30경기/);
  assert.match(demo, /fetch\('demo\/duo.json', \{ cache: 'no-store' \}\)/);
  assert.match(demo, /const meId = data.example_member_id/);
  assert.match(demo, /실제 전적이 아닙니다/);
});

test('공개 예시 데이터는 가상 계정이며 상대 시각으로 매번 같은 범위 집계', () => {
  const fixture = JSON.parse(readFileSync(new URL('../club/demo/duo.json', import.meta.url), 'utf8'));
  assert.equal(fixture.source, 'demo');
  assert.ok(fixture.members.every(m => m.name.startsWith('NV예시') && m.id.startsWith('example-')));
  const matches = fixture.matches.map(m => ({ ...m, at: now - m.age_hours * 3600000 }));
  const s = build({ ...fixture, matches }, { now });
  assert.equal(s.ignored, 0);
  assert.equal(s.matches.length, 51);
  assert.equal(player(s, fixture.example_member_id).played, 26);
});
