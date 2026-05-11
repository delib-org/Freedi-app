/**
 * One-off backfill: attribute orphan evaluators on the survey's question
 * to the Rosh Pina (ראש פינה) city demographic.
 *
 * CONTEXT
 *   A session-regeneration bug during the Apr 15 afternoon window caused
 *   early Rosh Pina respondents to lose their session between filling the
 *   demographic form and submitting evaluations. Their evaluations were
 *   written under a brand-new anon userId that does not exist in any
 *   demographic doc, so the results dashboard cannot attribute them to
 *   Rosh Pina. Before the bug fix the dashboard was showing 149 Rosh Pina
 *   demographic responses on 237 total — confirmed via screenshot from
 *   2026-04-18. Currently only 19 Rosh Pina evaluators are linked; the
 *   128 orphan evaluators all joined within 14:00–22:00 UTC on 2026-04-15
 *   and their count matches the missing Rosh Pina cohort (149 − 19 ≈ 128).
 *
 * WHAT THIS SCRIPT DOES
 *   For each orphan `evaluatorId` whose anon-ID timestamp falls in the
 *   time window, create a `usersData` doc under the survey's demographic
 *   anchor with answer="ראש פינה" and audit flags. Age is NOT backfilled
 *   (we have no evidence for it).
 *
 * SAFETY
 *   - Idempotent: uses a deterministic doc ID `backfill--<userId>--<uqid>`
 *     so re-runs skip existing rows.
 *   - Audit fields: every synthetic doc carries `backfilled: true`,
 *     `backfillReason`, `backfilledAt`, and `backfillSource` so they can
 *     be queried and, if needed, undone.
 *   - Window-scoped: only orphans that joined in the Apr 15 window are
 *     attributed. Orphans outside the window are reported but not touched.
 *   - Dry-run by default unless `--commit` is passed.
 *
 * USAGE
 *   # dry run
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/backfill-orphan-rosh-pina.ts <surveyId>
 *
 *   # commit
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/backfill-orphan-rosh-pina.ts <surveyId> --commit
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';

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
console.log(`[env] FIREBASE_PROJECT_ID=${process.env.FIREBASE_PROJECT_ID}`);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

const TARGET_CITY = 'ראש פינה';
const CITY_Q_HINT = 'ישוב';
const WINDOW_START = Date.UTC(2026, 3, 15, 14, 0, 0); // Apr is month 3 (0-indexed)
const WINDOW_END = Date.UTC(2026, 3, 15, 22, 0, 0);
const BATCH_SIZE = 400;

interface Survey {
  surveyId: string;
  questionIds: string[];
  parentStatementId?: string;
}

function decodeAnonTs(userId: string): number | undefined {
  const m = userId.match(/^anon_(\d{13,})_/);

  return m ? Number(m[1]) : undefined;
}

function getSurveyAnchor(survey: Survey): string {
  return survey.parentStatementId || survey.surveyId;
}

interface CityTemplate {
  userQuestionId: string;
  question: string;
  options: unknown;
  type: string;
  required: boolean;
  order: number;
  scope: string;
  topParentId: string;
  statementId: string;
}

async function loadCityTemplate(
  db: FirebaseFirestore.Firestore,
  anchorId: string,
): Promise<CityTemplate | null> {
  // Pull one real doc that has the target city, so our synthetic doc
  // mirrors the exact schema (options array, required, order, etc.).
  const snap = await db
    .collection('usersData')
    .where('statementId', '==', anchorId)
    .where('answer', '==', TARGET_CITY)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const data = snap.docs[0].data();

  return {
    userQuestionId: data.userQuestionId as string,
    question: data.question as string,
    options: data.options,
    type: (data.type as string) || 'radio',
    required: (data.required as boolean) ?? true,
    order: (data.order as number) ?? 2,
    scope: (data.scope as string) || 'group',
    topParentId: (data.topParentId as string) || anchorId,
    statementId: (data.statementId as string) || anchorId,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const surveyId = args.find((a) => !a.startsWith('--'));
  if (!surveyId) {
    console.error('Usage: backfill-orphan-rosh-pina.ts <surveyId> [--commit]');
    process.exit(1);
  }

  const db = getFirestoreAdmin();
  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  if (!surveyDoc.exists) {
    console.error(`Survey ${surveyId} not found`);
    process.exit(1);
  }
  const survey = surveyDoc.data() as Survey;
  const anchorId = getSurveyAnchor(survey);
  const questionIds = survey.questionIds || [];

  console.log(`\n📋 Survey: ${surveyId}  ${commit ? '(COMMIT)' : '(DRY RUN)'}`);
  console.log(`  🔗 Anchor: ${anchorId}`);
  console.log(`  📝 Questions: ${questionIds.length}`);
  console.log(
    `  🕒 Window: ${new Date(WINDOW_START).toISOString()} → ${new Date(WINDOW_END).toISOString()}\n`,
  );

  // 1. Load template from an existing Rosh Pina doc.
  const tpl = await loadCityTemplate(db, anchorId);
  if (!tpl) {
    console.error(`  ❌ Could not find any existing usersData doc with answer="${TARGET_CITY}" under anchor.`);
    process.exit(1);
  }
  if (!tpl.question.includes(CITY_Q_HINT)) {
    console.warn(
      `  ⚠️  Template question "${tpl.question}" doesn't include "${CITY_Q_HINT}" — verify the template is the city question.`,
    );
  }
  console.log(`  🧬 Template userQuestionId: ${tpl.userQuestionId}`);
  console.log(`  🧬 Template question:       ${tpl.question}\n`);

  // 2. Build the demographic user set (for orphan detection).
  const demographicUsers = new Set<string>();
  const ddSnap = await db.collection('usersData').where('statementId', '==', anchorId).get();
  ddSnap.docs.forEach((d: QueryDocumentSnapshot) => {
    const uid = d.data().userId as string | undefined;
    if (uid) demographicUsers.add(uid);
  });
  console.log(`  👥 Existing demographic users: ${demographicUsers.size}`);

  // 3. Scan evaluations on all survey questions, collect orphan evaluatorIds.
  const orphanInfo = new Map<
    string,
    { evalCount: number; firstTs?: number; hasEvaluatorUid: boolean }
  >();
  for (const qid of questionIds) {
    const evalSnap = await db.collection('evaluations').where('parentId', '==', qid).get();
    evalSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const evaluatorId = data.evaluatorId as string | undefined;
      if (!evaluatorId) return;
      if (demographicUsers.has(evaluatorId)) return;
      const info =
        orphanInfo.get(evaluatorId) || { evalCount: 0, hasEvaluatorUid: false };
      info.evalCount += 1;
      const hasUid = Boolean((data.evaluator as { uid?: string } | undefined)?.uid);
      info.hasEvaluatorUid = info.hasEvaluatorUid || hasUid;
      const ts = Number(data.createdAt ?? data.updatedAt ?? data.lastUpdate ?? 0);
      if (ts) info.firstTs = Math.min(info.firstTs ?? Infinity, ts);
      orphanInfo.set(evaluatorId, info);
    });
  }
  console.log(`  🕵️  Orphan evaluators found:    ${orphanInfo.size}\n`);

  // 4. Scope to the time window via the anon-ID timestamp.
  interface Candidate {
    userId: string;
    joinedAt: number;
    evalCount: number;
  }
  const inWindow: Candidate[] = [];
  const outsideWindow: Array<{ userId: string; joinedAt?: number; evalCount: number; reason: string }> = [];
  for (const [userId, info] of orphanInfo) {
    const joinedAt = decodeAnonTs(userId);
    if (joinedAt === undefined) {
      outsideWindow.push({ userId, evalCount: info.evalCount, reason: 'non-anon format' });
      continue;
    }
    if (joinedAt < WINDOW_START || joinedAt > WINDOW_END) {
      outsideWindow.push({
        userId,
        joinedAt,
        evalCount: info.evalCount,
        reason: 'outside window',
      });
      continue;
    }
    inWindow.push({ userId, joinedAt, evalCount: info.evalCount });
  }
  inWindow.sort((a, b) => a.joinedAt - b.joinedAt);

  console.log(`  ✅ Orphans inside window:      ${inWindow.length}`);
  console.log(`  ⛔ Orphans outside window:     ${outsideWindow.length}`);
  if (outsideWindow.length > 0) {
    console.log(`\n  Orphans NOT being touched:`);
    outsideWindow.forEach((o) => {
      const at = o.joinedAt ? new Date(o.joinedAt).toISOString() : 'n/a';
      console.log(`    ${o.userId.padEnd(40)}  joined=${at}  evals=${o.evalCount}  (${o.reason})`);
    });
  }

  console.log(`\n  Sample of 5 orphans to attribute:`);
  inWindow.slice(0, 5).forEach((o) => {
    console.log(
      `    ${o.userId.padEnd(40)}  joined=${new Date(o.joinedAt).toISOString()}  evals=${o.evalCount}`,
    );
  });

  // 5. Build synthetic docs and check idempotency.
  let toWrite = 0;
  let alreadyExists = 0;
  const backfillReason = 'session-regenerated-orphan';
  const backfillSource = 'backfill-orphan-rosh-pina.ts';
  const backfilledAt = Date.now();
  let batch: WriteBatch = db.batch();
  let batchCount = 0;

  for (const cand of inWindow) {
    const docId = `backfill--${cand.userId}--${tpl.userQuestionId}`;
    const ref = db.collection('usersData').doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      alreadyExists += 1;
      continue;
    }

    const docData = {
      answer: TARGET_CITY,
      question: tpl.question,
      topParentId: tpl.topParentId,
      scope: tpl.scope,
      userQuestionId: tpl.userQuestionId,
      options: tpl.options,
      statementId: tpl.statementId,
      type: tpl.type,
      userId: cand.userId,
      required: tpl.required,
      order: tpl.order,
      backfilled: true,
      backfillReason,
      backfillSource,
      backfilledAt,
    };

    toWrite += 1;

    if (commit) {
      batch.set(ref, docData);
      batchCount += 1;
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (commit && batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n  📝 Would-write:     ${toWrite}`);
  console.log(`  ✔️  Already exists:  ${alreadyExists}`);

  console.log('\n========== SUMMARY ==========');
  console.log(`  Orphan evaluators total:          ${orphanInfo.size}`);
  console.log(`  In-window candidates:             ${inWindow.length}`);
  console.log(`  Synthetic docs to write:          ${toWrite}`);
  console.log(`  Synthetic docs already present:   ${alreadyExists}`);
  console.log(`  Attribution city:                 ${TARGET_CITY}`);
  console.log(`  Demographic question used:        ${tpl.userQuestionId} (${tpl.question})`);
  console.log('=============================');

  if (!commit) {
    console.log('\n  DRY RUN — pass --commit to write.');
  } else {
    console.log('\n  ✓ Writes committed. Reload the results page to see updated Rosh Pina count.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
