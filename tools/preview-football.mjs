// Local football player preview. Synthetic login/data only; no production API calls.
// Run: node tools/preview-football.mjs. Stop: Ctrl+C, POST /__stop, or 20-minute expiry.
// An optional local JSON fixture path can be given with --video-file (never committed).
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const port = 8795;
const arg = process.argv.indexOf('--video-file');
const realVideo = arg >= 0 ? JSON.parse(await readFile(process.argv[arg + 1], 'utf8')) : null;
const exampleVideo = {provider:'web',kind:'page',id:'https://example.org/demo/live.m3u8',url:'https://example.org/demo/live.m3u8',title:'NV 같이 보기 · 재생 화면 예시',set_at:Date.now()};
const me = {id:'000000000000000001',name:'NV예시하늘',is_staff:false,is_admin:false};
const json = (res, code, body) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const files = new Map([
  ['/club/',['club/index.html','text/html; charset=utf-8']],
  ['/club/index.html',['club/index.html','text/html; charset=utf-8']],
  ['/club/football-player.js',['club/football-player.js','text/javascript; charset=utf-8']],
  ['/club/vendor/hls-1.7.4.min.js',['club/vendor/hls-1.7.4.min.js','text/javascript; charset=utf-8']],
  ['/assets/nv-mark.png',['assets/nv-mark.png','image/png']],
  ['/favicon-32.png',['favicon-32.png','image/png']],
]);
const server = createServer(async(req,res)=>{
  try {
    const u = new URL(req.url,`http://127.0.0.1:${port}`);
    const scenario = new URL(req.headers.referer || u,u).searchParams.get('scenario');
    if(req.method==='POST' && u.pathname==='/__stop'){json(res,200,{ok:true});stop();return;}
    if(u.pathname==='/api/session')return json(res,200,{token:'local-preview-placeholder',me,next:'#/football'});
    if(u.pathname==='/api/me')return json(res,200,{me});
    if(u.pathname==='/api/boards')return json(res,200,{boards:[{slug:'notice',name:'공지'},{slug:'free',name:'자유'},{slug:'ideas',name:'기능 제안'}]});
    if(u.pathname==='/api/football/video') {
      const video = scenario==='live' && realVideo ? {...realVideo,url:realVideo.url || realVideo.id,title:'NV 같이 보기 · 방송 재생 확인'} : scenario==='youtube' ? {provider:'youtube',kind:'video',id:'M7lc1UVf-VE',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',title:'공식 플레이어 예시'} : scenario==='page' ? {provider:'web',kind:'page',id:'https://example.org/',url:'https://example.org/',title:'일반 페이지 예시'} : exampleVideo;
      return json(res,200,{video});
    }
    if(u.pathname==='/api/football/league') return json(res,503,{error:'upstream'});
    if(u.pathname==='/api/stats/overview')return json(res,503,{error:'upstream'});
    const file=files.get(u.pathname);
    if(!file)return json(res,404,{error:'not_found'});
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store'});res.end(await readFile(new URL(file[0],root)));
  } catch {json(res,500,{error:'preview_error'});}
});
function stop(){server.close();server.closeIdleConnections();setTimeout(()=>server.closeAllConnections(),500).unref();}
const expiry=setTimeout(stop,20*60000);
server.on('close',()=>{clearTimeout(expiry);process.exit(0);});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,stop);
server.listen(port,'127.0.0.1',()=>console.log(`영상 로컬 검증: http://127.0.0.1:${port}/club/?api=http%3A%2F%2F127.0.0.1%3A${port}#ticket=preview`));
