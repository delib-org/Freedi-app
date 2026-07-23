import { loadEnv } from './lib/env';
loadEnv();
import { loadTriplets, questionFor } from './lib/datasets';
import { readJsonl } from './lib/io';
import { cachedEmbedBatch } from './lib/embeddings';
import { similarityMatrix } from './lib/clustering';

async function main() {
  const dataset = 'polis_canadian_electoral_reform';
  const questionText = questionFor(dataset);
  const triplets = loadTriplets('main').filter(t => t.dataset === dataset);
  const claimCache = new Map<string, {canonicalClaim: string}>();
  for (const row of readJsonl<{id:string; canonicalClaim:string}>('generated-claims.jsonl')) claimCache.set(row.id, row);

  const ctx = (text: string) => `Question: ${questionText}\nAnswer: ${text}`;
  const withCtx = await cachedEmbedBatch(triplets.map(t => ctx(claimCache.get(t.id)!.canonicalClaim)), 'claim-embeddings-cache.jsonl');
  const withoutCtx = await cachedEmbedBatch(triplets.map(t => claimCache.get(t.id)!.canonicalClaim), 'claim-embeddings-cache.jsonl');

  function stats(vectors: number[][]) {
    const sim = similarityMatrix(vectors);
    const vals: number[] = [];
    for (let i = 0; i < sim.length; i++) for (let j = i+1; j < sim.length; j++) vals.push(sim[i][j]);
    vals.sort((a,b)=>a-b);
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    return { min: vals[0], p10: vals[Math.floor(vals.length*0.1)], p50: vals[Math.floor(vals.length*0.5)], p90: vals[Math.floor(vals.length*0.9)], max: vals[vals.length-1], mean };
  }
  console.log('WITH ctx prefix:', stats(withCtx));
  console.log('WITHOUT ctx prefix (raw claim only):', stats(withoutCtx));
}
main();
