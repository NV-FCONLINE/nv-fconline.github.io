// Synthetic club-awards preview. No production API/DB calls. Browser may load public NEXON metadata.
// node tools/preview-awards.mjs; Ctrl+C, POST /__stop or 20-minute expiry cleans up this server.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),port=8797,now=Date.now();
const people=['하늘','바람','노을','구름','겨울','새벽','유성','바다'].map((name,i)=>({discord_id:String(i+1).padStart(18,'0'),name:`NV예시${name}`,nickname:`예시${name}게임`,is_staff:i===1}));
const me={id:people[0].discord_id,name:people[0].name,is_staff:false,is_admin:false};
const matchTypes={40:'클래식 1on1',50:'공식경기',52:'감독모드'};
function internalData(empty=false){
  const table=people.map(m=>({...m,played:0,win:0,draw:0,lose:0,gf:0,ga:0}));
  const matches=empty?[]:Array.from({length:23},(_,i)=>{
    const a=table[0],b=table[1+i%7],draw=i===4,win=i===9,ag=draw?2:win?3:1,bg=draw?2:win?1:3;
    for(const [my,op] of [[a,b],[b,a]]){my.played++;my.gf+=my===a?ag:bg;my.ga+=my===a?bg:ag;if(draw)my.draw++;else if((my===a)===win)my.win++;else my.lose++;}
    return{match_id:`preview-internal-${i}`,match_type:[40,50,52][i%3],played_at:now-i*6*3600000,
      a:{...people[0],result:draw?'무':win?'승':'패',goals:ag,stats:{possession:55+i%8,shots:7+i%6,on_target:4+i%3,pass_pct:88.2,rating:7.2}},
      b:{...people[1+i%7],result:draw?'무':win?'패':'승',goals:bg,stats:{possession:45-i%8,shots:10+i%6,on_target:6+i%3,pass_pct:91.3,rating:7.8}}};
  });
  const rows=empty?[]:table.filter(m=>m.played).sort((a,b)=>b.played-a.played||a.name.localeCompare(b.name,'ko'));
  let rank=0;rows.forEach((m,i)=>{if(!i||rows[i-1].played!==m.played)rank=i+1;m.rank=rank;});
  return{days:28,window_days:28,match_types:matchTypes,matches,table:rows,total_matches:matches.length,updated_at:now};
}
function payload(scenario,type){
  const empty=scenario==='empty',internalOnly=scenario==='internal-only',pending=scenario==='coverage',internal=internalData(empty);
  const candidates=empty||internalOnly?[]:people;
  const award=(value,extras={})=>({count:candidates.length,list:candidates.map((m,i)=>({rank:i<2?1:i+1,member:m,played:30,value:value(i),...Object.fromEntries(Object.entries(extras).map(([k,v])=>[k,typeof v==='function'?v(i):v]))}))});
  const awards={
    internal:{count:internal.table.length,list:internal.table.map(({discord_id,name,nickname,is_staff,...stats})=>({member:{discord_id,name,nickname,is_staff},...stats}))},
    possession:award(i=>i<2?64.5:60-i,{avg_possession:i=>i<2?64.5:60-i}),
    peace:award(i=>i<2?20:15-i,{draw:i=>i<2?6:3}),shots:award(i=>i<2?15:14-i,{shots:i=>i<2?450:(14-i)*30}),
    heading:award(i=>i<2?.4:.3-i*.01,{heading_games:30,heading_goals:i=>i<2?12:9}),
    bonfrere:award(i=>i<2?5:4.9-i*.1,{gf:90,ga:60}),low_conceded:award(i=>i<2?.6:.7+i*.1,{ga:i=>i<2?18:24}),
    long_shot:award(i=>i<2?25:20-i,{long_shot_games:30,long_shot_try:40,long_shot_goals:i=>i<2?10:6}),
    member_dribble:award(i=>i<2?61.5:Math.round((70-i*3)*1000/130)/10,{dribble_games:30,dribble_try:100,dribble_success:i=>i<2?80:70-i*3,dribble_pct:i=>i<2?80:70-i*3}),
  };
  for(const key of ['goals','assists','tackle','save','dribble'])awards[key]={count:candidates.length,list:candidates.map((m,i)=>({rank:i<2?1:i+1,member:m,spid:101000190,pos:key==='save'?0:key==='tackle'?5:[25,14,23,18][i%4],grade:8,apps:30,goals:25-i,assists:16-i,tackle_try:40,tackle:30-i,gk_apps:30,faced:60,saved:50-i,dribble_games:30,dribble_try:40,dribble_success:i<2?30:27-i,value:i<2?75:Math.round((27-i)*1000/40)/10}))};
  const data={type,updated_at:now,members_counted:candidates.length,member_awards_counted:candidates.length,possession_members_counted:candidates.length,min_member_games:15,min_possession_games:15,
    rules:{min_apps:15,min_tackles:30,min_faced:30,min_dribbles:30,min_long_shots:30,top:10},window:{size:30,total:candidates.length,done:candidates.length,ready:true},
    heading_coverage:{collected:candidates.length,total:candidates.length},member_dribble_coverage:{collected:pending?2:candidates.length,total:candidates.length,pending:pending?6:0},dribble_coverage:{collected:pending?2:candidates.length,total:candidates.length,pending:pending?6:0},long_shot_coverage:{collected:pending?2:candidates.length,total:candidates.length,pending:pending?6:0},tackle_data:true,internal,awards};
  if(scenario==='old-awards'){delete awards.internal;delete awards.member_dribble;delete data.member_dribble_coverage;delete awards.dribble;delete awards.long_shot;delete data.internal;delete data.dribble_coverage;delete data.long_shot_coverage;}
  return data;
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://127.0.0.1:${port}`),scenario=new URL(req.headers.referer||url,url).searchParams.get('scenario')||'awards';
    if(req.method==='POST'&&url.pathname==='/__stop'){json(res,200,{ok:true});stop();return;}
    if(url.pathname==='/api/session')return json(res,200,{token:'local-preview-placeholder',me,next:'#/stats/best'});
    if(url.pathname==='/api/me')return json(res,200,{me});
    if(url.pathname==='/api/boards')return json(res,200,{boards:[{slug:'notice',name:'공지'},{slug:'free',name:'자유'},{slug:'ideas',name:'기능 제안'}]});
    if(url.pathname==='/api/stats/awards')return json(res,scenario==='error'?503:200,scenario==='error'?{error:'server'}:payload(scenario,Number(url.searchParams.get('type')||50)));
    if(url.pathname==='/api/stats')return json(res,200,{enabled:true,me_id:me.id,can_edit_links:false,can_sync:false,last_sync:{at:now},divisions:[],match_types:matchTypes,members:people.map(m=>({...m,link:{status:'ok',nickname:m.nickname,source:'self'}})),internal:internalData(scenario==='empty')});
    if(url.pathname==='/api/stats/ranking')return json(res,200,{type:50,updated_at:now,min_games:15,window:{size:30,ready:true,total:people.length,done:people.length},members:people.map(m=>({...m,stats:{played:30,win:15,draw:5,lose:10,gf:60,ga:45,win_rate:50}}))});
    if(url.pathname==='/api/stats/official')return json(res,200,{members:[],coverage:{total:0,linked:0,ranked:0,pending:0,error:0,not_ranked:0,stale:0},pending:0,can_continue:false});
    let file=null,mime='';
    if(url.pathname==='/club/'||url.pathname==='/club/index.html'){file='club/index.html';mime='text/html; charset=utf-8';}
    else if(['/club/football-player.js','/club/squad-tools.js','/club/squad-worker.js'].includes(url.pathname)){file=url.pathname.slice(1);mime='text/javascript; charset=utf-8';}
    else if(/^\/assets\/awards\/[a-z_]+\.webp$/.test(url.pathname)){file=url.pathname.slice(1);mime='image/webp';}
    else if(/^\/club\/players\/[0-9a-f]{2}\.json$/.test(url.pathname)){file=url.pathname.slice(1);mime='application/json; charset=utf-8';}
    else if(/^\/club\/tiers\/\d+\.png$/.test(url.pathname)){file=url.pathname.slice(1);mime='image/png';}
    else if(['/assets/nv-mark.png','/favicon-32.png'].includes(url.pathname)){file=url.pathname.slice(1);mime='image/png';}
    if(!file)return json(res,404,{error:'not_found'});
    const body=await readFile(new URL(file,root));res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(body);
  }catch{json(res,404,{error:'not_found'});}
});
function stop(){server.close();server.closeIdleConnections();setTimeout(()=>server.closeAllConnections(),500).unref();}
const expiry=setTimeout(stop,20*60000);server.on('close',()=>{clearTimeout(expiry);process.exit(0);});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
server.listen(port,'127.0.0.1',()=>console.log(`어워드 예시: http://127.0.0.1:${port}/club/?api=http%3A%2F%2F127.0.0.1%3A${port}#ticket=preview`));
