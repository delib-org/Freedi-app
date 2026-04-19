/**
 * Read-only: trace every evaluation made by users whose demographic
 * city answer is "ראש פינה" (Rosh Pina) under a given survey anchor.
 *
 * Groups by parentId (the question they evaluated) so we can see whether
 * their evaluations landed on the survey's current question, on a
 * removed/old question, or were marked as test data.
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/trace-rosh-pina-evals.ts <surveyId> [cityName]
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

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const surveyId = args[0];
  const cityName = args[1] || 'ראש פינה';
  if (!surveyId) {
    console.error('Usage: trace-rosh-pina-evals.ts <surveyId> [cityName]');
    process.exit(1);
  }

  const db = getFirestoreAdmin();

  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  const survey = surveyDoc.data();
  const anchorId = (survey?.parentStatementId as string) || surveyId;
  const currentQuestionIds: string[] = survey?.questionIds || [];
  console.log(`Anchor: ${anchorId}`);
  console.log(`Current survey question IDs: ${currentQuestionIds.join(', ')}\n`);

  // Find all city demographic docs matching the target city.
  const cityAnswerSnap = await db
    .collection('usersData')
    .where('statementId', '==', anchorId)
    .get();

  const cityUsers = new Set<string>();
  cityAnswerSnap.docs.forEach((d: QueryDocumentSnapshot) => {
    const data = d.data();
    const q = (data.question as string) || '';
    const answer = String(data.answer ?? '');
    if (answer === cityName || (q.includes('ישוב') && answer === cityName)) {
      const uid = data.userId as string | undefined;
      if (uid) cityUsers.add(uid);
    }
  });
  console.log(`"${cityName}" users (by demographic answer): ${cityUsers.size}\n`);

  if (cityUsers.size === 0) return;

  // For each Rosh Pina user, pull all their evaluations in Firestore.
  // Firestore `where IN` limit is 30, so chunk.
  const userIds = [...cityUsers];
  const CHUNK = 30;

  interface EvalRow {
    id: string;
    parentId?: string;
    statementId?: string;
    evaluation?: number;
    hasEvaluatorUid: boolean;
    createdAt?: number;
    isTestData?: boolean;
    markedAsTestAt?: number;
    demographicAnchorId?: string;
  }

  const evals: EvalRow[] = [];
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const snap = await db
      .collection('evaluations')
      .where('evaluatorId', 'in', chunk)
      .get();

    snap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      evals.push({
        id: d.id,
        parentId: data.parentId as string | undefined,
        statementId: data.statementId as string | undefined,
        evaluation: data.evaluation as number | undefined,
        hasEvaluatorUid: Boolean((data.evaluator as { uid?: string } | undefined)?.uid),
        createdAt: (data.createdAt as number | undefined) ?? (data.updatedAt as number | undefined),
        isTestData: data.isTestData as boolean | undefined,
        markedAsTestAt: data.markedAsTestAt as number | undefined,
        demographicAnchorId: data.demographicAnchorId as string | undefined,
      });
    });
  }

  console.log(`Total evaluations by "${cityName}" users across all of Firestore: ${evals.length}\n`);

  // Group by parentId
  const byParent = new Map<
    string,
    { total: number; realEval: number; autoOnly: number; testData: number; withAnchor: number; distinctUsers: Set<string>; earliest?: number; latest?: number }
  >();

  for (const e of evals) {
    const key = e.parentId || '<no parentId>';
    const b =
      byParent.get(key) ||
      { total: 0, realEval: 0, autoOnly: 0, testData: 0, withAnchor: 0, distinctUsers: new Set<string>() };
    b.total += 1;
    if (e.hasEvaluatorUid) b.realEval += 1;
    else b.autoOnly += 1;
    if (e.isTestData) b.testData += 1;
    if (e.demographicAnchorId) b.withAnchor += 1;
    // extract evaluatorId from id: userId--statementId OR random id
    const userId = e.id.includes('--') ? e.id.split('--')[0] : undefined;
    if (userId) b.distinctUsers.add(userId);
    if (e.createdAt) {
      b.earliest = b.earliest ? Math.min(b.earliest, e.createdAt) : e.createdAt;
      b.latest = b.latest ? Math.max(b.latest, e.createdAt) : e.createdAt;
    }
    byParent.set(key, b);
  }

  console.log('Breakdown by parentId (question evaluated):');
  const rows = [...byParent.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [parentId, b] of rows) {
    const inCurrent = currentQuestionIds.includes(parentId);
    const marker = inCurrent ? '  [CURRENT]' : '  [NOT IN SURVEY]';
    const earliest = b.earliest ? new Date(b.earliest).toISOString().slice(0, 16) : 'n/a';
    const latest = b.latest ? new Date(b.latest).toISOString().slice(0, 16) : 'n/a';
    console.log(`  ${parentId}${marker}`);
    console.log(
      `     total=${b.total} realEval=${b.realEval} autoOnly=${b.autoOnly} testData=${b.testData} withAnchor=${b.withAnchor} distinctUsers=${b.distinctUsers.size}`,
    );
    console.log(`     span: ${earliest}  →  ${latest}\n`);
  }

  // For each "not in survey" parent, load the statement doc and show what it is.
  const offSurveyParents = rows.filter(([pid]) => !currentQuestionIds.includes(pid)).map(([pid]) => pid);
  if (offSurveyParents.length > 0) {
    console.log(`\nResolving ${offSurveyParents.length} off-survey parent statement(s)...`);
    for (const pid of offSurveyParents) {
      if (pid === '<no parentId>') continue;
      const stmt = await db.collection('statements').doc(pid).get();
      if (!stmt.exists) {
        console.log(`  ${pid}: <statement missing>`);
        continue;
      }
      const s = stmt.data();
      console.log(
        `  ${pid}: "${s?.statement?.slice(0, 80)}"  parentId=${s?.parentId}  topParentId=${s?.topParentId}  type=${s?.statementType}`,
      );
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
