/* NV 클럽 공간 — 자동 스쿼드 편성 계산(브라우저 Web Worker). 서버로 아무것도 보내지 않는다.
   받는 것: 포메이션 11자리(포지션 그룹), 후보 카드(데이터센터 1강 기준 포지션 OVR·급여·강화별 시세), 예산·급여 상한·강화 범위,
   팀컬러 최소 인원, 랭커 픽 비중.
   점수 = 그 자리 OVR(1강 OVR + 강화 보너스) + 랭커 픽 가산점. 같은 선수(시즌만 다른 카드 포함)는 한 번만.
   1) 탐욕 + 바꿔 끼우기로 빨리 한 번 짜고  2) 분기 한정(남은 자리 최대 점수를 급여·예산·팀컬러로 묶은 상한)으로
   정해진 시간 안에서 더 좋은 답을 찾는다. 시간 안에 다 보면 '최적 확인', 아니면 그때까지 가장 좋은 답. */
'use strict';

const BONUS = [0, 0, 1, 2, 4, 6, 8, 11, 15, 17, 19, 21, 24, 27]; // 강화 단계별 OVR(1강 대비)
const K = 220; // 자리마다 남길 후보 수(처음, 합성 시험에서 0.2초 안). 못 짜면 K_WIDE로 다시
const K_WIDE = 600;

function rankerBonus(card, group, req) {
  const w = req.ranker === 2 ? 2 : req.ranker === 1 ? 1 : 0;
  if (!w || !card.rk || !(group in card.rk)) return 0;
  const top = req.rkTop && req.rkTop[group] ? req.rkTop[group] : 1;
  return w * (1 + 2.5 * Math.min(1, card.rk[group] / top));
}

// 그룹마다 한 번: (카드 × 강화 단계) 후보를 만들고 줄인다.
// 버리는 기준: 모든 면(점수·급여·가격·팀컬러)에서 자기보다 나은 후보가 '서로 다른 선수'로 자리 수(11)만큼 있을 때.
// 그러면 어떤 답에서 이 후보를 쓰든, 다른 자리가 쓰지 않은 선수 하나로 바꿔도 손해가 없다(같은 선수 제약까지 지킴).
// 남은 것이 k보다 많으면 절반은 점수 순, 절반은 가격 순으로 고르게 추리고 thinned 표시(그러면 '최적 확인'이라 하지 않음)
function groupList(cards, group, req, k) {
  const list = [];
  for (const c of cards) {
    const o = c.pos && c.pos[group];
    if (!(o > 0)) continue;
    if (c.pay > req.cap) continue;
    const rb = rankerBonus(c, group, req);
    for (let g = req.gmin; g <= req.gmax; g++) {
      const price = c.bp ? c.bp[g - 1] : null;
      // 시세가 없는 단계(null)는 공짜가 아니라 '살 수 없음'으로 본다
      if (typeof price !== 'number' || !(price >= 0) || price > req.budget) continue;
      list.push({ spid: c.spid, pid: c.pid, g, ovr: o + BONUS[g], sc: o + BONUS[g] + rb, pay: c.pay, price, col: c.tc ? 1 : 0 });
    }
  }
  list.sort((a, b) => b.sc - a.sc || a.price - b.price || a.pay - b.pay);
  const need = req.slots.length;
  const kept = [];
  for (const x of list) {
    const dp = new Set();
    for (const y of kept) {
      if (y.col >= x.col && y.sc >= x.sc && y.pay <= x.pay && y.price <= x.price) { dp.add(y.pid); if (dp.size >= need) break; }
    }
    if (dp.size < need) kept.push(x);
  }
  if (kept.length <= k) return kept;
  const top = kept.slice(0, k >> 1);
  const rest = kept.slice(k >> 1).sort((a, b) => a.price - b.price);
  const m = k - top.length;
  // 가격 순 표본은 양 끝(가장 싼 것·가장 비싼 것)까지 닿게
  const out = top.concat(Array.from({ length: m }, (_, j) => rest[m > 1 ? Math.round((j * (rest.length - 1)) / (m - 1)) : 0]));
  const inOut = new Set(out);
  const add = (x) => { if (!inOut.has(x)) { inOut.add(x); out.push(x); } };
  // 급여 상한이 빡빡할 때 필요한 후보: 가격을 빼고(점수·급여·팀컬러만) 같은 '서로 다른 11명' 규칙으로 안 밀리는 것
  const front = [];
  for (const x of kept) {
    const dp = new Set();
    for (const y of front) if (y.col >= x.col && y.sc >= x.sc && y.pay <= x.pay) { dp.add(y.pid); if (dp.size >= need) break; }
    if (dp.size < need) { front.push(x); add(x); }
  }
  // 급여가 가장 낮은 서로 다른 선수 11명(급여 최소값이 늘 남게)
  { const seen = new Set(); for (const x of kept.slice().sort((a, b) => a.pay - b.pay || b.sc - a.sc)) { if (seen.size >= need) break; if (seen.has(x.pid)) continue; seen.add(x.pid); add(x); } }
  // 팀컬러 조건이 있으면 팀컬러 선수마다 위쪽 두 단계는 꼭 남긴다
  if (req.colourMin > 0) {
    const per = new Map();
    for (const x of kept) if (x.col && (per.get(x.pid) || 0) < 2) { per.set(x.pid, (per.get(x.pid) || 0) + 1); add(x); }
  }
  out.sort((a, b) => b.sc - a.sc);
  out.thinned = true;
  out.full = kept; // 못 짠 이유(whyNot)는 추리기 전 목록으로 따진다
  return out;
}

function greedyLS(slots, req) {
  const n = slots.length;
  const cur = new Array(n);
  const used = new Set();
  for (let s = 0; s < n; s++) {
    const x = slots[s].find((y) => !used.has(y.pid));
    if (!x) return null;
    cur[s] = x; used.add(x.pid);
  }
  const tot = () => cur.reduce((a, x) => ({ sc: a.sc + x.sc, pay: a.pay + x.pay, price: a.price + x.price, col: a.col + x.col }), { sc: 0, pay: 0, price: 0, col: 0 });
  const over = (t) => Math.max(0, t.pay - req.cap) / req.cap + Math.max(0, t.price - req.budget) / Math.max(1, req.budget) + Math.max(0, req.colourMin - t.col) / 11;
  for (let it = 0; it < 300; it++) {
    const t = tot();
    const ov = over(t);
    if (ov === 0) break;
    let bestR = -1, bs = -1, bx = null;
    for (let s = 0; s < n; s++) for (const x of slots[s]) {
      if (x === cur[s] || (used.has(x.pid) && cur[s].pid !== x.pid)) continue;
      const t2 = { pay: t.pay - cur[s].pay + x.pay, price: t.price - cur[s].price + x.price, col: t.col - cur[s].col + x.col };
      const gain = ov - over(t2);
      if (gain <= 0) continue;
      const r = gain / Math.max(0.01, cur[s].sc - x.sc);
      if (r > bestR) { bestR = r; bs = s; bx = x; }
    }
    if (bs < 0) return null;
    used.delete(cur[bs].pid); cur[bs] = bx; used.add(bx.pid);
  }
  if (over(tot()) > 0) return null;
  const feasible = (t) => t.pay <= req.cap && t.price <= req.budget && t.col >= req.colourMin;
  let improved = true, passes = 0;
  while (improved && passes++ < 60) {
    improved = false;
    const t = tot();
    for (let s = 0; s < n && !improved; s++) for (const x of slots[s]) {
      if (x.sc <= cur[s].sc || (used.has(x.pid) && cur[s].pid !== x.pid)) continue;
      const t2 = { pay: t.pay - cur[s].pay + x.pay, price: t.price - cur[s].price + x.price, col: t.col - cur[s].col + x.col };
      if (!feasible(t2)) continue;
      used.delete(cur[s].pid); cur[s] = x; used.add(x.pid); improved = true; break;
    }
    if (improved) continue;
    const T = 30;
    outer: for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const A = slots[a].slice(0, T), Bl = slots[b].slice(0, T);
      for (const x of A) for (const y of Bl) {
        if (x.pid === y.pid) continue;
        if (x.sc + y.sc - cur[a].sc - cur[b].sc <= 1e-9) continue;
        const others = (p) => used.has(p) && p !== cur[a].pid && p !== cur[b].pid;
        if (others(x.pid) || others(y.pid)) continue;
        const t2 = { pay: t.pay - cur[a].pay - cur[b].pay + x.pay + y.pay, price: t.price - cur[a].price - cur[b].price + x.price + y.price, col: t.col - cur[a].col - cur[b].col + x.col + y.col };
        if (!feasible(t2)) continue;
        used.delete(cur[a].pid); used.delete(cur[b].pid); cur[a] = x; cur[b] = y; used.add(x.pid); used.add(y.pid);
        improved = true; break outer;
      }
    }
  }
  return { best: tot().sc, pick: cur.slice() };
}

// 분기 한정. 상한 = min(급여·가격, 급여·팀컬러, 가격·팀컬러 세 가지 완화 DP) — 같은 선수 제약만 빼고 푼 값이라 늘 실제 이상
function exact(slots, req, warm, ms) {
  const tIn = Date.now();
  const n = slots.length;
  const order = [...slots.keys()].sort((a, b) => slots[a].length - slots[b].length);
  const S = order.map((i) => slots[i]);
  const cap = req.cap, B = 100, budget = req.budget, unit = budget / B, NEED = req.colourMin;
  const NEG = -1e18;
  const C1 = cap + 1, B1 = B + 1, K1 = NEED + 1;
  const q = S.map((L) => L.map((x) => Math.min(B, Math.floor(x.price / unit))));
  const Dpp = [], Dpc = [], Dbc = [];
  Dpp[n] = new Float64Array(C1 * B1);
  Dpc[n] = new Float64Array(C1 * K1).fill(NEG); for (let p = 0; p < C1; p++) Dpc[n][p * K1] = 0;
  Dbc[n] = new Float64Array(B1 * K1).fill(NEG); for (let b = 0; b < B1; b++) Dbc[n][b * K1] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const L = S[i], Q = q[i];
    const pp = new Float64Array(C1 * B1).fill(NEG), np = Dpp[i + 1];
    for (let j = 0; j < L.length; j++) {
      const x = L[j], qx = Q[j], sc = x.sc, py = x.pay;
      for (let p = py; p < C1; p++) {
        const rowN = (p - py) * B1, row = p * B1;
        for (let b = qx; b < B1; b++) { const v = np[rowN + b - qx]; if (v > NEG / 2 && v + sc > pp[row + b]) pp[row + b] = v + sc; }
      }
    }
    Dpp[i] = pp;
    const pc = new Float64Array(C1 * K1).fill(NEG), nc = Dpc[i + 1];
    const bc = new Float64Array(B1 * K1).fill(NEG), nb = Dbc[i + 1];
    for (let j = 0; j < L.length; j++) {
      const x = L[j], qx = Q[j];
      for (let k = 0; k < K1; k++) {
        const k2 = Math.max(0, k - x.col);
        for (let p = x.pay; p < C1; p++) { const v = nc[(p - x.pay) * K1 + k2]; if (v > NEG / 2 && v + x.sc > pc[p * K1 + k]) pc[p * K1 + k] = v + x.sc; }
        for (let b = qx; b < B1; b++) { const v = nb[(b - qx) * K1 + k2]; if (v > NEG / 2 && v + x.sc > bc[b * K1 + k]) bc[b * K1 + k] = v + x.sc; }
      }
    }
    Dpc[i] = pc; Dbc[i] = bc;
  }
  // 가격 칸은 내림으로 나눠서 상한이 실제보다 작아지지 않는다
  const bound = (i, payLeft, priceLeft, need) => {
    const b = Math.min(B, Math.floor(priceLeft / unit)), k = Math.max(0, need);
    return Math.min(Dpp[i][payLeft * B1 + b], Dpc[i][payLeft * K1 + k], Dbc[i][b * K1 + k]);
  };
  let best = warm ? warm.best : NEG;
  let bestPick = null;
  if (warm) { bestPick = new Array(n); for (let i = 0; i < n; i++) bestPick[i] = warm.pick[order[i]]; }
  let nodes = 0, stopped = false;
  const t0 = tIn;
  const pick = new Array(n), used = new Set();
  function dfs(i, sc, pay, price, col) {
    if (stopped) return;
    if (((++nodes) & 2047) === 0 && Date.now() - t0 > ms) { stopped = true; return; }
    if (i === n) { if (col >= NEED && sc > best + 1e-9) { best = sc; bestPick = pick.slice(); } return; }
    const L = S[i], ch = [];
    for (let j = 0; j < L.length; j++) {
      const x = L[j];
      if (pay + x.pay > cap || price + x.price > budget || used.has(x.pid)) continue;
      const ub = sc + x.sc + bound(i + 1, cap - pay - x.pay, budget - price - x.price, NEED - col - x.col);
      if (ub > best + 1e-9) ch.push([ub, x]);
    }
    ch.sort((a, b) => b[0] - a[0]);
    for (const [ub, x] of ch) {
      if (ub <= best + 1e-9 || stopped) break;
      used.add(x.pid); pick[i] = x;
      dfs(i + 1, sc + x.sc, pay + x.pay, price + x.price, col + x.col);
      used.delete(x.pid);
    }
  }
  const root = bound(0, cap, budget, NEED);
  if (root > NEG / 2) dfs(0, 0, 0, 0, 0);
  let out = null;
  if (bestPick) { out = new Array(n); for (let i = 0; i < n; i++) out[order[i]] = bestPick[i]; }
  return { best, pick: out, proven: !stopped, nodes, root };
}

// 왜 못 짰는지: 자리마다 가장 싼 급여·가격의 합과 비교
function whyNot(slots, req) {
  if (slots.some((L) => !L.length)) return { reason: 'empty', groups: [...new Set(req.slots.filter((s, i) => !slots[i].length).map((s) => s.group))] };
  const minPay = slots.reduce((a, L) => a + Math.min(...L.map((x) => x.pay)), 0);
  const minPrice = slots.reduce((a, L) => a + Math.min(...L.map((x) => x.price)), 0);
  if (minPay > req.cap) return { reason: 'pay', minPay };
  if (minPrice > req.budget) return { reason: 'budget', minPrice };
  if (req.colourMin > 0) {
    const colSlots = slots.filter((L) => L.some((x) => x.col)).length;
    if (colSlots < req.colourMin) return { reason: 'colour', colSlots };
  }
  return { reason: 'mix', minPay, minPrice };
}

function solve(req) {
  const t0 = Date.now();
  req.budget = req.budget > 0 && Number.isFinite(req.budget) ? req.budget : 1e18;
  req.colourMin = req.colourMin | 0;
  req.rkTop = {};
  for (const c of req.cards) if (c.rk) for (const g of Object.keys(c.rk)) req.rkTop[g] = Math.max(req.rkTop[g] || 0, c.rk[g]);
  const timeMs = req.timeMs || 1500;
  const attempt = (k, until) => {
    const lists = new Map();
    const slots = req.slots.map((s) => {
      if (!lists.has(s.group)) lists.set(s.group, groupList(req.cards, s.group, req, k));
      return lists.get(s.group);
    });
    const thinned = [...lists.values()].some((L) => L.thinned);
    const warm = slots.every((L) => L.length) ? greedyLS(slots, req) : null;
    const ex = slots.every((L) => L.length) ? exact(slots, req, warm, Math.max(150, until - Date.now())) : { pick: null, proven: false };
    return { lists, slots, thinned, warm, ex, pick: ex.pick || (warm && warm.pick) };
  };
  const scoreOf = (pk) => (pk ? pk.reduce((sum, x) => sum + x.sc, 0) : -Infinity);
  let a = attempt(K, t0 + Math.round(timeMs * 0.6));
  // 추린 후보로 못 짰거나 시간이 넉넉히 남았으면 넓게 다시 보고 더 좋은 쪽을 쓴다
  if (a.thinned && (!a.pick || Date.now() - t0 < timeMs * 0.4)) {
    const b = attempt(K_WIDE, t0 + timeMs);
    if (!a.pick || scoreOf(b.pick) > scoreOf(a.pick) + 1e-9) a = b;
  }
  const { lists, slots, thinned, warm, ex, pick } = a;
  const prepMs = Date.now() - t0;
  if (!pick) return { ok: false, ...whyNot(slots.map((L) => L.full || L), req), proven: !!ex.proven, thinned, ms: Date.now() - t0 };
  const total = pick.reduce((a, x) => ({ ovr: a.ovr + x.ovr, sc: a.sc + x.sc, pay: a.pay + x.pay, price: a.price + x.price, col: a.col + x.col }), { ovr: 0, sc: 0, pay: 0, price: 0, col: 0 });
  return {
    ok: true,
    pick: pick.map((x) => ({ spid: x.spid, g: x.g, ovr: x.ovr, sc: Math.round(x.sc * 10) / 10, pay: x.pay, price: x.price, col: x.col })),
    total, proven: !!ex.proven, thinned, warmGap: warm ? Math.round((total.sc - warm.best) * 10) / 10 : null,
    sizes: [...lists.entries()].map(([g, L]) => [g, L.length]), prepMs, ms: Date.now() - t0,
  };
}

if (typeof self !== 'undefined') {
  // 요청마다 id를 받아 그대로 돌려준다(화면이 겹친 계산의 답을 섞지 않게)
  self.onmessage = (e) => {
    const { id, req } = e.data || {};
    let r;
    try { r = solve(req); } catch (err) { r = { ok: false, reason: 'error', message: String(err && err.message || err) }; }
    self.postMessage({ id, r });
  };
}
