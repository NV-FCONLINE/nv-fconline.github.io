// Real football video UI functions with synthetic DOM/media only. No network or real streams.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../club/index.html', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../club/football-player.js', import.meta.url), 'utf8');
const between = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Source section exists: ${start}`);
  return html.slice(a, b);
};
const domSource = between('function h(tag, props)', "const NS = 'http://www.w3.org/2000/svg'");
const videoSource = between('const FB_VIDEO_NAME =', '/* SportScore 위젯은 높이가');
const HLS_URL = 'https://media.example.test/live/example.m3u8';
const hlsRecord = () => ({ provider:'web', kind:'page', id:HLS_URL, url:HLS_URL, title:'예시 방송', set_at:1700000000 });
const youtubeRecord = () => ({ provider:'youtube', kind:'video', id:'abcdefghijk', url:'https://www.youtube.com/watch?v=abcdefghijk', title:'예시 영상' });
const webRecord = () => ({ provider:'web', kind:'page', id:'https://video.example.test/watch/example', url:'https://video.example.test/watch/example', title:'예시 페이지' });
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }

class Events {
  constructor() { this.events=new Map(); }
  addEventListener(name, fn) { if(!this.events.has(name)) this.events.set(name,new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  dispatch(name, extra={}) { const ev={type:name,target:this,preventDefault(){this.defaultPrevented=true;},...extra}; for(const fn of [...this.events.get(name)||[]]) fn(ev); return ev; }
  listenerCount() { return [...this.events.values()].reduce((sum,set)=>sum+set.size,0); }
}
class FakeNode extends Events {
  constructor(tag, env) {
    super(); this.tagName=tag.toUpperCase(); this.env=env; this.children=[]; this.attrs={}; this.dataset={};
    this.style={}; this.parentNode=null; this.hidden=false; this.disabled=false; this.clientWidth=800;
    this.playCalls=0; this.pauseCalls=0; this.loadCalls=0;
    this.classList={
      contains: token=>this.className.split(/\s+/).includes(token),
      add: (...tokens)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...tokens])].join(' ');},
      remove: (...tokens)=>{this.className=this.className.split(/\s+/).filter(t=>t&&!tokens.includes(t)).join(' ');},
      toggle: (token,force)=>{const yes=force===undefined?!this.classList.contains(token):!!force;yes?this.classList.add(token):this.classList.remove(token);return yes;}
    };
    if(env.fullscreen!=='absent') this.requestFullscreen=()=>env.requestFullscreen(this);
  }
  set className(value) { this.attrs.class=String(value); }
  get className() { return this.attrs.class||''; }
  set textContent(value) { this.children=[]; this._text=String(value); }
  get textContent() { return (this._text||'')+this.children.map(n=>n.textContent).join(''); }
  setAttribute(name,value) { this.attrs[name]=String(value); }
  getAttribute(name) { return this.attrs[name]??null; }
  removeAttribute(name) { delete this.attrs[name]; }
  set src(value) { this.attrs.src=String(value); }
  get src() { return this.attrs.src||''; }
  append(...nodes) { for(const n of nodes) { if(n.parentNode) n.remove(); this.children.push(n); n.parentNode=this; } }
  replaceChildren(...nodes) { for(const n of this.children)n.parentNode=null;this.children=[];this._text='';this.append(...nodes); }
  remove() { if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null; }
  get isConnected() { return this===this.env.document.body || !!this.parentNode?.isConnected; }
  contains(node) { return node===this || this.children.some(n=>n.contains(node)); }
  querySelectorAll(selector) {
    const matches=(node,part)=>{
      const enabled=part.endsWith(':not([disabled])');if(enabled)part=part.slice(0,-':not([disabled])'.length);
      const match=/^([a-z]+)?(?:\[([a-z]+)(?:="([^"]*)")?\])?$/.exec(part);
      if(!match)throw new Error('Unsupported synthetic DOM selector: '+part);
      if(enabled&&(node.disabled||node.getAttribute('disabled')!==null))return false;
      if(match[1]&&node.tagName!==match[1].toUpperCase())return false;
      if(match[2]&&node.getAttribute(match[2])===null)return false;
      return match[3]===undefined||node.getAttribute(match[2])===match[3];
    };
    return descendants(this,node=>node!==this&&selector.split(',').some(part=>matches(node,part.trim())));
  }
  getClientRects() {
    for(let node=this;node;node=node.parentNode)if(node.hidden||node.noLayout||node.style.display==='none')return [];
    return this.isConnected?[{}]:[];
  }
  focus() { this.env.document.activeElement=this; }
  click() { if(!this.disabled)this.dispatch('click'); }
  canPlayType() { return ''; }
  play() { this.playCalls++;return Promise.resolve(); }
  pause() { this.pauseCalls++; }
  load() { this.loadCalls++; }
}
function descendants(root,predicate) {
  return [root,...root.children.flatMap(n=>descendants(n,()=>true))].filter(predicate);
}
function byClass(root,name) { return descendants(root,n=>n.classList.contains(name)); }
function byTag(root,name) { return descendants(root,n=>n.tagName===name.toUpperCase()); }
function harness({fullscreen='success',ios=false}={}) {
  const env={fullscreen,created:[],destroyCalls:0,observers:[],toasts:[],fullRequests:0,exitCalls:0,pending:deferred()};
  const document=new Events();env.document=document;document.fullscreenElement=null;document.activeElement=null;
  document.createElement=tag=>{const n=new FakeNode(tag,env);if(tag==='video'&&ios)n.webkitEnterFullscreen=()=>{env.iosFull=(env.iosFull||0)+1;n.dispatch('webkitbeginfullscreen');};return n;};
  document.createTextNode=text=>{const n=new FakeNode('#text',env);n.textContent=text;return n;};
  document.body=document.createElement('body');document.head=document.createElement('head');
  env.requestFullscreen=node=>{
    env.fullRequests++;
    if(fullscreen==='reject')return Promise.reject(new Error('Synthetic fullscreen rejection'));
    if(fullscreen==='delayed')return env.pending.promise.then(()=>{document.fullscreenElement=node;document.dispatch('fullscreenchange');});
    document.fullscreenElement=node;document.dispatch('fullscreenchange');return Promise.resolve();
  };
  document.exitFullscreen=()=>{env.exitCalls++;document.fullscreenElement=null;document.dispatch('fullscreenchange');return Promise.resolve();};
  class ResizeObserver {
    constructor(callback) {this.callback=callback;this.disconnectCalls=0;env.observers.push(this);}
    observe(node) {this.node=node;}
    disconnect() {this.disconnectCalls++;}
  }
  const getComputedStyle=node=>({visibility:node.style.visibility||'visible'});
  const context=vm.createContext({URL,Node:FakeNode,document,window:document,ResizeObserver,Promise,Error,TypeError,getComputedStyle,
    state:{me:{id:'example-user',is_staff:false}},isNum:value=>typeof value==='number'&&Number.isFinite(value),
    timeEl:()=>document.createElement('time'),location:{origin:'https://nv-fconline.github.io',hostname:'nv-fconline.github.io'},
    toast:value=>env.toasts.push(value),setTimeout,clearTimeout,
    api:()=>{throw new Error('UI regression tests must never access API');}
  });
  vm.runInContext(domSource,context);vm.runInContext(helper,context);
  const create=context.NVFootballPlayer.create;
  context.NVFootballPlayer={...context.NVFootballPlayer,create:options=>{
    const p=create(options),destroy=p.destroy;
    p.destroy=()=>{env.destroyCalls++;destroy();};env.created.push(p);return p;
  }};
  vm.runInContext(videoSource,context);
  const render=record=>{const section=context.fbVideoSection(record,()=>{});document.body.replaceChildren(...(section?[section]:[]));return section;};
  const controls=section=>{
    const watch=byClass(section,'fb-watch')[0],buttons=byClass(watch,'fb-player-tools')[0].children.filter(n=>n.tagName==='BUTTON');
    return {watch,big:buttons[0],full:buttons[1]};
  };
  return {env,context,document,render,controls,clear:()=>context.fbClearVideo()};
}

test('a direct HLS address uses the real video helper and waits for viewer action',async()=>{
  const h=harness();const section=h.render(hlsRecord());await flush();
  assert.equal(h.env.created.length,1);assert.equal(byTag(section,'iframe').length,0);
  const video=byTag(section,'video')[0];assert.equal(video,h.env.created[0].video);
  assert.equal(video.controls,true);assert.equal(video.playsInline,true);assert.equal(video.preload,'none');
  assert.equal(video.src,'');assert.equal(video.playCalls,0);assert.equal(h.document.head.children.length,0);
  assert.equal(byClass(section,'fb-hls-start')[0].textContent,'방송 재생');
  assert.ok(byTag(section,'a').some(a=>a.getAttribute('href')===HLS_URL&&/원래 페이지/.test(a.textContent)));
  h.clear();
});

test('generic web pages keep their iframe sandbox and limited permissions',()=>{
  const h=harness();const section=h.render(webRecord()),frame=byTag(section,'iframe')[0];
  assert.equal(h.env.created.length,0);assert.equal(frame.getAttribute('src'),webRecord().id);
  const sandbox=frame.getAttribute('sandbox').split(' ');
  for(const token of ['allow-scripts','allow-same-origin','allow-forms','allow-presentation','allow-popups'])assert.ok(sandbox.includes(token));
  assert.equal(sandbox.some(token=>token.startsWith('allow-top-navigation')),false);
  assert.doesNotMatch(frame.getAttribute('allow'),/camera|microphone|autoplay/);
  assert.equal(frame.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');h.clear();
});

test('YouTube keeps its official iframe, inline playback option and original link',()=>{
  const h=harness();const section=h.render(youtubeRecord()),frame=byTag(section,'iframe')[0];
  const src=new URL(frame.getAttribute('src'));assert.equal(src.origin,'https://www.youtube-nocookie.com');
  assert.equal(src.pathname,'/embed/abcdefghijk');assert.equal(src.searchParams.get('playsinline'),'1');
  assert.equal(src.searchParams.get('autoplay'),null);assert.equal(frame.getAttribute('sandbox'),null);
  assert.ok(byTag(section,'a').some(a=>a.getAttribute('href')===youtubeRecord().url));
  assert.equal(h.env.created.length,0);h.clear();
});

test('link-only providers stay links without creating a media player',()=>{
  const h=harness();const record={provider:'web',kind:'link',url:'https://video.example.test/live/example',id:'https://video.example.test/live/example',title:'예시 링크'};
  const section=h.render(record);assert.equal(byTag(section,'iframe').length,0);assert.equal(byTag(section,'video').length,0);
  assert.equal(byClass(section,'fb-watch').length,0);assert.ok(byTag(section,'a').some(a=>a.getAttribute('href')===record.url));h.clear();
});

test('large-screen toggle preserves the same playing video and restores focus on Escape',()=>{
  const h=harness();const section=h.render(hlsRecord()),{watch,big}=h.controls(section),video=byTag(section,'video')[0];
  video.currentTime=37;big.click();assert.equal(watch.classList.contains('is-theater'),true);
  assert.equal(h.document.body.classList.contains('football-theater'),true);assert.equal(big.getAttribute('aria-pressed'),'true');
  assert.equal(byTag(section,'video')[0],video);assert.equal(video.currentTime,37);assert.equal(h.env.created.length,1);
  h.document.dispatch('keydown',{key:'Escape'});assert.equal(watch.classList.contains('is-theater'),false);
  assert.equal(h.document.body.classList.contains('football-theater'),false);assert.equal(h.document.activeElement,big);
  assert.equal(big.getAttribute('aria-pressed'),'false');h.clear();
});

for(const kind of ['hls','iframe'])test(`large-screen Tab and Shift+Tab wrap within the ${kind} player`,()=>{
  const h=harness();const section=h.render(kind==='hls'?hlsRecord():webRecord()),{big,full}=h.controls(section);
  const last=kind==='hls'?byClass(section,'fb-hls-start')[0]:byTag(section,'iframe')[0];
  big.click();last.focus();const next=h.document.dispatch('keydown',{key:'Tab',shiftKey:false});
  assert.equal(next.defaultPrevented,true);assert.equal(h.document.activeElement,big);
  const previous=h.document.dispatch('keydown',{key:'Tab',shiftKey:true});
  assert.equal(previous.defaultPrevented,true);assert.equal(h.document.activeElement,last);
  full.focus();const middle=h.document.dispatch('keydown',{key:'Tab',shiftKey:false});
  assert.equal(middle.defaultPrevented,undefined);assert.equal(h.document.activeElement,full);
  h.document.dispatch('keydown',{key:'Escape'});assert.equal(h.document.activeElement,big);
  const afterClose=h.document.dispatch('keydown',{key:'Tab',shiftKey:true});
  assert.equal(afterClose.defaultPrevented,undefined);assert.equal(h.document.activeElement,big);h.clear();
});

test('large-screen focus wrapping skips hidden, disabled and invisible controls',()=>{
  const h=harness();const section=h.render(hlsRecord()),{watch,big}=h.controls(section),last=byClass(section,'fb-hls-start')[0];
  for(const [property,value]of [['hidden',true],['disabled',true],['noLayout',true],['visibility','hidden']]){
    const button=h.document.createElement('button');if(property==='visibility')button.style.visibility=value;else button[property]=value;watch.append(button);
  }
  big.click();big.focus();const event=h.document.dispatch('keydown',{key:'Tab',shiftKey:true});
  assert.equal(event.defaultPrevented,true);assert.equal(h.document.activeElement,last);h.clear();
});

test('successful browser fullscreen keeps the same media node and closes cleanly',async()=>{
  const h=harness();const section=h.render(hlsRecord()),{watch,big,full}=h.controls(section),video=byTag(section,'video')[0];
  full.click();await flush();assert.equal(h.document.fullscreenElement,watch);assert.equal(full.textContent,'전체화면 끝내기');
  assert.equal(byTag(section,'video')[0],video);assert.equal(h.env.created.length,1);
  full.click();await flush();assert.equal(h.document.fullscreenElement,null);assert.equal(watch.classList.contains('is-theater'),false);
  assert.equal(h.document.activeElement,big);assert.equal(h.document.body.classList.contains('football-theater'),false);h.clear();
});

for(const fullscreen of ['reject','absent'])test(`${fullscreen} fullscreen falls back to a closable large screen`,async()=>{
  const h=harness({fullscreen});const section=h.render(hlsRecord()),{watch,big,full}=h.controls(section),video=byTag(section,'video')[0];
  full.click();await flush();assert.equal(watch.classList.contains('is-theater'),true);assert.equal(h.document.fullscreenElement,null);
  assert.equal(byTag(section,'video')[0],video);assert.equal(h.env.created.length,1);assert.ok(h.env.toasts.some(s=>/큰 화면/.test(s)));
  h.document.dispatch('keydown',{key:'Escape'});assert.equal(watch.classList.contains('is-theater'),false);assert.equal(h.document.activeElement,big);h.clear();
});

test('iOS native fullscreen exit restores the large-screen toggle and cleans its listener',async()=>{
  const h=harness({fullscreen:'absent',ios:true});const section=h.render(hlsRecord()),{watch,big,full}=h.controls(section),video=byTag(section,'video')[0];
  full.click();await flush();assert.equal(h.env.iosFull,1);assert.equal(watch.classList.contains('is-theater'),true);
  video.dispatch('webkitendfullscreen');assert.equal(watch.classList.contains('is-theater'),false);
  assert.equal(h.document.body.classList.contains('football-theater'),false);assert.equal(h.document.activeElement,big);
  h.clear();assert.equal(video.listenerCount(),0);video.dispatch('webkitendfullscreen');assert.equal(h.document.body.classList.contains('football-theater'),false);
});

test('cleanup releases the current player, global listeners and body scroll lock once',()=>{
  const h=harness();const section=h.render(hlsRecord()),{big,full,watch}=h.controls(section);
  big.click();assert.equal(h.document.listenerCount(),2);h.clear();h.clear();
  assert.equal(h.env.destroyCalls,1);assert.equal(h.env.created[0].element.dataset.state,'destroyed');
  assert.equal(h.document.listenerCount(),0);assert.equal(h.document.body.classList.contains('football-theater'),false);
  big.click();full.click();h.document.dispatch('keydown',{key:'Escape'});
  assert.equal(h.env.created.length,1);assert.equal(h.env.fullRequests,0);assert.equal(h.document.body.classList.contains('football-theater'),false);
});

test('replacing a video destroys the previous instance and leaves only current listeners',()=>{
  const h=harness();const first=h.render(hlsRecord()),old=h.env.created[0];h.controls(first).big.click();
  const next=h.render(youtubeRecord());assert.equal(h.env.destroyCalls,1);assert.equal(old.element.dataset.state,'destroyed');
  assert.equal(h.document.body.classList.contains('football-theater'),false);assert.equal(h.document.listenerCount(),2);
  assert.equal(byTag(next,'iframe').length,1);assert.equal(byTag(next,'video').length,0);h.clear();
});

test('cleanup exits only the fullscreen belonging to this video',async()=>{
  const h=harness();const section=h.render(hlsRecord()),{full}=h.controls(section);full.click();await flush();h.clear();await flush();
  assert.equal(h.document.fullscreenElement,null);assert.equal(h.env.exitCalls,1);
  h.render(hlsRecord());const unrelated=h.document.createElement('div');h.document.fullscreenElement=unrelated;h.clear();
  assert.equal(h.document.fullscreenElement,unrelated);assert.equal(h.env.exitCalls,1);
});

test('a fullscreen request completing after cleanup cannot reopen the old player',async()=>{
  const h=harness({fullscreen:'delayed'});const section=h.render(hlsRecord()),{full}=h.controls(section);
  full.click();h.clear();h.env.pending.resolve();await flush();
  assert.equal(h.document.fullscreenElement,null);assert.equal(h.document.body.classList.contains('football-theater'),false);
  assert.equal(h.env.destroyCalls,1);assert.equal(h.document.listenerCount(),0);
});

test('Twitch responsive observer reuses its iframe and disconnects on cleanup',()=>{
  const h=harness();const section=h.render({provider:'twitch',kind:'live',id:'example_channel',url:'https://www.twitch.tv/example_channel',title:'예시 Twitch'});
  const box=byClass(section,'fb-video')[0],frame=byTag(section,'iframe')[0],observer=h.env.observers[0];
  box.clientWidth=390;observer.callback();assert.equal(byClass(box,'fb-vnarrow').length,1);
  box.clientWidth=800;observer.callback();assert.equal(byTag(box,'iframe')[0],frame);
  h.clear();assert.ok(observer.disconnectCalls>=1);assert.equal(h.document.listenerCount(),0);
});

test('navigation invokes video cleanup and wide-screen CSS keeps accessible controls',()=>{
  assert.ok(/function route\(\)\s*\{[^}]*?fbClearVideo\(\)/.test(html),'Route changes dispose the current video');
  assert.match(html,/\.fb-watch\.is-theater\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*height:\s*100dvh;/);
  assert.match(html,/body\.football-theater\s*\{\s*overflow:\s*hidden;/);
  assert.match(html,/\.fb-watch\.is-theater \.fb-video\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
  assert.match(html,/@media \(min-width:\s*1000px\)\s*\{\s*\.fb-watch\s*\{[^}]*100vw/);
  assert.match(html,/\.fb-player-tools \.btn\s*\{[^}]*min-height:\s*44px;/);
});

