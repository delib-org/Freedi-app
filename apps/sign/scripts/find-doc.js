const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SEARCH_ID = 'ppLwVO6sI2m2';

async function main() {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n');

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore(app);

  console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
  console.log('Searching for:', SEARCH_ID);

  // Try direct lookup
  const docSnap = await db.collection('statements').doc(SEARCH_ID).get();
  console.log('Direct lookup exists:', docSnap.exists);

  // Try finding by statementId field
  const byField = await db.collection('statements')
    .where('statementId', '==', SEARCH_ID)
    .limit(1)
    .get();
  console.log('By statementId field:', byField.size);

  // List some recent statements to see what's there
  const recent = await db.collection('statements')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  console.log('\nRecent statements:');
  recent.docs.forEach(doc => {
    const data = doc.data();
    console.log(`- ${doc.id}: ${data.statement?.substring(0, 50)}...`);
  });
}

main().catch(console.error);
