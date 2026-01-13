import { getFirestoreAdmin } from './src/lib/firebase/admin';

const surveyId = 'survey_1767016667817_bzqdy10';

async function checkData() {
  const db = getFirestoreAdmin();

  // Check survey exists
  const surveyDoc = await db.collection('surveys').doc(surveyId).get();
  console.log('Survey exists:', surveyDoc.exists);
  if (surveyDoc.exists) {
    const survey = surveyDoc.data();
    console.log('Survey questionIds:', survey?.questionIds);
  }

  // Check surveyProgress collection
  const progressSnapshot = await db
    .collection('surveyProgress')
    .where('surveyId', '==', surveyId)
    .get();
  console.log('surveyProgress count:', progressSnapshot.size);

  // Check all surveyProgress to see what surveyIds exist
  const allProgressSnapshot = await db
    .collection('surveyProgress')
    .limit(10)
    .get();
  console.log('\nSample surveyProgress documents:');
  allProgressSnapshot.docs.forEach((doc, i) => {
    const data = doc.data();
    console.log('  ' + (i + 1) + '. docId: ' + doc.id + ', surveyId: ' + data.surveyId);
  });

  // Check if there are progress docs that START with this survey ID
  const progressByPrefix = await db
    .collection('surveyProgress')
    .where('surveyId', '>=', 'survey_1767')
    .where('surveyId', '<=', 'survey_1767\uf8ff')
    .limit(10)
    .get();
  console.log('\nProgress docs with surveyId starting with survey_1767:', progressByPrefix.size);
  progressByPrefix.docs.forEach((doc, i) => {
    const data = doc.data();
    console.log('  ' + (i + 1) + '. surveyId: ' + data.surveyId);
  });
}

checkData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
