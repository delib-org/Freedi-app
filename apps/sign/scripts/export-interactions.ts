/**
 * Script to export interactions for a specific document
 * Run with: npx ts-node --esm scripts/export-interactions.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const DOCUMENT_ID = 'ppLwVO6sI2m2';

// Collections from delib-npm
const Collections = {
  statements: 'statements',
  signatures: 'signatures',
  approval: 'approval',
  suggestions: 'suggestions',
  evaluations: 'evaluations',
  userDemographicQuestions: 'user-demographic-questions',
  usersData: 'users-data',
};

async function main() {
  // Initialize Firebase Admin
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

  console.log('Fetching data for document:', DOCUMENT_ID);

  // Get document
  const docSnap = await db.collection(Collections.statements).doc(DOCUMENT_ID).get();
  if (!docSnap.exists) {
    console.error('Document not found');
    process.exit(1);
  }

  const document = docSnap.data();
  console.log('Document title:', document?.statement);

  // Get signatures
  const signaturesSnap = await db
    .collection(Collections.signatures)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.log('Signatures count:', signaturesSnap.size);

  // Get approvals
  const approvalsSnap = await db
    .collection(Collections.approval)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.log('Approvals count:', approvalsSnap.size);

  // Get comments (statements with topParentId)
  const commentsSnap = await db
    .collection(Collections.statements)
    .where('topParentId', '==', DOCUMENT_ID)
    .where('statementType', '==', 'statement')
    .get();
  console.log('Comments count:', commentsSnap.size);

  // Get suggestions
  const suggestionsSnap = await db
    .collection(Collections.suggestions)
    .where('documentId', '==', DOCUMENT_ID)
    .get();
  console.log('Suggestions count:', suggestionsSnap.size);

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

  // Output as JSON
  const outputPath = path.join(__dirname, `export-${DOCUMENT_ID}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log('\nExport saved to:', outputPath);
  console.log('\n--- JSON Output ---\n');
  console.log(JSON.stringify(exportData, null, 2));
}

main().catch(console.error);
