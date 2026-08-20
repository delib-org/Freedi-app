// Hebrew SYNTH-layer separability under both models. The synth layer is the one
// that still depends on cosine (vector search + the spawn band); theme
// assignment is now an LLM call and language-independent.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO='/Users/talyaron/Documents/Freedi-app';
const HERE='/private/tmp/claude-501/-Users-talyaron-Documents-Freedi-app/495537ad-93d7-4fdd-b70c-3c4962e257d3/scratchpad';
const corpus=JSON.parse(readFileSync(resolve(REPO,'scripts/seedSynthBenchmark.accuracy100.he.json'),'utf8'));
const key=t=>`Question: ${corpus.questionText}\nAnswer: ${t}`;
const small=new Map();
for(const l of readFileSync(resolve(REPO,'scripts/.cache/preflight-embeddings.jsonl'),'utf8').split('\n')){
  if(!l.trim())continue; const r=JSON.parse(l); small.set(r.key,r.vector);}
const large=new Map(Object.entries(JSON.parse(readFileSync(resolve(HERE,'large-he.json'),'utf8'))));
const dot=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)d+=a[i]*b[i];return d};
const cos=(a,b)=>dot(a,b)/Math.sqrt(dot(a,a)*dot(b,b));
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
const f=x=>x.toFixed(3);
function report(tag,cache){
  const items=[];
  for(const t of corpus.topics)for(const s of t.synths)for(const p of s.paraphrases){
    const v=cache.get(key(p)); if(v)items.push({synth:s.name,topic:t.name,vec:v});}
  const within=[],cross=[];
  let nn1=0,top3=0,top10=0,worst=0;
  for(let i=0;i<items.length;i++){
    const ranked=items.map((x,j)=>({j,c:i===j?-2:cos(items[i].vec,x.vec)}))
      .filter(x=>x.j!==i).sort((a,b)=>b.c-a.c);
    const twinRank=ranked.findIndex(x=>items[x.j].synth===items[i].synth);
    if(twinRank===0)nn1++; if(twinRank<3)top3++; if(twinRank<10)top10++;
    worst=Math.max(worst,twinRank+1);
    for(const r of ranked) (items[r.j].synth===items[i].synth?within:cross).push(r.c);
  }
  console.log(`\n== ${tag} (${items.length} statements) ==`);
  console.log(`within-pair   min ${f(Math.min(...within))} p10 ${f(q(within,0.1))} med ${f(q(within,0.5))}`);
  console.log(`cross         med ${f(q(cross,0.5))} p90 ${f(q(cross,0.9))} max ${f(Math.max(...cross))}`);
  console.log(`twin is nearest neighbour : ${nn1}/${items.length}`);
  console.log(`twin within top 3         : ${top3}/${items.length}`);
  console.log(`twin within top 10 (NEIGHBOR_LIMIT) : ${top10}/${items.length}   <- beyond this the pipeline never sees it`);
  console.log(`worst twin rank           : ${worst}`);
}
report('text-embedding-3-small (shipped)',small);
report('text-embedding-3-large @1536',large);
