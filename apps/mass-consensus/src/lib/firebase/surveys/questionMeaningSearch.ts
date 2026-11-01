import {
  Statement,
  Collections,
  QUESTION_SEARCH_CONFIG,
  SearchQuestionsByMeaningRequest,
  SearchQuestionsByMeaningResponse,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';

const FUNCTIONS_REGION = 'me-west1';
const CALLABLE_NAME = 'searchQuestionsByMeaning';
/** Longest the proxy waits for the callable (embedding + vector search) */
export const MEANING_SEARCH_TIMEOUT_MS = 15000;

/** Where the callable lives; override for the emulator or a non-default project */
export function getMeaningSearchEndpoint(): string | null {
  const override = process.env.SEARCH_QUESTIONS_BY_MEANING_ENDPOINT;
  if (override) return override;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return projectId
    ? `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${CALLABLE_NAME}`
    : null;
}

interface CallableEnvelope {
  result?: SearchQuestionsByMeaningResponse;
  error?: { status?: string; message?: string };
}

/**
 * Calls the `searchQuestionsByMeaning` callable from the server with the
 * caller's own ID token (callables accept it as the auth header). Server to
 * server, so no browser CORS allow-list is involved.
 */
export async function callSearchQuestionsByMeaning(
  endpoint: string,
  idToken: string,
  request: SearchQuestionsByMeaningRequest
): Promise<SearchQuestionsByMeaningResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ data: request }),
      cache: 'no-store',
      signal: AbortSignal.timeout(MEANING_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`searchQuestionsByMeaning timed out after ${MEANING_SEARCH_TIMEOUT_MS} ms`);
    }
    throw error;
  }

  let envelope: CallableEnvelope;
  try {
    envelope = (await response.json()) as CallableEnvelope;
  } catch {
    throw new Error(`searchQuestionsByMeaning returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || !envelope.result) {
    throw new Error(
      `searchQuestionsByMeaning failed: ${envelope.error?.status ?? response.status} ${envelope.error?.message ?? ''}`
    );
  }

  return envelope.result;
}

/** Full statements for the matched ids, in rank order (the callable already checked access) */
export async function loadMatchedQuestions(
  matches: SearchQuestionsByMeaningResponse['results']
): Promise<Statement[]> {
  if (matches.length === 0) return [];

  const db = getFirestoreAdmin();
  const refs = matches
    .slice(0, QUESTION_SEARCH_CONFIG.MAX_LIMIT)
    .map((m) => db.collection(Collections.statements).doc(m.statementId));
  const snapshots = await db.getAll(...refs);

  return snapshots.filter((s) => s.exists).map((s) => s.data() as Statement);
}
