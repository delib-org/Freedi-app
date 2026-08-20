// Do same-theme DISTINCT synths clear the reJudge cross-synth merge gate (0.82)?
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO='/Users/talyaron/Documents/Freedi-app';
const corpus=JSON.parse(readFileSync(resolve(REPO,'scripts/seedSynthBenchmark.accuracy100.en.json'),'utf8'));
const cache=new Map();
for(const l of readFileSync(resolve(REPO,'scripts/.cache/preflight-embeddings.jsonl'),'utf8').split('\n')){
  if(!l.trim())continue; const r=JSON.parse(l); cache.set(r.key,r.vector);}
const key=t=>`Question: ${corpus.questionText}\nAnswer: ${t}`;
const dot=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)d+=a[i]*b[i];return d};
const cos=(a,b)=>dot(a,b)/Math.sqrt(dot(a,a)*dot(b,b));
const cen=vs=>{const d=vs[0].length,s=new Array(d).fill(0);for(const v of vs)for(let i=0;i<d;i++)s[i]+=v[i];return s.map(x=>x/vs.length)};
const S=[];
for(const t of corpus.topics)for(const s of t.synths){
  const vs=s.paraphrases.map(p=>cache.get(key(p))).filter(Boolean);
  if(vs.length===2)S.push({topic:t.name,name:s.name,vec:cen(vs)});}
const same=[],diff=[];
for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
  const c=cos(S[i].vec,S[j].vec);
  (S[i].topic===S[j].topic?same:diff).push({c,a:`${S[i].topic}/${S[i].name}`,b:S[j].name});}
const f=x=>x.toFixed(3);
for(const gate of [0.82,0.84,0.86,0.88,0.90]){
  console.log(`gate ${f(gate)}: ${same.filter(x=>x.c>=gate).length} same-theme + ${diff.filter(x=>x.c>=gate).length} cross-theme DISTINCT synth pairs would be merged (all are FALSE merges — this corpus has no duplicate synths)`);
}
console.log('\npairs above 0.82:');
for(const p of [...same,...diff].filter(x=>x.c>=0.82).sort((a,b)=>b.c-a.c)) console.log(`  ${f(p.c)}  ${p.a}  <->  ${p.b}`);
