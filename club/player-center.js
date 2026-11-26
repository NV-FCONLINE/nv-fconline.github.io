/* NV 선수 DB·카드 리뷰·팀컬러 찾기. 화면 문맥을 주입해 기존 클럽 인증과 자료 캐시를 함께 쓴다. */
(function (root) {
  'use strict';
  const POS_ROWS = [['LW','CF','ST','RW'],['LM','CAM','CM','CDM','RM'],['LWB','LB','CB','RB','RWB'],['GK']];
  const POSITIONS = POS_ROWS.flat();
  const CATEGORIES={all:'전체',club:'클럽',nation:'국가',season:'시즌',special:'특성'};
  const FACE = 'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/';
  const BONUS = [0,0,1,2,4,6,8,11,15,17,19,21,24,27];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const asArray = v => Array.isArray(v) ? v : [];
  const number = (v, fallback = null) => v === '' || v == null || !Number.isFinite(Number(v)) ? fallback : Number(v);
  const setChildren = (el,...kids) => el.replaceChildren(...kids.flat(Infinity).filter(v=>v!=null&&v!==false));
  const normal = v => String(v || '').normalize('NFC').replace(/\s+/g,' ').trim();
  function buildQueries(f, page = 1) {
    const groups = [...new Set(asArray(f.groups))].filter(g => POSITIONS.includes(g));
    const traits = [...new Set(asArray(f.traits))].filter(t => typeof t === 'string' && t);
    if (groups.length > 3) throw new Error('포지션은 한 번에 세 곳까지 골라 주세요.');
    if (traits.length > 3) throw new Error('특성은 한 번에 세 개까지 골라 주세요.');
    const base = { page: String(page) }, name = normal(f.name);
    if (name) base.name = name;
    if (f.pay) base.pay = String(f.pay);
    if (f.season) base.season = String(f.season);
    traits.forEach((t,i) => { base['t'+(i+1)] = t; });
    if (f.ability && f.minimum) { base.a1 = f.ability; base.m1 = String(f.minimum); }
    return groups.length ? groups.map(g => ({...base,g})) : [{...base,all:'1'}];
  }
  function mergePlayers(responses) {
    const map = new Map();
    for (const d of responses) for (const p of asArray(d?.players)) if (p && Number.isSafeInteger(p.spid) && !map.has(p.spid)) map.set(p.spid,p);
    return [...map.values()].sort((a,b) => bestOvr(b)-bestOvr(a) || b.spid-a.spid);
  }
  function bestOvr(p) { const values=Object.values(p?.pos || {}).filter(finite); return values.length ? Math.max(...values) : finite(p?.ovr) ? p.ovr : -1; }
  function reviewBody(value) {
    const body=String(value || '').normalize('NFC').trim();
    if (!body || [...body].length>2000) throw new Error('후기는 1~2,000자로 써 주세요.');
    return body;
  }
  function playerLabel(p) { return [p?.season,p?.name || (p?.spid ? `선수 #${p.spid}` : '')].filter(Boolean).join(' · '); }
  function seasonsOf(meta) {
    const raw=meta.seasons || Object.keys(meta.season_styles || {});
    return asArray(raw).map(s=>Array.isArray(s)?{id:String(s[0]),name:String(s[1]||s[0])}:typeof s==='object'?{id:String(s.code ?? s.id ?? s.seasonId ?? ''),name:String(s.name ?? s.className ?? s.code ?? s.seasonId ?? '')}:{id:String(s),name:String(s)}).filter(s=>s.id);
  }
  function errText(c,e) {
    const errors={review_exists:'이 카드·강화 단계에 작성한 후기가 있어요. 기존 후기를 고쳐 주세요.',review_body:'후기를 1~2,000자로 써 주세요.',review_missing:'후기를 찾지 못했어요.',bad_review:'평점과 후기 내용을 확인해 주세요.',rate:'짧은 시간에 너무 많이 요청했어요. 잠시 뒤 다시 해 주세요.',bad_season:'시즌을 다시 골라 주세요.'};
    return errors[e?.code] || (c.errorText && c.errorText(e)) || '자료를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }
  function tools(c) {
    const h=c.h;
    const button=(text,fn,props={})=>h('button',{type:'button',class:'btn btn-ghost',onclick:fn,...props},text);
    const field=(label,control)=>h('label',{class:'pc-field'},h('span',null,label),control);
    const select=(label,items,value,onchange)=>h('select',{class:'input select','aria-label':label,onchange:e=>onchange(e.target.value)},items.map(([v,t])=>h('option',{value:v,selected:String(v)===String(value)?true:null},t)));
    const note=text=>h('p',{class:'pc-note'},text);
    const loading=text=>h('p',{class:'loading',role:'status'},text || '불러오는 중이에요.');
    const error=(e,retry)=>h('div',{class:'alert',role:'alert'},h('p',null,errText(c,e)),retry?button('다시 불러오기',retry):null);
    const source=()=>note('선수·능력치·팀컬러 자료: FC온라인 공식 홈페이지 데이터센터(넥슨). 받아 둔 때의 자료이며 현재 게임과 차이가 날 수 있어요.');
    const head=(active,title,desc)=>[(typeof c.header==='function'?c.header(active):c.header)||[],h('p',{class:'idx'},'NV DATA CENTER'),h('h1',{class:'h1',tabindex:'-1'},title),h('p',{class:'desc'},desc)];
    return {h,button,field,select,note,loading,error,source,head};
  }
  const dead = (c,node) => (c.stale && c.stale(c.seq)) || !node.isConnected;
  function image(h,src,cls,alt='',fallback=null) {
    if (!src || !/^https:\/\/(?:fco\.dn\.nexoncdn\.co\.kr|ssl\.nexon\.com)\//.test(src)) return h('span',{class:cls+' pc-photo-empty','aria-hidden':'true'},'NV');
    return h('img',{src,class:cls,alt,loading:'lazy',decoding:'async',onerror:e=>{const el=e.currentTarget;if(fallback&&el.getAttribute('src')!==fallback){el.setAttribute('src',fallback);}else el.hidden=true;}});
  }
  function cardRow(c,p,onPick) {
    const {h}=c, vals=Object.entries(p.pos || {}).filter(([,v])=>finite(v)).sort((a,b)=>b[1]-a[1]), role=vals[0]?.[0] || p.position || '';
    const ovr=bestOvr(p), label=playerLabel(p);
    return h('button',{type:'button',class:'pc-player','aria-label':`${label} 상세 보기`,onclick:e=>onPick(p,e.currentTarget)},
      h('span',{class:'pc-photo'},image(h,p.img?FACE+'playersAction/'+p.img+'.png':FACE+'players/p'+(p.spid%1000000)+'.png','pc-face','',FACE+'players/p'+(p.spid%1000000)+'.png'),h('span',{class:'pc-pos'},role)),
      h('span',{class:'pc-player-body'},h('span',{class:'pc-season'},p.season?image(h,'https://ssl.nexon.com/s2/game/fc/online/obt/externalAssets/new/season/'+encodeURIComponent(p.season)+'.png','pc-season-icon'):null,p.season || ''),h('strong',null,p.name || `선수 #${p.spid}`),h('small',null,[p.pay!=null?'급여 '+p.pay:null,p.foot].filter(Boolean).join(' · '))),
      h('span',{class:'pc-player-ovr'},h('small',null,'1강 OVR'),h('b',null,ovr<0?'—':String(ovr)),h('span',{'aria-hidden':'true'},'›')));
  }
  function openDetail(c,p,meta,trigger) {
    const {h,button,select,note,loading,error}=tools(c);
    const content=h('div',{class:'pc-detail-body'},loading('선수 상세를 불러오는 중이에요.'));
    const close=()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();};
    let grade=1,detail=null;
    const body=()=>{if(!detail)return;const card={...p,grade,ft:{}};
      setChildren(content,c.detailBody ? c.detailBody(card,detail,meta,{},null,null) : h('div',null,h('p',null,[detail.info?.height,detail.info?.physical].filter(Boolean).join(' · ')),h('ul',{class:'pc-facts'},Object.entries(detail.stats || {}).map(([k,v])=>h('li',null,k+' '+(v+BONUS[grade]))))));};
    const dialog=h('div',{class:'pc-dialog-backdrop',onclick:e=>{if(e.target===dialog)close();}},h('section',{class:'pc-dialog',role:'dialog','aria-modal':'true','aria-label':playerLabel(p)+' 상세'},
      h('div',{class:'pc-dialog-head'},h('h2',null,playerLabel(p)),button('닫기',close,{'aria-label':'선수 상세 닫기'})),
      h('div',{class:'pc-actions'},select('상세 강화 단계',Array.from({length:13},(_,i)=>[i+1,`${i+1}강`]),grade,value=>{grade=Number(value);body();}),h('a',{class:'btn btn-ghost',href:`#/players/reviews/${p.spid}`,onclick:()=>dialog.remove()},'이 카드의 리뷰 보기·작성'),h('a',{class:'btn btn-text',href:`https://fconline.nexon.com/DataCenter/PlayerInfo?spid=${p.spid}&n1Strong=1`,target:'_blank',rel:'noopener noreferrer'},'공식 데이터센터')),content,note('강화에 따른 능력치이며 팀컬러와 적응도는 포함하지 않아요.')));
    dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){const list=[...dialog.querySelectorAll('a[href],button:not([disabled]),select:not([disabled]),textarea,input')].filter(x=>!x.hidden);const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    trigger.closest('.pc-center').append(dialog);dialog.querySelector('button').focus();
    const load=async()=>{setChildren(content,loading());try{detail=await c.getDetail(p.spid);if(!dead(c,dialog))body();}catch(e){if(!e.handled&&!dead(c,dialog))setChildren(content,error(e,load));}};load();
  }
  async function renderPlayers(c) {
    const {h,button,field,select,note,loading,error,source,head}=tools(c);
    c.setTitle('선수 DB');
    const page=h('div',{class:'pc-center'}),wait=loading();c.show([head('players','선수 DB','포지션·시즌·보유 특성으로 찾고, 클럽원의 사용 후기를 확인해 보세요.'),page]);page.append(wait);
    let meta;try{meta=await c.meta();}catch(e){if(!e.handled&&!dead(c,page))setChildren(page,error(e,()=>renderPlayers(c)));return;}if(dead(c,page))return;
    let request=0,rows=[],responses=[],shown=40,nextPage=1,more=false,applied=null;
    const f={name:'',season:'',groups:[],traits:[],pay:'',ability:'',minimum:''};
    const nameIn=h('input',{class:'input',type:'search',maxlength:30,placeholder:'예: 손흥민','aria-label':'선수 이름'});
    const seasonIn=select('시즌',[['','전체 시즌'],...seasonsOf(meta).map(s=>[s.id,s.name])],'',v=>{f.season=v;});
    const posBox=h('div',{class:'pc-pitch',role:'group','aria-label':'포지션 복수 선택, 세 곳까지'});
    const posNote=note('포지션은 세 곳까지 함께 찾을 수 있어요.');
    function drawPos(){const change=g=>{if(!g)f.groups=[];else if(f.groups.includes(g))f.groups=f.groups.filter(v=>v!==g);else if(f.groups.length<3)f.groups.push(g);else{posNote.textContent='한 번에 세 곳까지예요. 고른 포지션을 다시 누르면 풀려요.';return;}for(const b of posBox.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.textContent==='전체'?!f.groups.length:f.groups.includes(b.textContent)));};setChildren(posBox,button('전체',()=>change(null),{'aria-pressed':String(!f.groups.length),class:'pc-position pc-all'}),...POS_ROWS.map(line=>h('div',{class:'pc-pitch-row'},line.map(g=>button(g,()=>change(g),{class:'pc-position','aria-pressed':String(f.groups.includes(g))})))));}
    drawPos();
    const traitBox=h('div',{class:'pc-traits',role:'group','aria-label':'보유 특성, 세 개까지'}),traitNote=note('함께 고른 특성을 모두 가진 선수를 찾아요(최대 세 개).');
    function drawTraits(focus){const icons=meta.trait_icons || {};setChildren(traitBox,...asArray(meta.traits).map(t=>{const item=typeof t==='string'?{name:t}:t,name=item.name,icon=number(item.icon ?? icons[name]);const selected=f.traits.includes(name);return button('',()=>{if(selected)f.traits=f.traits.filter(x=>x!==name);else if(f.traits.length<3)f.traits.push(name);else{traitNote.textContent='특성은 한 번에 세 개까지 골라 주세요.';return;}drawTraits(name);},{class:'pc-trait'+(asArray(meta.new_traits).includes(name)?' pc-new-trait':''),'aria-label':name,title:name,'aria-pressed':String(selected)});}));[...traitBox.children].forEach((b,i)=>{const item=meta.traits[i],name=typeof item==='string'?item:item.name,icon=number((typeof item==='object'?item.icon:null)??icons[name]);b.append(icon!=null?image(h,FACE+'traits/trait_icon_'+icon+'.png','pc-trait-icon'):h('span',{'aria-hidden':'true'},name.slice(0,1)),h('span',{class:'pc-trait-name'},name));});if(focus)[...traitBox.children].find(b=>b.getAttribute('aria-label')===focus)?.focus();}
    drawTraits();
    const payIn=h('input',{class:'input',type:'number',min:1,max:60,inputmode:'numeric',placeholder:'제한 없음','aria-label':'급여 상한'});
    const abilityIn=select('능력치 조건',[['','선택 안 함'],...asArray(meta.abilities)],'',v=>{f.ability=v;});
    const minIn=h('input',{class:'input',type:'number',min:1,max:200,inputmode:'numeric',placeholder:'최소 능력치','aria-label':'최소 능력치'});
    const submit=h('button',{class:'btn btn-red',type:'submit'},'선수 검색');
    const result=h('section',{class:'pc-results','aria-labelledby':'pc-results-title'}),list=h('div',{class:'pc-player-list'}),status=h('p',{class:'pc-note',role:'status'}),resultHead=h('h2',{id:'pc-results-title',class:'pc-h2'},'검색 결과');
    const moreBtn=button('더 보기',()=>{if(shown<rows.length){shown+=40;paint();}else if(more)search(true);});
    const resultBody=h('div',null,resultHead,status,list,moreBtn);result.append(resultBody);
    function paint(){setChildren(list,...rows.slice(0,shown).map(p=>cardRow(c,p,(p,b)=>openDetail(c,p,meta,b))));moreBtn.hidden=shown>=rows.length&&!more;moreBtn.textContent=shown<rows.length?`선수 더 보기 (${Math.min(shown,rows.length)}/${rows.length})`:'다음 검색 결과 받기';status.textContent=`받은 카드 ${rows.length.toLocaleString()}장 · 1강 OVR 높은 순${responses.some(d=>d.stale)?' · 지난 자료':''}${more?' · 다음 결과 있음':''}`;if(!rows.length)list.append(note('조건에 맞는 선수를 찾지 못했어요. 이름이나 조건을 줄여 보세요.'));}
    async function search(append=false){const ticket=++request;let queries;try{if(!append){f.name=nameIn.value;f.pay=payIn.value;f.minimum=minIn.value;applied=JSON.parse(JSON.stringify(f));nextPage=1;}queries=buildQueries(applied,nextPage);}catch(e){status.textContent=e.message;return;}submit.disabled=true;moreBtn.disabled=true;result.setAttribute('aria-busy','true');status.textContent='선수 검색 중이에요.';
      try{const ds=[];for(const q of queries){if(dead(c,page)||ticket!==request)return;ds.push(await(c.players?c.players(q):c.api('/api/squad/players?'+new URLSearchParams(q))));}if(dead(c,page)||ticket!==request)return;responses=append?responses.concat(ds):ds;rows=mergePlayers(responses);more=ds.some(d=>d.more)&&nextPage<5;nextPage++;shown=append?shown+40:40;paint();}
      catch(e){if(e.handled||dead(c,page)||ticket!==request)return;status.textContent=errText(c,e);const retry=button('다시 검색',()=>search(append));status.append(h('span',null,' '),retry);}
      finally{if(!dead(c,page)&&ticket===request){submit.disabled=false;moreBtn.disabled=false;result.removeAttribute('aria-busy');}}}
    const filters=h('details',{class:'pc-filters',open:true},h('summary',null,'검색 조건'),h('form',{onsubmit:e=>{e.preventDefault();return search();}},field('선수 이름',nameIn),field('시즌',seasonIn),h('div',{class:'pc-field'},h('span',null,'포지션 · 복수 선택'),posBox,posNote),h('details',{class:'pc-trait-details',open:true},h('summary',null,'보유 특성'),traitBox,traitNote),h('details',{class:'pc-extra-filters'},h('summary',null,'급여·능력치 조건'),field('급여 상한',payIn),field('능력치',abilityIn),field('최소 능력치',minIn)),h('div',{class:'pc-actions'},button('초기화',()=>{f.name='';f.groups=[];f.traits=[];f.season='';f.pay='';f.ability='';f.minimum='';nameIn.value='';seasonIn.value='';payIn.value='';abilityIn.value='';minIn.value='';drawPos();drawTraits();search();}),submit)));
    setChildren(page,h('div',{class:'pc-layout'},filters,result),source());
    if(typeof matchMedia==='function'&&matchMedia('(max-width: 700px)').matches)filters.open=false;
    await search();
  }
  async function renderReviews(c,spid) {
    const {h,button,field,select,note,loading,error,source,head}=tools(c);
    c.setTitle('선수 리뷰');spid=number(spid);if(!Number.isSafeInteger(spid)||spid<100000)spid=null;
    const page=h('div',{class:'pc-center'}),list=h('div',{class:'pc-review-list'}),summary=h('p',{class:'pc-note',role:'status'}),editor=h('div',{class:'pc-review-editor'}),search=h('input',{class:'input',type:'search',placeholder:'예: 손흥민','aria-label':'리뷰할 선수 이름',maxlength:30}),findResults=h('div',{class:'pc-review-find'});
    c.show([head('reviews','클럽원 선수 리뷰','직접 써 본 시즌 카드의 체감과 장단점을 나눠 주세요. 후기는 NV 클럽원에게만 보여요.'),page]);
    let request=0,before=null,grade='',selected=spid,moreBtn,saveBusy=false;
    const picked=h('h2',{class:'pc-h2'},selected?`선수 #${selected}`:'최근 선수 리뷰');
    const gradeSel=select('후기 강화 단계 필터',[['','모든 강화'],...Array.from({length:13},(_,i)=>[i+1,`${i+1}강`])],'',v=>{grade=v;load();});
    const searchForm=h('form',{class:'pc-review-search',onsubmit:async e=>{e.preventDefault();const name=normal(search.value);if(!name)return;const ticket=++request;setChildren(findResults,loading());try{const d=await(c.players?c.players({name,page:'1'}):c.api('/api/squad/players?'+new URLSearchParams({name})));if(dead(c,page)||ticket!==request)return;setChildren(findResults,...asArray(d.players).slice(0,20).map(p=>button(playerLabel(p),()=>{location.hash='#/players/reviews/'+p.spid;})));if(!asArray(d.players).length)findResults.append(note('선수를 찾지 못했어요.'));}catch(err){if(!err.handled&&!dead(c,page)&&ticket===request)setChildren(findResults,error(err));}}},field('리뷰할 선수 찾기',search),h('button',{type:'submit',class:'btn btn-ghost'},'선수 찾기'));
    function edit(review){if(saveBusy)return;const isEdit=!!review,rating=select('별점',[1,2,3,4,5].map(n=>[n,'★'.repeat(n)+' '+n+'점']),review?.rating||5,()=>{}),g=select('사용한 강화 단계',Array.from({length:13},(_,i)=>[i+1,`${i+1}강`]),review?.grade||grade||1,()=>{}),body=h('textarea',{class:'input',rows:6,maxlength:2000,'aria-label':'사용 후기',placeholder:'사용 포지션·장점·아쉬운 점을 적어 주세요.'},review?.body||''),message=h('p',{class:'pc-note',role:'status'}),submit=h('button',{type:'submit',class:'btn btn-red'},isEdit?'후기 수정':'후기 등록');g.disabled=isEdit;
      const form=h('form',{class:'pc-review-form',onsubmit:async e=>{e.preventDefault();if(saveBusy)return;let text;try{text=reviewBody(body.value);}catch(err){message.textContent=err.message;return;}saveBusy=true;submit.disabled=true;message.textContent='저장 중이에요.';try{await c.api(isEdit?'/api/player-reviews/'+review.id:'/api/player-reviews',{method:isEdit?'PATCH':'POST',body:isEdit?{rating:Number(rating.value),body:text}:{spid:selected,grade:Number(g.value),rating:Number(rating.value),body:text}});if(dead(c,page))return;setChildren(editor,);c.toast('후기를 저장했어요.');await load();}catch(err){if(!err.handled&&!dead(c,page))message.textContent=errText(c,err);}finally{saveBusy=false;if(!dead(c,page))submit.disabled=false;}}},h('h3',null,isEdit?'후기 수정':'새 후기'),h('div',{class:'pc-form-grid'},field('강화',g),field('평점',rating)),field('사용 후기',body),note('개인정보나 비방을 적지 말아 주세요. 같은 카드·강화에는 한 사람당 후기 하나를 남길 수 있어요.'),message,h('div',{class:'pc-actions'},button('취소',()=>{if(!saveBusy)setChildren(editor,);}),submit));setChildren(editor,form);body.focus();}
    function reviewNode(r){const controls=[];if(r.can_edit)controls.push(button('수정',()=>edit(r)));if(r.can_delete)controls.push(button('삭제',()=>{const check=h('div',{class:'pc-delete-check',role:'alert'},h('p',null,'이 후기를 삭제할까요?'),button('취소',()=>check.remove()),button('삭제하기',async e=>{const target=e?.currentTarget;if(target)target.disabled=true;try{await c.api('/api/player-reviews/'+r.id,{method:'DELETE'});if(!dead(c,page)){c.toast('후기를 삭제했어요.');await load();}}catch(err){if(!err.handled&&!dead(c,page)){check.append(note(errText(c,err)));if(target)target.disabled=false;}}}));article.append(check);}));const article=h('article',{class:'pc-review'},h('div',{class:'pc-review-top'},h('a',{href:'#/players/reviews/'+r.spid},r.player_name||`선수 #${r.spid}`),h('span',{class:'pc-stars','aria-label':r.rating+'점'},'★'.repeat(r.rating)+'☆'.repeat(5-r.rating)),h('span',null,r.grade+'강')),h('p',{class:'pc-review-author'},r.author?.name||'알 수 없음',r.author?.is_staff?' · 운영진':'',' · ',new Date(r.created_at).toLocaleDateString('ko-KR')),h('p',{class:'pc-review-body'},r.body),controls.length?h('div',{class:'pc-actions'},controls):null);return article;}
    async function load(append=false){const ticket=++request;if(!append){before=null;setChildren(list,loading());}moreBtn.disabled=true;const q={};if(selected)q.spid=selected;if(grade)q.grade=grade;if(append&&before)q.before=before;try{const d=await c.api('/api/player-reviews?'+new URLSearchParams(q));if(dead(c,page)||ticket!==request)return;const reviews=asArray(d.reviews);if(!append)setChildren(list,);list.append(...reviews.map(reviewNode));if(!reviews.length&&!append)list.append(note('아직 작성된 후기가 없어요. 첫 후기를 남겨 주세요.'));before=d.next_before||null;moreBtn.hidden=!before;const count=d.summary?.count??reviews.length,avg=d.summary?.avg_rating;summary.textContent=`후기 ${count}개${finite(avg)?' · 평균 '+avg.toFixed(1)+'점':''}`;}catch(err){if(!err.handled&&!dead(c,page)&&ticket===request){if(!append)setChildren(list,error(err,()=>load()));else summary.textContent=errText(c,err);}}finally{if(!dead(c,page)&&ticket===request)moreBtn.disabled=false;}}
    moreBtn=button('이전 후기 더 보기',()=>load(true));moreBtn.hidden=true;
    page.append(searchForm,findResults,h('div',{class:'pc-review-toolbar'},picked,gradeSel,selected?button('후기 작성',()=>edit(null)):null,h('a',{class:'btn btn-text',href:'#/players/reviews'},'전체 후기')),summary,editor,list,moreBtn,source());
    if(selected)c.getDetail(selected).then(d=>{if(!dead(c,page)){picked.textContent=playerLabel(d)||`선수 #${selected}`;}}).catch(()=>{});
    await load();
  }
  async function renderTeamColors(c) {
    const {h,button,field,select,note,loading,error,source,head}=tools(c);
    c.setTitle('팀컬러 찾기');const page=h('div',{class:'pc-center'});c.show([head('colors','팀컬러 찾기','원하는 능력치를 올려 주는 팀컬러를 찾고 단계별 효과를 확인해 보세요.'),page]);
    let meta;try{meta=await c.meta();}catch(e){if(!e.handled&&!dead(c,page))setChildren(page,error(e,()=>renderTeamColors(c)));return;}if(dead(c,page))return;
    let request=0,selection=0;const q=h('input',{type:'search',class:'input','aria-label':'팀컬러 이름',placeholder:'예: 레알 마드리드'}),cat=select('팀컬러 유형',[['all','전체 유형'],['club','클럽'],['nation','국가'],['season','시즌'],['special','특성']],'all',()=>{}),stat=select('올리고 싶은 능력치',[['','전체 능력치'],...asArray(meta.abilities)],'',()=>{}),status=h('p',{class:'pc-note',role:'status'}),result=h('div',{class:'pc-color-results'}),detail=h('section',{class:'pc-color-detail','aria-label':'선택한 팀컬러 상세'});
    async function pick(tc,trigger){const ticket=++selection;setChildren(detail,loading('단계별 효과를 불러오는 중이에요.'));try{const data=await c.api('/api/squad/tc/color?'+new URLSearchParams({id:tc.id}));if(dead(c,page)||ticket!==selection)return;const value=data.color||data.teamcolor||data;const ability=new Map(meta.abilities||[]);setChildren(detail,h('h2',{class:'pc-h2',tabindex:'-1'},value.name||tc.name),value.desc?note(value.desc):null,...asArray(value.levels).map(l=>h('section',{class:'pc-level'},h('h3',null,(l.n||l.level||'?')+'명 적용'),h('ul',null,l.all?h('li',null,'전체 능력치 +'+l.all):null,...Object.entries(l.stats||{}).map(([k,v])=>h('li',null,(ability.get(k)||k)+' +'+v)),...asArray(l.other).map(x=>h('li',null,x))))),data.stale?note('새로 받지 못해 지난 자료를 보여 드려요.'):null);
      const roster=h('div',{class:'pc-color-roster'});let rosterPage=1,rosterTicket=0;
      const rosterButton=button('적용 선수 보기',async()=>{const rTicket=++rosterTicket;rosterButton.disabled=true;try{const params={all:'1',tc:String(tc.id),page:String(rosterPage)};const d=await(c.players?c.players(params):c.api('/api/squad/players?'+new URLSearchParams(params)));if(dead(c,page)||ticket!==selection||rTicket!==rosterTicket)return;if(rosterPage===1)setChildren(roster,h('h3',null,'적용 선수'));roster.append(...asArray(d.players).map(p=>cardRow(c,p,(p,b)=>openDetail(c,p,meta,b))));if(!asArray(d.players).length&&rosterPage===1)roster.append(note('적용 선수를 찾지 못했어요.'));rosterPage++;rosterButton.hidden=!d.more||rosterPage>5;rosterButton.textContent='다음 적용 선수 받기';}catch(err){if(!err.handled&&!dead(c,page)&&ticket===selection)roster.append(note(errText(c,err)));}finally{if(!dead(c,page)&&ticket===selection)rosterButton.disabled=false;}});
      detail.append(roster,rosterButton);detail.querySelector('h2').focus({preventScroll:true});}catch(err){if(!err.handled&&!dead(c,page)&&ticket===selection)setChildren(detail,error(err,()=>pick(tc,trigger)));}}
    async function load(e){e?.preventDefault();const ticket=++request;status.textContent='팀컬러를 찾는 중이에요.';result.setAttribute('aria-busy','true');try{const params=new URLSearchParams({query:normal(q.value),category:cat.value,stat:stat.value});const d=await c.api('/api/team-colors?'+params);if(dead(c,page)||ticket!==request)return;const rows=asArray(d.teamcolors||d.colors||d.items);status.textContent=`검색 결과 ${rows.length}개${d.pending?' · 효과 자료를 차례로 확인하는 중':''}${d.stale?' · 지난 자료':''}`;setChildren(result,...rows.map(tc=>button('',()=>pick(tc),{class:'pc-color-item','aria-label':tc.name+' 단계별 효과 보기'})));[...result.children].forEach((el,i)=>{const tc=rows[i];el.append(h('strong',null,tc.name),h('small',null,tc.category_label||CATEGORIES[tc.category]||''),asArray(tc.effects).length?h('span',null,tc.effects.map(x=>typeof x==='string'?x:(x.label||x.key)+' +'+x.value).join(' · ')):null);});if(!rows.length)result.append(note('조건에 맞는 팀컬러를 찾지 못했어요.'));}catch(err){if(!err.handled&&!dead(c,page)&&ticket===request)setChildren(result,error(err,()=>load()));}finally{if(!dead(c,page)&&ticket===request)result.removeAttribute('aria-busy');}}
    const form=h('form',{class:'pc-color-form',onsubmit:load},field('팀컬러 이름',q),field('유형',cat),field('올리고 싶은 능력치',stat),h('button',{type:'submit',class:'btn btn-red'},'팀컬러 찾기'));
    setChildren(page,form,status,h('div',{class:'pc-color-layout'},result,detail),source());await load();
  }
  root.NVPlayerCenter=Object.freeze({renderPlayers,renderReviews,renderTeamColors,_test:Object.freeze({buildQueries,mergePlayers,bestOvr,reviewBody,playerLabel,seasonsOf})});
})(globalThis);
