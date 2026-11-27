// Synthetic development preview only. No production DB, secrets or authenticated external API.
// node tools/preview-insights.mjs; loopback only; POST /__stop or 20-minute expiry.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {ABILITIES} from '../../nv-api/src/squad_lists.js';
import {getSquadMeta} from '../../nv-api/src/squad.js';
import {compactGoalPattern,buildInsightReport,buildInsightsResponse,buildDuel} from '../../nv-api/src/insights.js';
const root=new URL('../',import.meta.url),port=8798,now=Date.now();
const members=['하늘','바람','노을','구름'].map((name,i)=>({discord_id:String(i+1).padStart(18,'0'),name:'NV예시'+name,nickname:'가상게임'+name,is_staff:false,link:{status:'ok'}}));
const me={id:members[0].discord_id,name:members[0].name,is_staff:false,is_admin:false};
const pattern=(goals,out=0)=>compactGoalPattern({shoot:{goalTotal:goals,goalInPenalty:goals-out,goalOutPenalty:out,goalPenaltyKick:0,ownGoal:0},shootDetail:Array.from({length:goals},(_,i)=>({result:3,type:i%3+1,goalTime:i*15}))});
const reports=members.map((m,j)=>{const rows=Array.from({length:30},(_,i)=>{const gf=i%4,ga=(i+j)%3,win=gf>ga?'승':gf<ga?'패':'무';return{match_id:'preview-'+j+'-'+i,played_at:now-i*3600000,me:{result:win,goals:gf,shots:8+j,on_target:5,possession:55+j},opp:{goals:ga},_m:{end_type:i===4?1:0,end_known:true,pass_try:100,pass_success:90-j,tackle_try:8,tackle:5,block_try:4,block:1,stats:{shots:8+j},goal_pattern:pattern(gf,Math.min(1,gf))},_o:{end_type:i===4?2:0,end_known:true,stats:{shots:7},goal_pattern:pattern(ga)}};});const r=buildInsightReport(rows,now);return{discord_id:m.discord_id,display_name:m.name,nickname:m.nickname,ouid:'synthetic-'+j,source:'self',updated_at:now,stats:JSON.stringify({played:30,insights:r})};});
const matches=Array.from({length:30},(_,i)=>{const a=members[0],b=members[1+i%3],ag=i%4,bg=(i+1)%3;return{match_id:'duel-'+i,match_type:[40,50,52][i%3],played_at:now-(i<24?i*3600000:(40+(i-24)*4)*86400000),fetched_at:now-(i%3)*60000,a:{...a,goals:ag,result:ag>bg?'승':ag<bg?'패':'무',stats:{end_type:0,possession:55,shots:8,on_target:5,pass_pct:90}},b:{...b,goals:bg,result:ag<bg?'승':ag>bg?'패':'무',stats:{end_type:0,possession:45,shots:7,on_target:3,pass_pct:85}}};});
const history={members,matches,days:null,period:'all'};
const internal={members,matches:matches.filter(m=>m.played_at>=now-28*86400000),days:28,period:'28'};
const playerIds=[10535, 231747, 158023, 190042, 190043, 190045, 188545, 243075, 202126, 7826, 156616, 28130],playerNames=["차비", "킬리안 음바페", "리오넬 메시", "마라도나", "펠레", "요한 크루이프", "레반도프스키", "루메니게", "해리 케인", "로빈 반페르시", "프랑크 리베리", "호나우지뉴"];
const allPlayers=Array.from({length:12},(_,i)=>({spid:100000000+playerIds[i],name:playerNames[i],season:'ICONTM',pay:30+i%5,foot:i%2?'왼발 5 · 오른발 5':'왼발 5 · 오른발 4',img:'p'+playerIds[i],pos:{[i%3?'ST':'CAM']:127-Math.floor(i/4)}}));
const meta=await(await getSquadMeta({DEV_MODE:'1'})).json();
let reviews=[{id:1,spid:100190042,grade:8,rating:4,body:'가상 시안 후기입니다.\n패스가 좋고 방향 전환이 편해요.',created_at:now,updated_at:now,author:{id:me.id,name:me.name},can_edit:true,can_delete:true}],nextId=2;
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:'+port),path=url.pathname;
 if(req.method==='POST'&&path==='/__stop'){json(res,200,{ok:true});stop();return;}
 if(path==='/api/session')return json(res,200,{token:'synthetic-preview',me,next:'#/players'});
 if(path==='/api/me')return json(res,200,{me});
 if(path==='/api/boards')return json(res,200,{boards:[{slug:'notice',name:'공지'},{slug:'free',name:'자유'},{slug:'ideas',name:'기능 제안'}]});
 if(path==='/api/stats')return json(res,200,{enabled:true,me_id:me.id,members,internal,match_types:{40:'클래식 1on1',50:'공식경기',52:'감독모드'}});
 if(path==='/api/stats/insights')return json(res,200,buildInsightsResponse(reports,url.searchParams.get('member')||me.id,Number(url.searchParams.get('type')||50),now));
 if(path==='/api/stats/duel'){const period=url.searchParams.get('period')||'all';if(!['all','28'].includes(period))return json(res,400,{error:'bad_period'});return json(res,200,buildDuel(period==='all'?history:internal,url.searchParams.get('a')||me.id,url.searchParams.get('b'),url.searchParams.get('type')==='all'?'all':Number(url.searchParams.get('type')||40),period));}
 if(path==='/api/squad/meta')return json(res,200,meta);
 if(path==='/api/squad/players'){let players=allPlayers;const q=url.searchParams.get('name');if(q)players=players.filter(p=>p.name.includes(q));return json(res,200,{players,more:false,cached:true});}
 if(path==='/api/squad/player'){const p=allPlayers.find(p=>p.spid===Number(url.searchParams.get('spid')))||allPlayers[0];return json(res,200,{...p,stats:Object.fromEntries(ABILITIES.map(([k],i)=>[k,100+i%20])),summary:[['속력',120],['슛',121],['패스',118],['드리블',125]],skill:5,traits:[{name:'트릭스터',icon:1}],info:{height:'180cm',weight:'75kg',physical:'보통'},clubs:[]});}
 if(path==='/api/team-colors')return json(res,200,{items:[{id:1018,name:'레알 마드리드',category:'club',level:4,required:11,all:4,stats:{longshots:3},effects:['전체 능력치 +4','중거리 슛 +3']},{id:2003,name:'브라질',category:'nation',level:4,required:11,all:4,stats:{acceleration:3},effects:['전체 능력치 +4','가속력 +3']}].filter(x=>!url.searchParams.get('stat')||x.stats[url.searchParams.get('stat')]>0),abilities:ABILITIES,total:2,fetched_at:now});
 if(path==='/api/squad/tc/color')return json(res,200,{id:1018,name:'레알 마드리드',levels:[{n:3,all:1,stats:{longshots:1},other:[]},{n:6,all:2,stats:{longshots:2},other:[]},{n:11,all:4,stats:{longshots:3},other:[]}]});
 if(path==='/api/squad/team-rankers'){const selected=url.searchParams.has('team'),limit=Number(url.searchParams.get('limit')||40);return json(res,200,{teams:[{id:1018,name:'레알 마드리드',count:820,share:8.2,img:null}],source_date:'2026-11-26',selected:selected?{id:1018,name:'레알 마드리드'}:null,formations:[{name:'4-2-3-1',count:20},{name:'4-2-2-2',count:20}],sample:selected?{total:820,limit,target:limit,loaded:limit,checked:limit,collected:limit,formation_collected:20,position_users:30,failed:0,updated_at:now,oldest_checked_at:now}:null,players:selected?allPlayers.slice(0,5).map((p,i)=>({...p,count:10-i,share:(10-i)*100/30,pos:'ST'})):[],rankers:[],pending:false});}
 if(path==='/api/player-reviews'||/^\/api\/player-reviews\/\d+$/.test(path)){const id=Number(path.split('/').at(-1));let body={};if(['POST','PATCH'].includes(req.method)){const chunks=[];for await(const x of req)chunks.push(x);body=JSON.parse(Buffer.concat(chunks).toString());}
  if(req.method==='POST'){reviews.unshift({...body,id:nextId++,created_at:now,updated_at:now,author:{id:me.id,name:me.name},can_edit:true,can_delete:true});return json(res,201,{id:reviews[0].id});}
  if(req.method==='PATCH'){Object.assign(reviews.find(r=>r.id===id),body);return json(res,200,{ok:true});}
  if(req.method==='DELETE'){reviews=reviews.filter(r=>r.id!==id);return json(res,200,{ok:true});}
  let items=reviews.filter(r=>(!url.searchParams.get('spid')||r.spid===Number(url.searchParams.get('spid')))&&(!url.searchParams.get('grade')||r.grade===Number(url.searchParams.get('grade'))));return json(res,200,{reviews:items,next_before:null,summary:{count:items.length,avg_rating:items.length?items.reduce((n,r)=>n+r.rating,0)/items.length:null}});}
 let file=null;if(path==='/club/'||path==='/club/index.html')file='club/index.html';else if(/^\/club\/[a-z-]+\.(?:js|css)$/.test(path)||/^\/assets\/awards\/[a-z_]+\.webp$/.test(path)||/^\/club\/players\/[0-9a-f]{2}\.json$/.test(path)||/^\/club\/tiers\/\d+\.png$/.test(path)||['/favicon-32.png','/assets/nv-mark.png'].includes(path))file=path.slice(1);
 if(!file)return json(res,404,{error:'not_found'});const data=await readFile(new URL(file,root));const ext=file.split('.').at(-1),mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',webp:'image/webp'}[ext];res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(data);
 }catch(e){json(res,e.status||500,{error:e.code||'preview'});}});
function stop(){server.close();server.closeIdleConnections();setTimeout(()=>server.closeAllConnections(),500).unref();}
const expiry=setTimeout(stop,20*60000);server.on('close',()=>{clearTimeout(expiry);process.exit(0);});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,stop);server.listen(port,'127.0.0.1',()=>console.log(`새 기능 가상 시안: http://127.0.0.1:${port}/club/?api=http%3A%2F%2F127.0.0.1%3A${port}#ticket=preview`));
