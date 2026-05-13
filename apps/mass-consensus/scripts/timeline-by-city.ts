/**
 * Read-only: build a timeline of demographic submissions and
 * evaluations per city for a given survey.
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/timeline-by-city.ts <surveyId>
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m && !m[1].startsWith('#')) {
    const key = m[1].trim();
    let value = m[2].trim();
    value = value.replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

const CITY_Q_HINT = 'ישוב';

interface EvalRow {
  evaluatorId: string;
  parentId: string;
  createdAt?: number;
  hasEvaluatorUid: boolean;
}

async function main(): Promise<void> {
  const surveyId = process.argv[2];
  if (!surveyId) { console.error('Usage: timeline-by-city.ts <surveyId>'); process.exit(1); }

  const db = getFirestoreAdmin();
  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  const survey = surveyDoc.data();
  const anchorId = (survey?.parentStatementId as string) || surveyId;
  const questionIds: string[] = survey?.questionIds || [];

  // Map userId -> city
  const userCity = new Map<string, string>();
  const cityFirstAnswerAt = new Map<string, { userId: string; at: number }>();
  const snap = await db.collection('usersData').where('statementId', '==', anchorId).get();
  snap.docs.forEach((d: QueryDocumentSnapshot) => {
    const data = d.data();
    const q = String(data.question ?? '');
    if (!q.includes(CITY_Q_HINT)) return;
    const uid = data.userId as string | undefined;
    const city = String(data.answer ?? '');
    const ts = Number(data.createdAt ?? data.lastUpdate ?? 0);
    if (!uid || !city) return;
    userCity.set(uid, city);
    const cur = cityFirstAnswerAt.get(city);
    if (!cur || ts < cur.at) cityFirstAnswerAt.set(city, { userId: uid, at: ts });
  });

  console.log(`Anchor: ${anchorId}`);
  console.log(`Distinct users with city answer: ${userCity.size}\n`);

  // Earliest demographic per city
  console.log('Earliest demographic submission per city:');
  for (const [city, { at, userId }] of cityFirstAnswerAt) {
    console.log(`  ${city.padEnd(20)}  ${new Date(at).toISOString()}  userId=${userId}`);
  }

  // Pull all evaluations on the current question(s)
  const evals: EvalRow[] = [];
  for (const qid of questionIds) {
    const es = await db.collection('evaluations').where('parentId', '==', qid).get();
    es.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      evals.push({
        evaluatorId: data.evaluatorId as string,
        parentId: qid,
        createdAt: Number(data.createdAt ?? data.updatedAt ?? 0) || undefined,
        hasEvaluatorUid: Boolean((data.evaluator as { uid?: string } | undefined)?.uid),
      });
    });
  }
  console.log(`\nTotal evaluations on survey questions: ${evals.length}`);

  // Per-city: first eval time, count of evals by real-evaluator users
  interface Agg { firstEval?: number; realEvalCount: number; evaluators: Set<string>; autoOnly: number }
  const perCity = new Map<string, Agg>();
  for (const e of evals) {
    const city = userCity.get(e.evaluatorId);
    if (!city) continue;
    const a = perCity.get(city) || { realEvalCount: 0, evaluators: new Set<string>(), autoOnly: 0 };
    if (e.hasEvaluatorUid) {
      a.realEvalCount += 1;
      a.evaluators.add(e.evaluatorId);
    } else {
      a.autoOnly += 1;
    }
    if (e.createdAt) {
      a.firstEval = a.firstEval ? Math.min(a.firstEval, e.createdAt) : e.createdAt;
    }
    perCity.set(city, a);
  }

  console.log('\nPer-city evaluation timeline:');
  console.log(`  ${'City'.padEnd(20)} ${'FirstEval'.padEnd(22)} ${'Evaluators'.padStart(10)} ${'RealEvals'.padStart(10)} ${'AutoOnly'.padStart(9)}`);
  const rows = [...perCity.entries()].sort((a, b) => (a[1].firstEval || 0) - (b[1].firstEval || 0));
  for (const [city, a] of rows) {
    const first = a.firstEval ? new Date(a.firstEval).toISOString() : 'n/a';
    console.log(
      `  ${city.padEnd(20)} ${first.padEnd(22)} ${String(a.evaluators.size).padStart(10)} ${String(a.realEvalCount).padStart(10)} ${String(a.autoOnly).padStart(9)}`,
    );
  }

  // Also: hour-by-hour histogram for Rosh Pina vs Tzfat
  const target = ['ראש פינה', 'צפת', 'חצור הגלילית'];
  console.log('\nHour-by-hour eval count (cumulative) per target city:');
  const buckets = new Map<string, Map<number, number>>();
  for (const e of evals) {
    if (!e.createdAt || !e.hasEvaluatorUid) continue;
    const city = userCity.get(e.evaluatorId);
    if (!city || !target.includes(city)) continue;
    const hour = Math.floor(e.createdAt / (60 * 60 * 1000));
    const cityBuckets = buckets.get(city) || new Map<number, number>();
    cityBuckets.set(hour, (cityBuckets.get(hour) || 0) + 1);
    buckets.set(city, cityBuckets);
  }
  const minHour = Math.min(...[...buckets.values()].flatMap((b) => [...b.keys()]));
  const maxHour = Math.max(...[...buckets.values()].flatMap((b) => [...b.keys()]));
  console.log(`  ${'Hour (UTC)'.padEnd(22)} ${target.map((c) => c.padStart(10)).join(' ')}`);
  let cum = new Map<string, number>();
  for (let h = minHour; h <= maxHour; h++) {
    const row = target.map((c) => {
      const v = buckets.get(c)?.get(h) || 0;
      cum.set(c, (cum.get(c) || 0) + v);

      return String(cum.get(c)).padStart(10);
    });
    const t = new Date(h * 60 * 60 * 1000).toISOString().slice(0, 16);
    // skip rows with no change
    const hasChange = target.some((c) => (buckets.get(c)?.get(h) || 0) > 0);
    if (!hasChange) continue;
    console.log(`  ${t.padEnd(22)} ${row.join(' ')}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
