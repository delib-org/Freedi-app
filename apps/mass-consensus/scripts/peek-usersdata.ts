import { readFileSync } from 'fs';
import path from 'path';

const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match && !match[1].startsWith('#')) {
    const key = match[1].trim();
    let value = match[2].trim();
    value = value.replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

async function main(): Promise<void> {
  const db = getFirestoreAdmin();
  const anchor = 'survey_1771161398293_ijymws9';

  const questionMap = new Map<string, { question: string; sample: Record<string, unknown> }>();
  const snap = await db.collection('usersData').where('statementId', '==', anchor).limit(200).get();
  snap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const qid = data.userQuestionId as string;
    if (!questionMap.has(qid)) {
      questionMap.set(qid, { question: (data.question as string) || '(no text)', sample: data });
    }
  });

  console.log(`Inspected ${snap.size} docs, ${questionMap.size} distinct questions\n`);
  for (const [qid, { question, sample }] of questionMap) {
    console.log(`━━━ ${qid} :: ${question} ━━━`);
    console.log(JSON.stringify(sample, null, 2));
    console.log('');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
