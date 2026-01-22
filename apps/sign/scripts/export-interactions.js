const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const path = require('path');

// Load production env
dotenv.config({ path: path.join(__dirname, '../../../env/.env.prod') });

const DOCUMENT_ID = 'ppLwVO6sI2m2';

const Collections = {
  statements: 'statements',
  signatures: 'signatures',
  approval: 'approval',
  suggestions: 'suggestions',
};

async function main() {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n');

  console.error('Project ID:', process.env.FIREBASE_PROJECT_ID);

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore(app);

  console.error('Fetching data for document:', DOCUMENT_ID);

  // Get document
  const docSnap = await db.collection(Collections.statements).doc(DOCUMENT_ID).get();
  if (!docSnap.exists) {
    console.error('Document not found');
    process.exit(1);
  }

  const document = docSnap.data();
  console.error('Document title:', document?.statement);

  // Get signatures
  const signaturesSnap = await db
    .collection(Collections.signatures)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.error('Signatures count:', signaturesSnap.size);

  // Get approvals
  const approvalsSnap = await db
    .collection(Collections.approval)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.error('Approvals count:', approvalsSnap.size);

  // Get comments (statements with topParentId)
  const commentsSnap = await db
    .collection(Collections.statements)
    .where('topParentId', '==', DOCUMENT_ID)
    .where('statementType', '==', 'statement')
    .get();
  console.error('Comments count:', commentsSnap.size);

  // Get suggestions
  const suggestionsSnap = await db
    .collection(Collections.suggestions)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.error('Suggestions count:', suggestionsSnap.size);

  // Build export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    document: {
      id: DOCUMENT_ID,
      title: document?.statement,
      createdAt: document?.createdAt,
    },
    interactions: {
      signatures: signaturesSnap.docs.map(doc => {
        const data = doc.data();
        return {
          odlUserId: data.userId,
          signed: data.signed,
          date: data.date,
          levelOfSignature: data.levelOfSignature,
        };
      }),
      approvals: approvalsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          odlUserId: data.userId,
          paragraphId: data.paragraphId || data.statementId,
          approval: data.approval,
          createdAt: data.createdAt,
        };
      }),
      comments: commentsSnap.docs
        .filter(doc => !doc.data().hide)
        .map(doc => {
          const data = doc.data();
          return {
            odlUserId: data.creatorId,
            paragraphId: data.parentId,
            content: data.statement,
            createdAt: data.createdAt,
          };
        }),
      suggestions: suggestionsSnap.docs
        .filter(doc => !doc.data().hide)
        .map(doc => {
          const data = doc.data();
          return {
            odlUserId: data.creatorId,
            paragraphId: data.paragraphId,
            originalContent: data.originalContent,
            suggestedContent: data.suggestedContent,
            reasoning: data.reasoning,
            createdAt: data.createdAt,
          };
        }),
    },
  };

  console.log(JSON.stringify(exportData, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
