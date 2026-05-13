/**
 * Read-only: for the city demographic of a given survey, show
 * per-city conversion rates from "filled demographics" to actual
 * participation roles (evaluated, added a solution, etc).
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/per-city-conversion.ts <surveyId>
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m && !m[1].startsWith('#')) {
    const k = m[1].trim();
    let v = m[2].trim();
    v = v.replace(/^["']|["']$/g, '');
    process.env[k] = v;
  }
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

const CITY_Q_HINT = 'ישוב';

async function main(): Promise<void> {
  const surveyId = process.argv[2];
  if (!surveyId) { console.error('Usage: per-city-conversion.ts <surveyId>'); process.exit(1); }

  const db = getFirestoreAdmin();
  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  const survey = surveyDoc.data();
  const anchorId = (survey?.parentStatementId as string) || surveyId;
  const questionIds: string[] = survey?.questionIds || [];

  // userId -> city
  const userCity = new Map<string, string>();
  const usersDataSnap = await db.collection('usersData').where('statementId', '==', anchorId).get();
  usersDataSnap.docs.forEach((d: QueryDocumentSnapshot) => {
    const data = d.data();
    if (!String(data.question ?? '').includes(CITY_Q_HINT)) return;
    const uid = data.userId as string | undefined;
    const city = String(data.answer ?? '');
    if (uid && city) userCity.set(uid, city);
  });

  // realEvaluators: distinct evaluator.uid
  // anyParticipant: distinct evaluatorId (includes auto +1 from solution submission)
  // solutionAdders: distinct creatorId on options under each question
  const realEvaluators = new Set<string>();
  const anyParticipant = new Set<string>();
  const solutionAdders = new Set<string>();

  for (const qid of questionIds) {
    const [evals, options] = await Promise.all([
      db.collection('evaluations').where('parentId', '==', qid).get(),
      db.collection('statements').where('parentId', '==', qid).get(),
    ]);
    evals.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const evaluatorUid = (data.evaluator as { uid?: string } | undefined)?.uid;
      const evaluatorId = data.evaluatorId as string | undefined;
      if (evaluatorUid) {
        realEvaluators.add(evaluatorUid);
        anyParticipant.add(evaluatorUid);
      } else if (evaluatorId) {
        anyParticipant.add(evaluatorId);
      }
    });
    options.docs.forEach((d: QueryDocumentSnapshot) => {
      const cid = d.data().creatorId as string | undefined;
      if (cid) solutionAdders.add(cid);
    });
  }

  // Bucket by city
  interface Bucket {
    respondents: Set<string>;
    realEvaluators: Set<string>;
    anyParticipant: Set<string>;
    solutionAdders: Set<string>;
  }
  const byCity = new Map<string, Bucket>();
  for (const [uid, city] of userCity) {
    const b = byCity.get(city) || {
      respondents: new Set<string>(),
      realEvaluators: new Set<string>(),
      anyParticipant: new Set<string>(),
      solutionAdders: new Set<string>(),
    };
    b.respondents.add(uid);
    if (realEvaluators.has(uid)) b.realEvaluators.add(uid);
    if (anyParticipant.has(uid)) b.anyParticipant.add(uid);
    if (solutionAdders.has(uid)) b.solutionAdders.add(uid);
    byCity.set(city, b);
  }

  console.log(`\n📋 Survey: ${surveyId}`);
  console.log(`  Distinct users with city demographic: ${userCity.size}\n`);

  console.log('Per-city conversion (%, denominator = city respondents):\n');
  const header =
    `  ${'City'.padEnd(20)} ${'Respond'.padStart(8)} ${'Evaluated'.padStart(11)} ${'Any (incl auto+1)'.padStart(20)} ${'Added solution'.padStart(17)} ${'Did nothing'.padStart(13)}`;
  console.log(header);
  console.log('  ' + '─'.repeat(header.length - 2));

  const rows = [...byCity.entries()].sort((a, b) => b[1].respondents.size - a[1].respondents.size);
  for (const [city, b] of rows) {
    const n = b.respondents.size;
    const pct = (x: number): string => `${Math.round((100 * x) / n)}%`;
    const evaluated = `${b.realEvaluators.size} (${pct(b.realEvaluators.size)})`;
    const any = `${b.anyParticipant.size} (${pct(b.anyParticipant.size)})`;
    const added = `${b.solutionAdders.size} (${pct(b.solutionAdders.size)})`;
    const didNothing = `${n - b.anyParticipant.size} (${pct(n - b.anyParticipant.size)})`;
    console.log(
      `  ${city.padEnd(20)} ${String(n).padStart(8)} ${evaluated.padStart(11)} ${any.padStart(20)} ${added.padStart(17)} ${didNothing.padStart(13)}`,
    );
  }

  // Totals row
  const totalN = userCity.size;
  const totalReal = [...userCity.keys()].filter((u) => realEvaluators.has(u)).length;
  const totalAny = [...userCity.keys()].filter((u) => anyParticipant.has(u)).length;
  const totalAdded = [...userCity.keys()].filter((u) => solutionAdders.has(u)).length;
  const totalNothing = totalN - totalAny;
  const pctAll = (x: number): string => (totalN === 0 ? '0%' : `${Math.round((100 * x) / totalN)}%`);
  console.log('  ' + '─'.repeat(header.length - 2));
  console.log(
    `  ${'TOTAL'.padEnd(20)} ${String(totalN).padStart(8)} ${`${totalReal} (${pctAll(totalReal)})`.padStart(11)} ${`${totalAny} (${pctAll(totalAny)})`.padStart(20)} ${`${totalAdded} (${pctAll(totalAdded)})`.padStart(17)} ${`${totalNothing} (${pctAll(totalNothing)})`.padStart(13)}`,
  );

  console.log('\nLegend:');
  console.log('  Respond           = filled the demographic form (denominator for the city row)');
  console.log('  Evaluated         = explicitly rated at least one solution (evaluator.uid set)');
  console.log('  Any (incl auto+1) = above + got an auto +1 from submitting their own solution');
  console.log('  Added solution    = created a solution under the question');
  console.log('  Did nothing       = filled demographics but never touched the question');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
