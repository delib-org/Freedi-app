/**
 * Google Docs API client for Sign app
 * Uses Service Account authentication
 */

import { google, docs_v1 } from 'googleapis';

let docsClient: docs_v1.Docs | null = null;

/**
 * Get or create Google Docs API client
 * Uses service account credentials from environment variables
 */
export function getGoogleDocsClient(): docs_v1.Docs {
  if (docsClient) {
    return docsClient;
  }

  const clientEmail = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_DOCS_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Google Docs API credentials not configured. ' +
      'Set GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL and GOOGLE_DOCS_PRIVATE_KEY environment variables.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  });

  docsClient = google.docs({ version: 'v1', auth });

  return docsClient;
}

/**
 * Fetch a Google Doc by document ID
 * @param documentId - The Google Docs document ID
 * @returns The document data
 */
export async function fetchGoogleDoc(documentId: string): Promise<docs_v1.Schema$Document> {
  const client = getGoogleDocsClient();

  const response = await client.documents.get({
    documentId,
  });

  return response.data;
}

/**
 * Get the service account email (for sharing instructions)
 */
export function getServiceAccountEmail(): string {
  return process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL || '';
}
