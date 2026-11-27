/* NV member insights. The server supplies only collected club data; no external AI requests. */
(function(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const replace=(node,...children)=>node.replaceChildren(...children.filter(n=>n!=null&&n!==false));
const valueText=(value,unit='')=>finite(value)?`${Number.isInteger(value)?value:value.toFixed(unit==='%'?1:2).replace(/0+$/,'').replace(/\.$/,'')}${unit}`:'—';
const deltaText=(current,previous,unit='')=>finite(current)&&finite(previous)?`${current-previous>0?'+':''}${valueText(Math.round((current-previous)*100)/100,unit==='%'?'%p':unit)}`:'—';
function rivalHighlights(rows){
 const eligible=(rows||[]).filter(r=>r.played>=3&&finite(r.win_rate));
 const most=[...(rows||[])].sort((a,b)=>b.played-a.played)[0];
 const low=eligible.filter(r=>r.win_rate<50).sort((a,b)=>a.win_rate-b.win_rate||b.played-a.played)[0];
 const high=eligible.filter(r=>r.win_rate>50).sort((a,b)=>b.win_rate-a.win_rate||b.played-a.played)[0];
 return [['자주 만난 상대',most],['까다로운 상대',low],['내가 강한 상대',high]].filter(([,r])=>r);
}
function tools(c){
 const h=c.h;
 const error=e=>({member_unlinked:'이 클럽원의 게임 닉네임이 아직 연결되지 않았어요.',member_required:'클럽원을 골라 주세요.',same_member:'서로 다른 두 명을 골라 주세요.',bad_member:'클럽원을 다시 골라 주세요.',bad_type:'경기 종류를 다시 골라 주세요.',bad_period:'집계 기간을 다시 골라 주세요.'}[e?.code]||c.errorText(e));
 const note=text=>h('p',{class:'ni-note'},text);
 const empty=text=>h('div',{class:'ni-empty'},text);
 const selectMember=(label,items,value,blank)=>h('label',{class:'ni-field'},h('span',null,label),h('select',{class:'input', 'aria-label':label},blank?h('option',{value:''},blank):null,items.map(m=>h('option',{value:m.discord_id,selected:m.discord_id===value},`${m.name||m.nickname||'클럽원'}${m.discord_id===c.me?.id?' · 나':''}`))));
 const metricTable=(rows,duel)=>h('div',{class:'ni-scroll',role:'region','aria-label':duel?'맞대결 지표 비교':'개인 경기력과 클럽 평균',tabindex:'0'},h('table',{class:'ni-table'},h('thead',null,h('tr',null,(duel?['지표','선택 1','선택 2','기록 경기']:['지표','내 기록','클럽 평균','최근 5경기','이전 경기 대비']).map(v=>h('th',{scope:'col'},v)))),h('tbody',null,rows.map(m=>h('tr',null,h('th',{scope:'row'},m.label),h('td',null,valueText(duel?m.a:m.value,m.unit)),h('td',null,valueText(duel?m.b:m.club_value,m.unit)),h('td',null,duel?String(m.games??'—'):valueText(m.recent5_value,m.unit)),duel?null:h('td',null,deltaText(m.recent5_value,m.previous_value,m.unit)))))));
 const stamp=d=>d.updated_at?note(`기록 확인 ${new Date(d.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`):null;
 return{h,error,note,empty,selectMember,metricTable,stamp};
}
async function renderInsights(c,memberId,type=50){
 const{h,error,note,empty,selectMember,metricTable,stamp}=tools(c);c.setTitle('내 플레이 진단');
 const result=h('div',{class:'ni-results','aria-live':'polite'}),form=h('form',{class:'ni-filters'}),shell=h('div',{class:'ni-page'},form,result);
 c.show([...c.header('insights'),h('p',{class:'idx'},'MY PLAY'),h('h1',{class:'h1',tabindex:'-1'},'내 플레이 진단'),h('p',{class:'desc'},'최근 경기에서 잘한 점과 보완할 점을 클럽 기록과 함께 살펴봐요.'),shell]);
 let generation=0;result.append(empty('연결된 클럽원 목록을 불러오는 중이에요.'));
 let roster;try{roster=await c.api('/api/stats');}catch(e){if(!c.stale(c.seq)&&!e.handled)replace(result,empty(error(e)),h('button',{class:'btn btn-ghost',onclick:()=>renderInsights(c,memberId,type)},'다시 불러오기'));return;}
 if(c.stale(c.seq))return;
 const members=(roster.members||[]).filter(m=>m.link?.status==='ok');if(!members.length){replace(result,empty('연결된 클럽원 기록이 아직 없어요.'));return;}
 const chosen=members.some(m=>m.discord_id===memberId)?memberId:members.some(m=>m.discord_id===c.me?.id)?c.me.id:members[0].discord_id;
 const memberField=selectMember('분석할 클럽원',members,chosen),member=memberField.querySelector('select');
 const mode=h('select',{class:'input','aria-label':'진단 경기 종류'},[[50,'공식경기'],[52,'감독모드']].map(([v,t])=>h('option',{value:v,selected:Number(type)===v},t)));
 const submit=h('button',{class:'btn btn-primary',type:'submit'},'진단 보기');
 form.append(memberField,h('label',{class:'ni-field'},h('span',null,'경기 종류'),mode),submit);form.addEventListener('submit',e=>{e.preventDefault();load();});
 async function load(){
  const mine=++generation,alive=()=>!c.stale(c.seq)&&mine===generation&&shell.isConnected;submit.disabled=true;result.setAttribute('aria-busy','true');
  member.disabled=true;mode.disabled=true;
  if(!result.querySelector('.ni-summary'))replace(result,empty('경기 기록을 분석하고 있어요.'));
  try{const d=await c.api(`/api/stats/insights?${new URLSearchParams({member:member.value,type:mode.value})}`);if(!alive())return;draw(d);}
  catch(e){if(alive()&&!e.handled)replace(result,empty(error(e)),h('button',{class:'btn btn-ghost',type:'button',onclick:load},'다시 불러오기'));}
  finally{if(alive()){submit.disabled=false;member.disabled=false;mode.disabled=false;result.removeAttribute('aria-busy');}}
 }
 function patterns(d){
  const side=(data,title)=>h('section',{class:'ni-panel'},h('h3',null,title),['methods','locations'].map((key)=>{
   const g=data?.[key];return h('div',{class:'ni-pattern'},h('h4',null,key==='methods'?'골 방식':'골 위치'),note(`기록 ${g?.games??0}경기 · ${valueText(g?.total,'골')}`),g?.items?.length?h('dl',{class:'ni-bars'},g.items.map(i=>h('div',null,h('dt',null,i.label),h('dd',null,h('span',null,`${valueText(i.count,'골')} · ${valueText(i.percent,'%')}`),h('i',{'aria-hidden':'true',style:`--ni-bar:${Math.max(0,Math.min(100,finite(i.percent)?i.percent:0))}%`})) ))):empty('이 항목의 골 기록을 아직 확인하지 못했어요.'));}),note(`자책골 ${valueText(data?.own_goals?.count,'골')} · 기록 ${data?.own_goals?.games??0}경기`));
  return h('section',null,h('h2',{class:'ni-h2'},'득점·실점 패턴'),note('골 방식과 위치는 같은 골을 각각 분류한 값이에요. 두 분류를 더하지 않아요. 확인되지 않은 기록은 —로 표시해요.'),h('div',{class:'ni-two'},side(d.patterns?.for,'내가 넣은 골'),side(d.patterns?.against,'내가 내준 골')));
 }
 function draw(d){
  const s=d.summary||{},r=d.recent5||{},coverage=d.coverage||{};
  const cards=[['최근 경기',`${s.played??0}경기`],['승 · 무 · 패',`${s.win??0} · ${s.draw??0} · ${s.lose??0}`],['최근 5경기',finite(r.played)?`${r.win??0}승 ${r.draw??0}무 ${r.lose??0}패`:'—'],['정상 종료',valueText(s.normal_games,'경기')]];
  replace(result,h('section',{class:'ni-summary','aria-label':'최근 전적 요약'},cards.map(([title,value])=>h('div',null,h('span',null,title),h('strong',null,value)))),
   note(`최근 최대 ${d.window?.size||30}경기 · 경기력은 정상 종료 기록 기준 · 몰수 ${valueText(s.forfeit_games,'경기')} · 종료 확인 전 ${valueText(s.unknown_end_games,'경기')}`),
   coverage.pending?h('p',{class:'info',role:'status'},'새 진단 기록을 순서대로 모으는 중이에요. 확인된 기록부터 보여 드려요.'):null,
   h('section',null,h('h2',{class:'ni-h2'},'이번 기록에서 볼 점'),d.diagnoses?.length?h('div',{class:'ni-diagnoses'},d.diagnoses.map(x=>h('article',{class:`ni-diagnosis ni-${['strength','improve','trend'].includes(x.kind)?x.kind:'trend'}`},h('span',null,{strength:'강점',improve:'보완할 점',trend:'최근 변화'}[x.kind]||'참고'),h('h3',null,x.title),h('p',null,x.text)))):empty('진단에 필요한 경기 수가 아직 부족해요. 충분한 기록이 모이면 표시해요.')),
   h('section',null,h('h2',{class:'ni-h2'},'경기력과 클럽 평균'),d.metrics?.length?metricTable(d.metrics,false):empty('표시할 경기력 지표가 아직 없어요.'),note(`클럽 평균은 정상 종료 기록이 ${d.club?.min_games??5}경기 이상인 클럽원 ${d.club?.members??0}명 기준이에요. 항목마다 유효한 기록 수가 다를 수 있어요.`)),
   patterns(d),stamp(d),h('p',{class:'sq-src'},'Data based on NEXON Open API'));
 }
 await load();
}
async function renderDuel(c,aId,bId,type='all',period='all'){
 const{h,error,note,empty,selectMember,metricTable}=tools(c);c.setTitle('클럽원 맞대결');
 const form=h('form',{class:'ni-filters'}),result=h('div',{class:'ni-results','aria-live':'polite'}),shell=h('div',{class:'ni-page'},form,result);
 c.show([...c.header('duel'),h('p',{class:'idx'},'CLUB RIVAL'),h('h1',{class:'h1',tabindex:'-1'},'클럽원 맞대결'),h('p',{class:'desc'},'모아 둔 내전에서 두 클럽원의 상대 전적을 비교해요.'),shell]);
 let roster;try{roster=await c.api('/api/stats');}catch(e){if(!c.stale(c.seq)&&!e.handled)replace(result,empty(error(e)));return;}if(c.stale(c.seq))return;
 const members=(roster.members||[]).filter(m=>m.link?.status==='ok');if(!members.length){result.append(empty('비교할 클럽원 기록이 아직 없어요.'));return;}
 const fa=selectMember('첫 번째 클럽원',members,aId||c.me?.id),fb=selectMember('두 번째 클럽원',members,bId,'상대를 고르세요');
 const a=fa.querySelector('select'),b=fb.querySelector('select'),mode=h('select',{class:'input','aria-label':'맞대결 경기 종류'},[['all','수집한 내전 전체'],['40','클래식 1on1'],['50','공식경기'],['52','감독모드']].map(([v,label])=>h('option',{value:v,selected:String(type)===v},label)));
 const range=h('select',{class:'input','aria-label':'맞대결 집계 기간'},[['all','누적'],['28','최근 28일']].map(([v,label])=>h('option',{value:v,selected:(String(period)==='28'?'28':'all')===v},label)));
 const submit=h('button',{class:'btn btn-primary',type:'submit'},'맞대결 보기');form.append(fa,fb,h('label',{class:'ni-field'},h('span',null,'경기 종류'),mode),h('label',{class:'ni-field'},h('span',null,'집계 기간'),range),submit);
 let generation=0;form.addEventListener('submit',e=>{e.preventDefault();load();});range.addEventListener('change',load);
 async function load(){
  if(a.value===b.value){replace(result,empty('서로 다른 두 명을 골라 주세요.'));return;}
  const mine=++generation,alive=()=>!c.stale(c.seq)&&mine===generation&&shell.isConnected;submit.disabled=true;a.disabled=true;b.disabled=true;mode.disabled=true;range.disabled=true;result.setAttribute('aria-busy','true');
  try{const qs=new URLSearchParams({a:a.value,type:mode.value,period:range.value});if(b.value)qs.set('b',b.value);const d=await c.api(`/api/stats/duel?${qs}`);if(alive())draw(d);}
  catch(e){if(alive()&&!e.handled)replace(result,empty(error(e)),h('button',{class:'btn btn-ghost',type:'button',onclick:load},'다시 불러오기'));}
  finally{if(alive()){submit.disabled=false;a.disabled=false;b.disabled=false;mode.disabled=false;range.disabled=false;result.removeAttribute('aria-busy');}}
 }
 function draw(d){
  const s=d.summary||{},name=p=>p?.name||p?.nickname||'클럽원';
  const shownPeriod=d.period==='all'?'all':d.period==='28'||d.days===28?'28':null;
  const datedNote=(label,at,dayOnly=false)=>{if(!finite(at)||at<=0)return null;const date=new Date(at);if(!Number.isFinite(date.getTime()))return null;return note(`${label} ${dayOnly?date.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`);};
  const rivalRows=(d.opponents||[]).map(r=>h('tr',null,h('th',{scope:'row'},h('button',{class:'btn btn-text',type:'button',onclick:()=>{b.value=r.member.discord_id;load();}},name(r.member))),h('td',null,r.played),h('td',null,`${r.win} / ${r.draw} / ${r.lose}`),h('td',null,valueText(r.win_rate,'%'))));
  replace(result,
   note(shownPeriod==='all'?'누적 기록':shownPeriod==='28'?'최근 28일 기록':'집계 기간을 확인하지 못했어요. 기록 범위를 다시 확인해 주세요.'),
   shownPeriod==='28'&&range.value==='all'?note('현재 응답은 최근 28일 기록이에요. 누적 기록은 서버 반영 후 보여요.'):null,
   shownPeriod==='all'?note('정기 갱신으로 확인한 맞대결을 모아요. 조회가 중단된 기록은 제외될 수 있어요.'):null,
   d.b?h('section',{class:'ni-duel-score','aria-label':'맞대결 승수'},h('div',null,h('span',null,name(d.a)),h('strong',null,`${s.a_win??0}승`),h('small',null,valueText(s.a_goals,'득점'))),h('div',{class:'ni-duel-mid'},`${s.played??0}경기`,h('small',null,`${s.draw??0}무`)),h('div',null,h('span',null,name(d.b)),h('strong',null,`${s.b_win??0}승`),h('small',null,valueText(s.b_goals,'득점')))):empty('아래 상대 목록에서 클럽원을 누르거나 위에서 상대를 골라 주세요.'),
   d.b&&d.metrics?.length?metricTable(d.metrics,true):null,
   d.b?note(`경기력 지표는 정상 종료 ${d.coverage?.normal_games??0}경기 기준이에요. 몰수 ${d.coverage?.forfeit_games??0}경기와 종료 확인 전 ${d.coverage?.unknown_end_games??0}경기는 승패에만 포함해요.`):null,
   h('div',{class:'ni-rivals'},rivalHighlights(d.opponents).map(([label,r])=>h('button',{class:'ni-rival',type:'button',onclick:()=>{b.value=r.member.discord_id;load();}},h('small',null,label),h('strong',null,name(r.member)),h('span',null,`${r.played}경기 · 내 승률 ${valueText(r.win_rate,'%')}`)))),
   d.b?h('section',null,h('h2',{class:'ni-h2'},'최근 맞대결'),d.matches?.length?h('ul',{class:'ni-match-list'},d.matches.map(m=>h('li',null,h('time',null,new Date(m.played_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+({40:'클래식',50:'공식경기',52:'감독모드'}[m.match_type]||'내전')),h('span',null,`${name(m.a)} ${m.a?.goals??'—'} : ${m.b?.goals??'—'} ${name(m.b)}`)))):empty('이 기간에 수집한 두 사람의 맞대결이 없어요.')):null,
   h('section',null,h('h2',{class:'ni-h2'},`${name(d.a)}의 상대별 전적`),rivalRows.length?h('div',{class:'ni-scroll'},h('table',{class:'ni-table'},h('thead',null,h('tr',null,['상대','경기','승 / 무 / 패','승률'].map(t=>h('th',{scope:'col'},t)))),h('tbody',null,rivalRows))):empty('이 기간에 수집한 상대별 내전 기록이 없어요.')),
   note(`상대별 강약점은 3경기 이상에서 표시해요. ${shownPeriod==='all'?'정기 갱신으로 확인한 맞대결 전체를 집계해요.':shownPeriod==='28'?'최근 28일 수집 기록 전체로 집계해요.':''} 경기 상세는 최신 30경기까지 보여 드려요. 수집하지 못한 경기는 포함되지 않아요.`),
   datedNote('가장 이른 경기',d.first_match_at,true),datedNote('자료 확인',d.refreshed_at),datedNote('최근 경기',d.updated_at),h('p',{class:'sq-src'},'Data based on NEXON Open API'));
 }
 await load();
}
root.NVInsights=Object.freeze({renderInsights,renderDuel,valueText,deltaText,rivalHighlights});
})(globalThis);
