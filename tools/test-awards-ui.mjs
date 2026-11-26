// Real award and internal-record UI with synthetic data; no browser, network or production data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html=readFileSync(new URL('../club/index.html',import.meta.url),'utf8');
const between=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start);assert.ok(start>=0&&end>start);return html.slice(start,end);};
const source=between('function h(tag, props)',"const NS = 'http://www.w3.org/2000/svg'")+'\n'+between('function statsInternalRanking(rows)','async function renderStats(')+'\n'+between('const AWARD_CATS =','/* ---------- 검색(#/stats/search/');
class Node {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attrs={};this.events={};this.hidden=false;this.parentNode=null;this.open=false;}
  append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(n=>n!==child);child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...children);}
  set textContent(value){this.children=[];this._text=String(value);}
  get textContent(){return(this._text||'')+this.children.map(n=>n.textContent).join('');}
  set className(value){this.attrs.class=String(value);}
  get className(){return this.attrs.class||'';}
  get classList(){return{contains:name=>this.className.split(/\s+/).includes(name)};}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key]??null;}
  addEventListener(event,fn){(this.events[event]??=[]).push(fn);}
  dispatch(event){for(const fn of this.events[event]||[])fn({target:this,currentTarget:this,preventDefault(){}});}
  click(){this.dispatch('click');}
  focus(){this.doc.activeElement=this;}
  querySelectorAll(selector){return descend(this).slice(1).filter(n=>selector[0]==='.'?n.classList.contains(selector.slice(1)):selector[0]==='#'?n.getAttribute('id')===selector.slice(1):selector.startsWith('[')?n.getAttribute('aria-pressed')==='true':n.tagName===selector.toUpperCase());}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const descend=n=>[n,...n.children.flatMap(descend)];
const byClass=(n,c)=>descend(n).filter(x=>x.classList.contains(c));
const byTag=(n,t)=>descend(n).filter(x=>x.tagName===t.toUpperCase());
const button=(n,text)=>byTag(n,'button').find(x=>x.textContent===text);
const member=(id,name)=>({discord_id:id,name,nickname:`게임${name}`});
const table=()=>[
  {...member('2','나'),played:20,win:20,draw:0,lose:0,gf:100,ga:0},
  {...member('1','가'),played:30,win:0,draw:0,lose:30,gf:1,ga:100},
  {...member('3','다'),played:20,win:1,draw:0,lose:19,gf:2,ga:60},
];
const matches=()=>Array.from({length:23},(_,i)=>({match_id:`example-match-${i}`,match_type:i%2?50:40,played_at:1700000000000-i*1000,a:{...member('1','가'),goals:3,result:'승',stats:{possession:65,rating:7.24}},b:{...member('2','나'),goals:1,result:'패',stats:{possession:35,rating:null}}}));
const basePayload=()=>({type:50,window:{size:30},rules:{min_apps:15,min_dribbles:30,min_long_shots:30},members_counted:0,member_awards_counted:0,internal:{days:28,table:table(),matches:matches(),match_types:{40:'클래식 1on1',50:'공식경기'}},awards:{}});
function setup(payload=basePayload(),{group='member',stale=false}={}){
  const document={activeElement:null};document.createElement=tag=>new Node(tag,document);document.createTextNode=text=>{const node=new Node('#text',document);node.textContent=text;return node;};
  const root=document.createElement('main');let calls=0;
  const ctx={Node,document,console,Set,Map,Promise,Number,String,Array,Math,Date,
    state:{me:{id:'1'},awardsGroup:group},MATCH_PAGE:10,STAT_ROWS:[['possession','점유율','%'],['rating','평점','']],
    h:null,append:null,setTitle(){},tabs:()=>null,statsNav:()=>null,STATS_TAB:'stats',RK_TYPES:[[50,'공식경기'],[52,'감독모드']],
    cacheGet:()=>null,cacheSet(){},api:async()=>{calls++;return payload;},stale:()=>stale,
    loadNames:async()=>{},loadSeasons:async()=>{},waitAtMost:p=>p,winSize:()=>30,
    isNum:n=>typeof n==='number'&&Number.isFinite(n),fx:(v,d)=>Number(v).toFixed(d),pctText:n=>Number(n).toFixed(1)+'%',
    rememberPlace(){},restorePlace(){},loadingEl:()=>document.createElement('progress'),errorBox:()=>document.createElement('aside'),
    show:kids=>{root.replaceChildren();ctx.append(root,kids);},statsAttr:()=>null,refillNote:()=>null,
    statsMeBadge:mb=>mb.discord_id==='1'?ctx.h('span',{class:'b-me'},'나'):null,isStatsMe:mb=>mb.discord_id==='1',
    signed:n=>(n>0?'+':'')+n,timeEl:n=>ctx.h('time',null,String(n)),icon:()=>null,
    faceEl:()=>ctx.h('span',{class:'face'}),seasonEl:()=>null,nameEl:spid=>ctx.h('span',null,`예시선수${spid}`),posChip:p=>ctx.h('span',null,String(p)),gradeChip:g=>ctx.h('span',null,String(g)),
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);return{ctx,root,document,get calls(){return calls;}};
}
test('internal order uses played only, gives joint places and never mutates source',()=>{
  const {ctx}=setup();const input=table(),original=JSON.stringify(input);const rows=ctx.statsInternalRanking(input);
  assert.deepEqual(Array.from(rows,r=>[r.discord_id,r.rank]),[['1',1],['2',2],['3',2]]);assert.equal(JSON.stringify(input),original);
  assert.equal(ctx.statsInternalRanking([]).length,0);
});
test('internal table has no points, marks me and links the game-count leader',()=>{
  const {ctx}=setup();const ui={shown:10,open:new Set()};const box=ctx.statsInternalRecords({table:table(),matches:[]},{},ui);
  assert.doesNotMatch(box.textContent,/승점/);assert.match(box.textContent,/경기 수가 같으면 공동 순위/);
  const rows=byTag(box,'tbody')[0].children;assert.deepEqual(rows.map(r=>r.children[0].textContent),['1','2','2']);
  assert.equal(rows[0].className,'is-me');assert.equal(byTag(rows[0],'a')[0].getAttribute('href'),'#/stats/m/1');
});
test('recent matches keep details, mixed game labels, null stats and profile links',()=>{
  const {ctx}=setup();const ui={shown:10,open:new Set(['example-match-0'])};const item=ctx.statsInternalMatchItem(matches()[0],{40:'클래식 1on1'},ui,()=>{});
  assert.equal(item.open,true);assert.match(item.textContent,/클래식 1on1/);assert.match(item.textContent,/자세히/);assert.match(item.textContent,/7\.2/);assert.match(item.textContent,/-/);
  assert.equal(byTag(item,'a')[0].getAttribute('href'),'#/stats/m/1');item.open=false;item.dispatch('toggle');assert.equal(ui.open.has('example-match-0'),false);
});
test('recent records start with three, then add ten, restoring focus and opened state',()=>{
  const {ctx,document}=setup();const ui={shown:3,open:new Set()};const data={table:table(),matches:matches()};const box=ctx.statsInternalRecords(data,{},ui,{table:false});
  assert.equal(byClass(box,'mt').length,3);button(box,'더 보기 (20경기 남음)').click();assert.equal(byClass(box,'mt').length,13);assert.equal(ui.shown,13);assert.equal(document.activeElement.tagName,'SUMMARY');
  button(box,'더 보기 (10경기 남음)').click();assert.equal(byClass(box,'mt').length,23);assert.equal(byClass(box,'more')[0].hidden,true);
  const item=byClass(box,'mt')[0];item.open=true;item.dispatch('toggle');const redrawn=ctx.statsInternalRecords(data,{},ui,{table:false});assert.equal(byClass(redrawn,'mt')[0].open,true);
});
test('internal records render independently when all mode-specific awards have zero records',async()=>{
  const {ctx,root}=setup();await ctx.renderAwards(50,0);
  assert.equal(byClass(root,'aw-internal-feature').length,1);assert.equal(byClass(root,'aw')[0].getAttribute('aria-labelledby'),'aw-internal');
  assert.equal(byClass(root,'mt').length,3);assert.equal(byClass(root,'aw-internal-table').length,1);assert.doesNotMatch(byClass(root,'aw-internal-feature')[0].textContent,/승점/);
});
test('a new award list still renders if legacy headline coverage fields are zero',async()=>{
  const d=basePayload();delete d.internal;d.awards.long_shot={count:1,list:[{rank:1,member:member('1','가'),long_shot_games:20,long_shot_try:40,long_shot_goals:10,value:25}]};
  const {ctx,root}=setup(d);await ctx.renderAwards(50,0);assert.match(root.textContent,/대포왕/);assert.match(root.textContent,/25\.0%/);
});
test('category switch keeps internal controls in members only and exposes dribble rules',async()=>{
  const d=basePayload();d.awards.dribble={count:1,list:[{rank:1,member:member('1','가'),spid:101000190,pos:25,grade:8,apps:30,dribble_games:20,dribble_try:45,dribble_success:30,value:66.7}]};
  const {ctx,root}=setup(d);await ctx.renderAwards(50,0);button(root,'선수 카드 어워드').click();
  assert.equal(byClass(root,'aw-internal-feature').length,0);assert.match(root.textContent,/돌파왕/);assert.match(root.textContent,/66\.7%/);assert.match(root.textContent,/드리블 45회 중 30회/);assert.match(root.textContent,/수비수·골키퍼 자리의 기록은 빼요/);
  button(root,'클럽원 어워드').click();assert.equal(byClass(root,'aw-internal-feature').length,1);
});
test('missing new metrics say preparing rather than fabricating zeroes',async()=>{
  const {ctx,root}=setup(basePayload(),{group:'card'});await ctx.renderAwards(50,0);assert.match(root.textContent,/드리블 집계를 준비/);assert.doesNotMatch(root.textContent,/NaN|undefined%/);
  button(root,'클럽원 어워드').click();assert.match(root.textContent,/박스 밖 슈팅 집계를 준비/);
});
test('incomplete new metric coverage and numerator/denominator stay visible',async()=>{
  const d=basePayload();d.long_shot_coverage={collected:2,total:8};d.awards.long_shot={count:1,list:[{rank:1,member:member('1','가'),long_shot_games:20,long_shot_try:40,long_shot_goals:10,value:25}]};
  const {ctx,root}=setup(d);await ctx.renderAwards(52,0);assert.match(root.textContent,/대포왕/);assert.match(root.textContent,/25\.0%/);assert.match(root.textContent,/박스 밖 40슈팅 10골/);assert.match(root.textContent,/기록을 다시 모으는 중이에요\. \(2\/8명\)/);
});
test('finished collection with missing fields or too few eligible cards is not described as still refilling',async()=>{
  const d=basePayload();d.dribble_coverage={collected:0,total:8,pending:0};d.long_shot_coverage={collected:0,total:8,pending:0};d.awards.dribble={count:0,list:[]};d.awards.long_shot={count:0,list:[]};
  const {ctx,root}=setup(d);await ctx.renderAwards(50,0);assert.doesNotMatch(root.textContent,/다시 모으는 중/);assert.match(root.textContent,/박스 밖 슈팅 기록 15경기 이상/);
  button(root,'선수 카드 어워드').click();assert.doesNotMatch(root.textContent,/다시 모으는 중/);assert.match(root.textContent,/드리블 30회 이상을 기록한 선수/);
});
test('new coverage reports the actual legacy members remaining when pending is positive',async()=>{
  const d=basePayload();d.long_shot_coverage={collected:0,total:8,pending:3};d.awards.long_shot={count:0,list:[]};
  const {ctx,root}=setup(d);await ctx.renderAwards(50,0);assert.match(root.textContent,/다시 모으는 중이에요\. \(3명 남음\)/);assert.doesNotMatch(root.textContent,/\(0\/8명\)/);
});
test('category art is decorative/lazy and an image failure preserves the title and leaderboard',async()=>{
  const {ctx,root}=setup();await ctx.renderAwards(50,0);const images=byClass(root,'aw-image');assert.ok(images.length>=7);
  const first=images[0];assert.equal(first.getAttribute('alt'),'');assert.equal(first.getAttribute('loading'),'lazy');assert.equal(first.getAttribute('src'),'../assets/awards/internal.webp');assert.equal(first.getAttribute('width'),'160');assert.equal(first.getAttribute('height'),'90');
  first.dispatch('error');assert.equal(first.hidden,true);assert.match(root.textContent,/내전왕/);assert.match(root.textContent,/30경기/);
});
test('featured internal award and recent matches remain separate beside a full-width table',async()=>{
  const {ctx,root}=setup();await ctx.renderAwards(50,0);const feature=byClass(root,'aw-internal-feature')[0];
  assert.equal(feature.children.length,3);assert.equal(feature.children[0].getAttribute('aria-labelledby'),'aw-internal');assert.match(feature.children[1].textContent,/내전 최근 경기/);assert.equal(feature.children[2].tagName,'DETAILS');
  assert.match(html,/@media \(min-width: 900px\) \{ \.aw-internal-feature \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html,/\.aw-internal-table \{ grid-column: 1 \/ -1/);assert.match(html,/aspect-ratio: 16 \/ 9; object-fit: contain/);
});
test('stale mode response cannot paint award or internal data after navigation',async()=>{
  const {ctx,root}=setup(basePayload(),{stale:true});await ctx.renderAwards(50,0);assert.equal(byClass(root,'aw').length,0);assert.equal(byClass(root,'mt').length,0);
});
test('overview links to awards and no longer renders a duplicate internal match block',()=>{
  const overview=between('async function renderStats(','/* ---------- 전적 하위 메뉴:');assert.doesNotMatch(overview,/statsInternalRecords\(|matchItem\(|mt-list/);assert.match(overview,/내전왕 · 최근 경기 보기/);
  const rank=between("if (k === 'internal')", "if (k === 'overall')");assert.match(rank,/statsInternalRanking\(tb\)/);assert.doesNotMatch(rank,/승점|pts\(/);
});
