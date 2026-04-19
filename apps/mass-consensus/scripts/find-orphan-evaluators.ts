/**
 * Read-only: find "orphan" evaluators — users who evaluated the survey's
 * question but whose userId does NOT appear in any demographic answer
 * under the survey anchor.
 *
 * Shows the raw doc shape so we can see what other fields might exist
 * that could be used to relink them to a demographic respondent.
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/find-orphan-evaluators.ts <surveyId>
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

function decodeAnonTs(userId: string): number | undefined {
  const m = userId.match(/^anon_(\d{13,})_/);

  return m ? Number(m[1]) : undefined;
}

async function main(): Promise<void> {
  const surveyId = process.argv[2];
  if (!surveyId) { console.error('Usage: find-orphan-evaluators.ts <surveyId>'); process.exit(1); }

  const db = getFirestoreAdmin();
  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  const survey = surveyDoc.data();
  const anchorId = (survey?.parentStatementId as string) || surveyId;
  const questionIds: string[] = survey?.questionIds || [];

  // All userIds that have demographic answers under the anchor.
  const demographicUsers = new Set<string>();
  const demographicDocShape = new Set<string>();
  const ddSnap = await db.collection('usersData').where('statementId', '==', anchorId).get();
  ddSnap.docs.forEach((d: QueryDocumentSnapshot) => {
    const data = d.data();
    Object.keys(data).forEach((k) => demographicDocShape.add(k));
    const uid = data.userId as string | undefined;
    if (uid) demographicUsers.add(uid);
  });
  console.log(`Demographic respondents: ${demographicUsers.size}`);
  console.log(`usersData fields seen: [${[...demographicDocShape].join(', ')}]\n`);

  // Walk evaluations on survey questions. Bucket evaluatorIds into:
  //   - linked: evaluatorId exists in demographicUsers
  //   - orphan: evaluatorId not in demographicUsers
  const linked = new Set<string>();
  const orphan = new Set<string>();
  const orphanSampleDocs: Array<Record<string, unknown> & { id: string }> = [];
  const evaluationFieldShape = new Set<string>();
  const orphanEvalsByUser = new Map<string, number>();
  const orphanWithAnchor = new Map<string, boolean>();
  const orphanFirstTs = new Map<string, number>();
  const orphanLastTs = new Map<string, number>();
  const orphanHasEvaluatorUid = new Map<string, boolean>();

  for (const qid of questionIds) {
    const snap = await db.collection('evaluations').where('parentId', '==', qid).get();
    snap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      Object.keys(data).forEach((k) => evaluationFieldShape.add(k));
      const evaluatorId = data.evaluatorId as string | undefined;
      if (!evaluatorId) return;
      if (demographicUsers.has(evaluatorId)) {
        linked.add(evaluatorId);

        return;
      }
      orphan.add(evaluatorId);
      orphanEvalsByUser.set(evaluatorId, (orphanEvalsByUser.get(evaluatorId) || 0) + 1);
      const anchor = data.demographicAnchorId as string | undefined;
      orphanWithAnchor.set(evaluatorId, orphanWithAnchor.get(evaluatorId) || Boolean(anchor));
      const uid = (data.evaluator as { uid?: string } | undefined)?.uid;
      orphanHasEvaluatorUid.set(evaluatorId, orphanHasEvaluatorUid.get(evaluatorId) || Boolean(uid));
      const ts = Number(data.createdAt ?? data.updatedAt ?? data.lastUpdate ?? 0) || undefined;
      if (ts) {
        orphanFirstTs.set(evaluatorId, Math.min(orphanFirstTs.get(evaluatorId) ?? Infinity, ts));
        orphanLastTs.set(evaluatorId, Math.max(orphanLastTs.get(evaluatorId) ?? 0, ts));
      }
      if (orphanSampleDocs.length < 5) orphanSampleDocs.push({ id: d.id, ...data });
    });
  }

  console.log(`Evaluation fields seen: [${[...evaluationFieldShape].join(', ')}]\n`);
  console.log(`Evaluators linked to a demographic user:    ${linked.size}`);
  console.log(`Orphan evaluators (no demographic answer):  ${orphan.size}\n`);

  // Sample orphan evaluation docs in full
  console.log('=== Sample orphan evaluation docs (5 max) ===');
  orphanSampleDocs.forEach((d) => {
    console.log(JSON.stringify(d, null, 2));
    console.log('');
  });

  // Summary table of orphans: how many evals each, anchor set?, real eval?, anon ID decoded timestamp.
  const rows = [...orphan].map((uid) => ({
    uid,
    evals: orphanEvalsByUser.get(uid) || 0,
    anchor: orphanWithAnchor.get(uid) ?? false,
    realEval: orphanHasEvaluatorUid.get(uid) ?? false,
    firstEval: orphanFirstTs.get(uid),
    lastEval: orphanLastTs.get(uid),
    joinedAt: decodeAnonTs(uid),
  }));

  // Aggregate: how many orphans have anchor set? how many are "real" eval? when did they join?
  const withAnchor = rows.filter((r) => r.anchor).length;
  const realEvalOrphans = rows.filter((r) => r.realEval).length;
  const anonFormat = rows.filter((r) => r.joinedAt).length;

  console.log(`=== Orphan summary ===`);
  console.log(`  Total orphan distinct userIds:     ${rows.length}`);
  console.log(`  Total orphan evaluations:          ${[...orphanEvalsByUser.values()].reduce((a, b) => a + b, 0)}`);
  console.log(`  With demographicAnchorId set:      ${withAnchor} (these ARE survey participants)`);
  console.log(`  With nested evaluator.uid:         ${realEvalOrphans}`);
  console.log(`  anon_<ts>_<rand> format userIds:   ${anonFormat}\n`);

  // Histogram of orphan join timestamps (decoded from anon userId)
  console.log('Orphan join times (decoded from anon userId):');
  const hourly = new Map<string, number>();
  for (const r of rows) {
    if (!r.joinedAt) continue;
    const day = new Date(r.joinedAt).toISOString().slice(0, 13); // YYYY-MM-DDTHH
    hourly.set(day, (hourly.get(day) || 0) + 1);
  }
  const sortedHours = [...hourly.entries()].sort();
  sortedHours.forEach(([h, n]) => {
    console.log(`  ${h}   ${'█'.repeat(Math.min(n, 80))} ${n}`);
  });

  // Top 20 orphans by evals, to scan patterns
  const topOrphans = rows.filter((r) => r.evals >= 3).sort((a, b) => b.evals - a.evals).slice(0, 20);
  console.log(`\nTop orphan evaluators (≥3 evals, top 20 by volume):`);
  console.log(`  ${'userId'.padEnd(40)} ${'evals'.padStart(5)} ${'anchor'.padStart(7)} ${'real'.padStart(5)} ${'joinedAt (UTC)'}`);
  topOrphans.forEach((r) => {
    const joined = r.joinedAt ? new Date(r.joinedAt).toISOString() : '—';
    console.log(
      `  ${r.uid.padEnd(40)} ${String(r.evals).padStart(5)} ${String(r.anchor).padStart(7)} ${String(r.realEval).padStart(5)} ${joined}`,
    );
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
