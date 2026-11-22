// Real HLS controller with synthetic DOM/media/library objects. No network or real stream is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../club/football-player.js', import.meta.url), 'utf8');
const URL_A = 'https://media.example.test/live/example.m3u8';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class Node {
  constructor(tag, env) { this.tagName = tag.toUpperCase(); this.env = env; this.children = []; this.attrs = {}; this.dataset = {}; this.events = new Map(); this.hidden = false; this.disabled = false; this.playCalls = 0; this.pauseCalls = 0; this.loadCalls = 0; this.error = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'src') this._src = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'src') this._src = ''; }
  set src(v) { this._src = v; this.attrs.src = v; }
  get src() { return this._src || ''; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  dispatch(name) { if (this.disabled && name === 'click') return; for (const fn of [...this.events.get(name) || []]) fn({ target: this }); }
  canPlayType() { return this.env.native ? 'maybe' : ''; }
  play() { this.playCalls++; return this.env.play ? this.env.play(this) : Promise.resolve(); }
  pause() { this.pauseCalls++; }
  load() { this.loadCalls++; }
}
function harness({ native = false, supported = true, play } = {}) {
  const env = { native, play, instances: [], timers: new Map(), nextTimer: 0, statuses: [] };
  const document = { createElement: tag => new Node(tag, env) };
  document.head = new Node('head', env); document.body = new Node('body', env);
  class Hls {
    static Events = { MANIFEST_PARSED: 'parsed', ERROR: 'error' };
    static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
    static isSupported() { return supported; }
    constructor(config) { this.config = config; this.events = new Map(); this.destroyed = false; this.recoveries = 0; env.instances.push(this); }
    on(name, fn) { this.events.set(name, fn); }
    emit(name, data) { this.events.get(name)?.(name, data); }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; }
    recoverMediaError() { this.recoveries++; }
    destroy() { this.destroyed = true; }
  }
  const context = vm.createContext({ URL, document, Promise, Error, TypeError,
    setTimeout: (fn, ms) => { const id = ++env.nextTimer; env.timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => env.timers.delete(id),
  });
  vm.runInContext(source, context);
  const create = options => context.NVFootballPlayer.create({ url: URL_A, title: '예시 방송', loadHls: () => Promise.resolve(Hls), onStatus: value => env.statuses.push(value), ...options });
  const buttons = player => player.element.children.filter(n => n.tagName === 'BUTTON');
  const start = player => buttons(player)[0];
  const retry = player => buttons(player)[1];
  function advanceTimeout(ms) { for (const [id, timer] of [...env.timers]) if (timer.ms <= ms) { env.timers.delete(id); timer.fn(); } }
  return { env, Hls, context, document, api:context.NVFootballPlayer, create, start, retry, advanceTimeout };
}

test('only public HTTPS .m3u8 pages select HLS, including case/query variants', () => {
  const h = harness();
  assert.equal(h.api.isHlsSource({ provider:'web',kind:'page',id:URL_A }),true);
  assert.equal(h.api.isHlsSource({ provider:'web',kind:'page',id:'https://media.example.test/STREAM.M3U8?example=1' }),true);
  for (const id of ['http://media.example.test/x.m3u8','javascript:alert(1)','https://user:pass@media.example.test/x.m3u8','https://127.0.0.1/x.m3u8','https://device.local/x.m3u8','https://nv-fconline.github.io/x.m3u8','https://media.example.test/page']) assert.equal(h.api.isHlsSource({provider:'web',kind:'page',id}),false);
  assert.equal(h.api.isHlsSource({provider:'youtube',kind:'page',id:URL_A}),false);
  assert.throws(()=>h.create({url:'http://media.example.test/x.m3u8'}),/Invalid HLS/);
});

test('creation makes accessible native controls but no source, library or stream request before click', async () => {
  const h=harness();let loads=0;
  const p=h.create({loadHls:()=>{loads++;return Promise.resolve(h.Hls);}});await flush();
  assert.equal(p.video.controls,true);assert.equal(p.video.playsInline,true);assert.equal(p.video.preload,'none');assert.equal(p.video.crossOrigin,'anonymous');
  assert.equal(p.video.src,'');assert.equal(loads,0);assert.equal(h.env.instances.length,0);assert.equal(p.video.playCalls,0);
  assert.equal(p.element.dataset.state,'idle');assert.equal(h.start(p).textContent,'방송 재생');
});

test('a click uses MSE/Hls before advertised native support, then plays after manifest readiness', async () => {
  const h=harness({native:true});const p=h.create();h.start(p).dispatch('click');await flush();
  const engine=h.env.instances[0];assert.ok(engine);assert.equal(engine.config.enableWorker,false);assert.equal(engine.url,URL_A);assert.equal(engine.video,p.video);assert.equal(p.video.playCalls,0);
  engine.emit(h.Hls.Events.MANIFEST_PARSED);await flush();assert.equal(p.video.playCalls,1);assert.equal(p.element.dataset.state,'playing');
});

test('native HLS works when MSE is unavailable', async () => {
  const h=harness({native:true,supported:false});const p=h.create();h.start(p).dispatch('click');await flush();
  assert.equal(h.env.instances.length,0);assert.equal(p.video.src,URL_A);assert.equal(p.video.playCalls,1);assert.equal(p.element.dataset.state,'playing');
});

test('library failure falls back to native HLS, or gives a retry without claiming a cause', async () => {
  const a=harness({native:true});const p=a.create({loadHls:()=>Promise.reject(new Error('synthetic loader failure'))});a.start(p).dispatch('click');await flush();assert.equal(p.video.src,URL_A);assert.equal(p.element.dataset.state,'playing');
  const b=harness();let fail=true;const q=b.create({loadHls:()=>fail?Promise.reject(new Error('synthetic loader failure')):Promise.resolve(b.Hls)});b.start(q).dispatch('click');await flush();assert.equal(q.element.dataset.state,'error');assert.equal(b.retry(q).hidden,false);
  fail=false;b.retry(q).dispatch('click');await flush();assert.equal(b.env.instances.length,1);assert.equal(q.element.dataset.state,'loading');
});

test('unsupported browser has an honest message and remains manually retryable', async () => {
  const h=harness({supported:false});const p=h.create();h.start(p).dispatch('click');await flush();
  assert.equal(p.element.dataset.state,'error');assert.match(p.element.children.find(n=>n.className==='fb-hls-status').textContent,/브라우저/);assert.equal(h.retry(p).hidden,false);
});

test('autoplay rejection offers a fresh user gesture without reloading the engine', async () => {
  let allowed=false;const h=harness({play:()=>allowed?Promise.resolve():Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}))});
  const p=h.create();h.start(p).dispatch('click');await flush();h.env.instances[0].emit(h.Hls.Events.MANIFEST_PARSED);await flush();
  assert.equal(p.element.dataset.state,'ready');assert.equal(h.start(p).hidden,false);allowed=true;h.start(p).dispatch('click');await flush();
  assert.equal(h.env.instances.length,1);assert.equal(p.video.playCalls,2);assert.equal(p.element.dataset.state,'playing');
});

test('fatal network failures stop; only an explicit retry makes a fresh bounded attempt', async () => {
  const h=harness();const p=h.create();h.start(p).dispatch('click');await flush();const engine=h.env.instances[0];
  engine.emit(h.Hls.Events.ERROR,{fatal:true,type:h.Hls.ErrorTypes.NETWORK_ERROR});await flush();
  assert.equal(engine.destroyed,true);assert.equal(p.element.dataset.state,'error');assert.equal(p.video.src,'');assert.equal(h.env.instances.length,1);
  h.retry(p).dispatch('click');await flush();assert.equal(h.env.instances.length,2);assert.equal(p.element.dataset.state,'loading');
});

test('a media error gets at most one recovery before displaying an error', async () => {
  const h=harness();const p=h.create();h.start(p).dispatch('click');await flush();const engine=h.env.instances[0];
  engine.emit(h.Hls.Events.ERROR,{fatal:true,type:h.Hls.ErrorTypes.MEDIA_ERROR});assert.equal(engine.recoveries,1);assert.equal(p.element.dataset.state,'loading');
  engine.emit(h.Hls.Events.ERROR,{fatal:true,type:h.Hls.ErrorTypes.MEDIA_ERROR});assert.equal(engine.recoveries,1);assert.equal(engine.destroyed,true);assert.equal(p.element.dataset.state,'error');
});

test('a connection timeout stops an attempt, including one with a pending library promise', async () => {
  const h=harness();const pending=deferred();const p=h.create({loadHls:()=>pending.promise});h.start(p).dispatch('click');h.advanceTimeout(20000);await flush();assert.equal(p.element.dataset.state,'error');
  pending.resolve(h.Hls);await flush();assert.equal(h.env.instances.length,0,'A timed-out attempt must not construct a late engine');
});

test('destroy during a delayed library load never revives video or callbacks', async () => {
  const h=harness();const pending=deferred();const p=h.create({loadHls:()=>pending.promise});h.start(p).dispatch('click');const count=h.env.statuses.length;p.destroy();pending.resolve(h.Hls);await flush();
  assert.equal(h.env.instances.length,0);assert.equal(p.video.src,'');assert.equal(p.element.dataset.state,'destroyed');assert.equal(h.env.statuses.length,count);assert.equal(h.env.timers.size,0);assert.ok([...p.video.events.values()].every(set=>set.size===0));
});

test('destroy tears down an existing engine and ignores its late callbacks and play resolution', async () => {
  const pending=deferred();const h=harness({play:()=>pending.promise});const p=h.create();h.start(p).dispatch('click');await flush();const engine=h.env.instances[0];engine.emit(h.Hls.Events.MANIFEST_PARSED);p.destroy();const count=h.env.statuses.length;
  engine.emit(h.Hls.Events.ERROR,{fatal:true,type:h.Hls.ErrorTypes.MEDIA_ERROR});pending.resolve();await flush();
  assert.equal(engine.destroyed,true);assert.equal(engine.recoveries,0);assert.equal(p.element.dataset.state,'destroyed');assert.equal(h.env.statuses.length,count);p.destroy();
});

test('the default loader is shared, pinned with SRI and only inserted after a click', async () => {
  const h=harness();const p=h.create({loadHls:undefined});const q=h.create({loadHls:undefined});assert.equal(h.document.head.children.length,0);
  h.start(p).dispatch('click');h.start(q).dispatch('click');assert.equal(h.document.head.children.length,1);
  const script=h.document.head.children[0];assert.equal(script.src,'vendor/hls-1.7.4.min.js');assert.match(script.integrity,/^sha384-/);assert.equal(script.crossOrigin,'anonymous');
  h.context.Hls=h.Hls;script.onload();await flush();assert.equal(h.env.instances.length,2);
});

test('a failed/timed-out library script is removed and a later click can try loading it again', async () => {
  const h=harness();const p=h.create({loadHls:undefined});h.start(p).dispatch('click');h.advanceTimeout(10000);await flush();
  assert.equal(p.element.dataset.state,'error');assert.equal(h.document.head.children.length,0);
  h.retry(p).dispatch('click');assert.equal(h.document.head.children.length,1);assert.equal(h.document.head.children[0].src,'vendor/hls-1.7.4.min.js');
});


test('a failed media recovery expires instead of leaving an endless loading state', async () => {
  const h=harness();const p=h.create();h.start(p).dispatch('click');await flush();const engine=h.env.instances[0];
  engine.emit(h.Hls.Events.MANIFEST_PARSED);await flush();
  engine.emit(h.Hls.Events.ERROR,{fatal:true,type:h.Hls.ErrorTypes.MEDIA_ERROR});h.advanceTimeout(10000);
  assert.equal(engine.recoveries,1);assert.equal(engine.destroyed,true);assert.equal(p.element.dataset.state,'error');
});

test('an abort while still alive exposes a manual play button without replacing the engine', async () => {
  let allow=false;const h=harness({play:()=>allow?Promise.resolve():Promise.reject(Object.assign(new Error('synthetic abort'),{name:'AbortError'}))});
  const p=h.create();h.start(p).dispatch('click');await flush();h.env.instances[0].emit(h.Hls.Events.MANIFEST_PARSED);await flush();
  assert.equal(p.element.dataset.state,'ready');allow=true;h.start(p).dispatch('click');await flush();
  assert.equal(h.env.instances.length,1);assert.equal(p.element.dataset.state,'playing');
});

test('a support probe exception still permits native fallback', async () => {
  const h=harness({native:true});h.Hls.isSupported=()=>{throw new Error('synthetic platform failure');};
  const p=h.create();h.start(p).dispatch('click');await flush();assert.equal(p.video.src,URL_A);assert.equal(p.element.dataset.state,'playing');
});
