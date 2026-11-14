// One Word Away: local server. No dependencies. Run: node server.js  then open http://localhost:3000
// Sentences, starter answers and scoring all live here. The browser only gets today's 3 sentences and its own result.
const http=require("http"),fs=require("fs"),path=require("path");
const PORT=process.env.PORT||3000,F=path.join(__dirname,"data.json"),PAGE=path.join(__dirname,"index.html");
const SUG=path.join(__dirname,"suggestions.txt"),APP=path.join(__dirname,"approved.txt");
const BANK=require("./bank.js"),EPOCH=Date.UTC(2026,10,14),DAY=864e5,W=[40,25,16,10,6,4,3,2];
const BAD=/\b(fuck\w*|shit\w*|bitch\w*|cunt|rape\w*|nazi\w*|porn\w*|sex\w*)\b/i;
const read=()=>{let d={};try{d=JSON.parse(fs.readFileSync(F,"utf8"))}catch(e){}return Object.assign({subs:{},sched:{},cycle:[],sugg:[],extra:[]},d)};
const write=d=>fs.writeFileSync(F,JSON.stringify(d));
const norm=w=>{w=w.toLowerCase().replace(/[^a-z]/g,"");if(w.length>4&&w.endsWith("ies"))return w.slice(0,-3)+"y";if(w.length>3&&w.endsWith("s")&&!/(ss|us|is)$/.test(w))return w.slice(0,-1);return w};
const hash=s=>{let h=5381;for(const c of s)h=(h*33^c.charCodeAt(0))>>>0;return h.toString(36)};
// approved.txt: one sentence per line, optionally "sentence | starter words". Lines starting with # are ignored.
const approved=()=>{try{return fs.readFileSync(APP,"utf8").split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&l[0]!=="#"&&l.includes("___")).map(l=>{const[q,s]=l.split("|").map(x=>x.trim());return{id:"a-"+hash(q),q,s:s||""}})}catch(e){return[]}};
const all=d=>{const o={};for(const[c,l]of Object.entries(BANK))l.forEach(([q,s],i)=>o[c+"-"+i]={q,s,c});d.extra.concat(approved()).forEach(e=>o[e.id]={q:e.q,s:e.s||"",c:"community"});return o};
const rng=s=>{let a=0;for(const c of s)a=(a*31+c.charCodeAt(0))|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
// Each day's 3 sentences are chosen once and saved. No repeats until the whole bank is used; 3 different categories per day.
function today(d,date){
  if(d.sched[date])return d.sched[date];
  const A=all(d),ids=Object.keys(A);let pool=ids.filter(i=>!d.cycle.includes(i));
  if(pool.length<3){d.cycle=[];pool=ids}
  const r=rng(date),pick=[],cats=new Set();
  while(pick.length<3&&pool.length){
    let c=pool.filter(i=>!cats.has(A[i].c));if(!c.length)c=pool;
    const id=c[Math.floor(r()*c.length)];pick.push(id);cats.add(A[id].c);pool=pool.filter(i=>i!==id);
  }
  d.cycle.push(...pick);d.sched[date]=pick;return pick;
}
function result(d,A,id,cid,date,word){
  const subs=d.subs[id]=d.subs[id]||[];
  let own=subs.find(s=>s.c===cid&&s.d===date);   // one counted answer per player per sentence per day
  if(!own){own={n:norm(word),w:word,c:cid,d:date};subs.push(own)}
  const m={};
  (A[id].s||"").split(" ").filter(Boolean).forEach((w,i)=>{const n=norm(w);m[n]=m[n]||{c:0,d:w};m[n].c+=W[i]||1});
  subs.forEach(s=>{if(s===own)return;m[s.n]=m[s.n]||{c:0,d:s.w};m[s.n].c++});
  const e=Object.values(m),T=e.reduce((a,v)=>a+v.c,0),pmax=Math.max(1,...e.map(v=>v.c));
  const sc=c=>c<=0?40:Math.round(25+75*Math.sqrt(c/pmax));
  const prior=m[own.n]?m[own.n].c:0,score=sc(prior);
  let lo=0,eq=0;e.forEach(v=>{const s=sc(v.c);if(s<score)lo+=v.c;else if(s===score)eq+=v.c});
  const pct=T?Math.round(100*(lo+eq)/T):50,rank=prior?e.filter(v=>v.c>prior).length+1:0;
  m[own.n]=m[own.n]||{c:0,d:own.w};m[own.n].c++;const T2=T+1;
  const top=Object.entries(m).sort((a,b)=>b[1].c-a[1].c).slice(0,5).map(([n,v])=>({n,d:v.d,p:Math.round(100*v.c/T2)}));
  return{w:own.w,n:own.n,score,pct,rank,top,mine:Math.max(1,Math.round(100*m[own.n].c/T2)),real:subs.length,sd:A[id].s?1:0};
}
const send=(res,code,body,type="application/json")=>{res.writeHead(code,{"Content-Type":type,"Cache-Control":"no-store"});res.end(body)};
const body=(req,res,fn)=>{let b="";req.on("data",c=>{b+=c;if(b.length>2000)req.destroy()});req.on("end",()=>{let j;try{j=JSON.parse(b)}catch(e){return send(res,400,'{"error":"bad"}')}fn(j)})};
const hits={};
if(!fs.existsSync(SUG))fs.writeFileSync(SUG,"");
if(!fs.existsSync(APP))fs.writeFileSync(APP,"# Approved sentences, one per line. Copy good ones here from suggestions.txt.\n# Optional starter answers after a bar, for example:\n# The best part of summer is ___. | sunshine beach vacation holiday\n# Lines starting with # are ignored. New sentences are used on days not yet scheduled.\n");
{const d=read(),p=d.sugg.filter(x=>x.st==="pending");if(p.length){fs.appendFileSync(SUG,p.map(x=>x.q).join("\n")+"\n");d.sugg=[];write(d)}}
http.createServer((req,res)=>{
  const u=new URL(req.url,"http://localhost"),date=new Date().toISOString().slice(0,10);
  if(req.method==="GET"&&(u.pathname==="/"||u.pathname==="/index.html"))return send(res,200,fs.readFileSync(PAGE),"text/html; charset=utf-8");
  if(req.method==="GET"&&u.pathname==="/api/today"){
    const d=read(),ids=today(d,date),A=all(d);write(d);
    return send(res,200,JSON.stringify({n:Math.max(1,Math.floor((Date.now()-EPOCH)/DAY)+1),date,qs:ids.map(i=>A[i].q)}));
  }
  if(req.method==="POST"&&u.pathname==="/api/answer")return body(req,res,({cid,i,w})=>{
    if(typeof cid!=="string"||cid.length<8||cid.length>64||![0,1,2].includes(i)||typeof w!=="string"||!/^[a-z’'-]{2,20}$/.test(w)||norm(w).length<2)return send(res,400,'{"error":"bad"}');
    const d=read(),ids=today(d,date),out=result(d,all(d),ids[i],cid,date,w);
    const mine=ids.map(id=>(d.subs[id]||[]).find(s=>s.c===cid&&s.d===date));
    if(i===2&&mine.every(Boolean)){const L=mine.map(s=>s.n.charCodeAt(0));if(L[1]===L[0]+1&&L[2]===L[1]+1)out.x="Easy as ABC 🎶"}
    write(d);send(res,200,JSON.stringify(out));
  });
  if(req.method==="POST"&&u.pathname==="/api/suggest")return body(req,res,j=>{
    const ip=req.socket.remoteAddress;hits[ip]=(hits[ip]||[]).filter(t=>Date.now()-t<36e5);
    if(hits[ip].length>=5)return send(res,429,'{"error":"Too many suggestions, try again later."}');
    const q=String(j.text||"").trim().replace(/\s+/g," ");
    if(q.length<15||q.length>90||(q.match(/___/g)||[]).length!==1||/(https?:|www\.|@|\d{3,})/i.test(q)||BAD.test(q))return send(res,400,'{"error":"Please write 15–90 characters with exactly one ___ for the blank, and keep it clean."}');
    let old="";try{old=fs.readFileSync(SUG,"utf8").toLowerCase()}catch(e){}
    if(old.split(/\r?\n/).includes(q.toLowerCase())||approved().some(x=>x.q.toLowerCase()===q.toLowerCase()))return send(res,200,'{"ok":true}');
    fs.appendFileSync(SUG,q+"\n");hits[ip].push(Date.now());send(res,200,'{"ok":true}');
  });
  send(res,404,"Not found","text/plain");
}).listen(PORT,"127.0.0.1",()=>console.log("One Word Away running at http://localhost:"+PORT));