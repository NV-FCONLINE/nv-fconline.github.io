import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../club/index.html',import.meta.url),'utf8');
const begin=html.indexOf('function h(tag, props)'),end=html.indexOf("const NS = 'http://www.w3.org/2000/svg'",begin);
const source=html.slice(begin,end)+'\n'+readFileSync(new URL('../club/insights.js',import.meta.url),'utf8');
class Node{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attrs={};this.events={};this.parentNode=null;this.disabled=false;}
 append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
 replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...children);}
 get textContent(){return(this._text||'')+this.children.map(n=>n.textContent).join('');}set textContent(v){this.children=[];this._text=String(v);}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=String(v);}
 get classList(){return{contains:k=>this.className.split(/\s+/).includes(k)};}
 get isConnected(){return this.connected||!!this.parentNode?.isConnected;}
 get value(){return this._value??(this.tagName==='SELECT'?(this.children.find(n=>n.getAttribute('selected')!==null)||this.children[0])?.value||'':this.getAttribute('value')||'');}set value(v){this._value=String(v);}
 querySelectorAll(s){return descend(this).slice(1).filter(n=>s[0]==='.'?n.classList.contains(s.slice(1)):n.tagName===s.toUpperCase());}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}dispatch(type){for(const fn of this.events[type]||[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}
}
const descend=n=>[n,...n.children.flatMap(descend)],tick=()=>new Promise(setImmediate);
const member=(id,name)=>({discord_id:id,name,nickname:'예시게임',link:{status:'ok'}});
const people=[member('100000000000000001','예시하늘'),member('100000000000000002','예시바람')];
function setup(api){const document={};document.createElement=t=>new Node(t,document);document.createTextNode=t=>{const n=new Node('#text',document);n.textContent=t;return n;};const main=document.createElement('main');main.connected=true;
 const ctx={document,Node,console,URLSearchParams};vm.createContext(ctx);vm.runInContext(source,ctx);
 const c={h:ctx.h,api,show:nodes=>{main.replaceChildren();ctx.append(main,nodes);},seq:1,stale:()=>false,setTitle(){},toast(){},me:{id:people[0].discord_id},header:()=>[],errorText:()=> '다시 확인해 주세요.'};return{main,c,lib:ctx.NVInsights};}
const payload=()=>({summary:{played:30,win:15,draw:5,lose:10,normal_games:25,forfeit_games:5,unknown_end_games:0},recent5:{played:5,win:3,draw:1,lose:1},window:{size:30},metrics:[{key:'pass',label:'패스 성공률',unit:'%',value:88,club_value:null,recent5_value:90,previous_value:85,games:25}],diagnoses:[{kind:'strength',title:'패스 연결',text:'유효한 기록을 바탕으로 표시해요.'}],patterns:{for:{methods:{games:25,total:20,items:[{key:'heading',label:'헤딩',count:4,percent:20}]}}},club:{members:8,min_games:5},coverage:{pending:1}});
test('unknown metrics are not converted to zero and percent deltas use percentage points',()=>{const{lib}=setup();assert.equal(lib.valueText(null,'%'),'—');assert.equal(lib.valueText(0,'%'),'0%');assert.equal(lib.deltaText(55,50,'%'),'+5%p');assert.equal(lib.deltaText(null,50,'%'),'—');});
test('real report renderer displays normal/forfeit denominators, pending state, patterns and unknown average',async()=>{const calls=[];const{main,c,lib}=setup(async path=>{calls.push(path);return path==='/api/stats'?{members:people}:payload();});await lib.renderInsights(c);assert.equal(calls.length,2);assert.match(main.textContent,/정상 종료 기록 기준 · 몰수 5경기/);assert.match(main.textContent,/새 진단 기록을 순서대로/);assert.match(main.textContent,/헤딩/);assert.match(main.textContent,/—/);assert.doesNotMatch(main.textContent,/NaN|undefined/);assert.equal(main.querySelector('select').disabled,false);});
test('delayed report never overwrites another page after leaving',async()=>{let resolve;const{main,c,lib}=setup(path=>path==='/api/stats'?Promise.resolve({members:people}):new Promise(r=>resolve=r));const run=lib.renderInsights(c);await tick();main.replaceChildren(c.h('p',null,'다른 화면'));resolve(payload());await run;assert.equal(main.textContent,'다른 화면');});
test('a failed report preserves member selection and re-enables controls for retry',async()=>{const{main,c,lib}=setup(async path=>{if(path==='/api/stats')return{members:people};throw{code:'network'};});await lib.renderInsights(c,people[1].discord_id,52);const selects=main.querySelectorAll('select');assert.equal(selects[0].value,people[1].discord_id);assert.equal(selects[1].value,'52');assert.equal(selects[0].disabled,false);assert.match(main.textContent,/다시 불러오기/);});
test('rival list can select an opponent and issues a bounded duel query',async()=>{const calls=[];const{main,c,lib}=setup(async path=>{calls.push(path);if(path==='/api/stats')return{members:people};return{a:people[0],b:path.includes('&b=')?people[1]:null,days:28,summary:{played:2,a_win:1,draw:0,b_win:1,a_goals:4,b_goals:4},metrics:[],matches:[],opponents:[{member:people[1],played:2,win:1,draw:0,lose:1,win_rate:50}]};});await lib.renderDuel(c);assert.match(main.textContent,/상대 목록에서/);main.querySelectorAll('button').find(n=>n.textContent==='예시바람').click();await tick();assert.ok(calls.at(-1).includes('b='+people[1].discord_id));assert.match(main.textContent,/맞대결 승수|1승/);});
test('duel rejects comparing the same account without requesting records',async()=>{let calls=0;const{main,c,lib}=setup(async path=>{calls++;return{members:people};});await lib.renderDuel(c,people[0].discord_id,people[0].discord_id);assert.equal(calls,1);assert.match(main.textContent,/서로 다른 두 명/);});

test('legacy report retains known outcomes while uncollected normal and recent metrics stay unknown',async()=>{const{main,c,lib}=setup(async path=>path==='/api/stats'?{members:people}:{summary:{played:30,win:10,draw:10,lose:10,normal_games:null},coverage:{pending:true},metrics:[],patterns:null,club:{members:0}});await lib.renderInsights(c);assert.match(main.textContent,/30경기/);assert.match(main.textContent,/몰수 —/);assert.doesNotMatch(main.textContent,/정상 종료0경기/);});
test('rival highlights need at least three games for strength labels and preserve input order',()=>{const{lib}=setup();const rows=[{member:people[0],played:2,win_rate:0},{member:people[1],played:8,win_rate:75}];const before=JSON.stringify(rows);const labels=lib.rivalHighlights(rows);assert.equal(labels[1][1].played,8);assert.equal(JSON.stringify(rows),before);});

test('an unlinked signed-in member defaults to an available linked account',async()=>{const calls=[];const{c,lib}=setup(async path=>{calls.push(path);return path==='/api/stats'?{members:[{...people[0],link:{status:'not_found'}},people[1]]}:payload();});await lib.renderInsights(c);assert.ok(calls[1].includes(people[1].discord_id));});


const duelPayload=(period='all',extra={})=>({a:people[0],b:people[1],period,days:period==='all'?null:28,summary:{played:period==='all'?12:2,a_win:period==='all'?8:1,draw:0,b_win:period==='all'?4:1,a_goals:20,b_goals:12},metrics:[],matches:[],opponents:[{member:people[1],played:period==='all'?12:2,win:8,draw:0,lose:4,win_rate:66.7}],...extra});
const field=(main,label)=>main.querySelectorAll('select').find(n=>n.getAttribute('aria-label')===label);

test('duel defaults to cumulative query and period changes preserve both members and match mode',async()=>{
 const calls=[];const {main,c,lib}=setup(async path=>{calls.push(path);return path==='/api/stats'?{members:people}:duelPayload(new URLSearchParams(path.split('?')[1]).get('period'));});
 await lib.renderDuel(c,people[0].discord_id,people[1].discord_id,52);
 assert.equal(new URLSearchParams(calls[1].split('?')[1]).get('period'),'all');assert.match(main.textContent,/누적 기록/);assert.match(main.textContent,/정기 갱신으로 확인한 맞대결을 모아요/);assert.match(main.textContent,/조회가 중단된 기록은 제외될 수 있어요/);assert.match(main.textContent,/12경기/);
 const range=field(main,'맞대결 집계 기간');assert.equal(range.value,'all');range.value='28';range.dispatch('change');await tick();
 const params=new URLSearchParams(calls.at(-1).split('?')[1]);assert.equal(params.get('period'),'28');assert.equal(params.get('type'),'52');assert.equal(params.get('a'),people[0].discord_id);assert.equal(params.get('b'),people[1].discord_id);
 assert.equal(field(main,'첫 번째 클럽원').value,people[0].discord_id);assert.equal(field(main,'두 번째 클럽원').value,people[1].discord_id);assert.equal(field(main,'맞대결 경기 종류').value,'52');assert.equal(range.value,'28');assert.equal(range.disabled,false);assert.match(main.textContent,/최근 28일 기록/);assert.match(main.textContent,/2경기/);assert.doesNotMatch(main.textContent,/누적 기록은 서버/);
});

test('changing an opponent keeps the selected duel period',async()=>{
 const calls=[];const {main,c,lib}=setup(async path=>{calls.push(path);return path==='/api/stats'?{members:people}:duelPayload('28',{b:null});});
 await lib.renderDuel(c,people[0].discord_id,null,'50','28');main.querySelectorAll('button').find(n=>n.textContent==='예시바람').click();await tick();
 const params=new URLSearchParams(calls.at(-1).split('?')[1]);assert.equal(params.get('period'),'28');assert.equal(params.get('type'),'50');assert.equal(params.get('b'),people[1].discord_id);assert.equal(field(main,'맞대결 집계 기간').value,'28');
});

test('failed cumulative or recent queries preserve selected period and retry the same filters',async()=>{
 const calls=[];let failing=false;const {main,c,lib}=setup(async path=>{calls.push(path);if(path==='/api/stats')return{members:people};if(failing)throw{code:'network'};return duelPayload(new URLSearchParams(path.split('?')[1]).get('period'));});
 await lib.renderDuel(c,people[0].discord_id,people[1].discord_id,'40');const range=field(main,'맞대결 집계 기간');failing=true;range.value='28';range.dispatch('change');await tick();
 assert.match(main.textContent,/다시 불러오기/);assert.equal(range.value,'28');assert.equal(range.disabled,false);assert.equal(field(main,'첫 번째 클럽원').disabled,false);assert.equal(field(main,'두 번째 클럽원').value,people[1].discord_id);assert.equal(field(main,'맞대결 경기 종류').value,'40');
 failing=false;main.querySelectorAll('button').find(n=>n.textContent==='다시 불러오기').click();await tick();assert.equal(new URLSearchParams(calls.at(-1).split('?')[1]).get('period'),'28');assert.match(main.textContent,/최근 28일 기록/);
});

test('duel dates distinguish earliest match, actual data refresh and latest match',async()=>{
 const {main,c,lib}=setup(async path=>path==='/api/stats'?{members:people}:duelPayload('all',{first_match_at:Date.UTC(2026,8,28),refreshed_at:Date.UTC(2026,10,27,3),updated_at:Date.UTC(2026,10,20)}));await lib.renderDuel(c);
 assert.match(main.textContent,/가장 이른 경기/);assert.match(main.textContent,/자료 확인/);assert.match(main.textContent,/최근 경기/);assert.doesNotMatch(main.textContent,/기록 확인/);
 const notes=main.querySelectorAll('p').map(n=>n.textContent);assert.match(notes.find(t=>t.startsWith('가장 이른 경기')),/2026.*9.*28/);assert.match(notes.find(t=>t.startsWith('자료 확인')),/2026.*11.*27/);assert.match(notes.find(t=>t.startsWith('최근 경기')),/2026.*11.*20/);
});

test('missing or invalid duel dates stay absent and never turn into epoch or invalid date labels',async()=>{
 const {main,c,lib}=setup(async path=>path==='/api/stats'?{members:people}:duelPayload('all',{first_match_at:null,refreshed_at:NaN,updated_at:0}));await lib.renderDuel(c);
 assert.doesNotMatch(main.textContent,/가장 이른 경기|자료 확인|최근 경기|1970|Invalid Date|NaN/);
});

test('legacy 28-day API results cannot be presented as cumulative records',async()=>{
 const data=duelPayload('28');delete data.period;const {main,c,lib}=setup(async path=>path==='/api/stats'?{members:people}:data);await lib.renderDuel(c);
 assert.equal(field(main,'맞대결 집계 기간').value,'all');assert.match(main.textContent,/현재 응답은 최근 28일 기록이에요/);assert.match(main.textContent,/누적 기록은 서버 반영 후 보여요/);assert.doesNotMatch(main.textContent,/정기 갱신으로 확인한 맞대결 전체/);
});
