/**
 * Firebase Firestore Emulator seed/clear helper for E2E tests.
 * Seeds and clears data via the Firestore Emulator REST API.
 */

const FIRESTORE_EMULATOR_HOST = 'http://localhost:8081';

/**
 * Clear all Firestore emulator data.
 */
export async function clearFirestoreData(projectId = 'delib-5'): Promise<void> {
  const url = `${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to clear Firestore data: ${response.status} ${errorBody}`);
  }
}

interface FirestoreDocument {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

/**
 * Seed a single document into the Firestore emulator.
 */
export async function seedDocument(
  doc: FirestoreDocument,
  projectId = 'delib-5'
): Promise<void> {
  const url = `${FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${doc.collection}?documentId=${doc.id}`;

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.data)) {
    fields[key] = convertToFirestoreValue(value);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to seed document ${doc.collection}/${doc.id}: ${response.status} ${errorBody}`);
  }
}

/**
 * Seed multiple documents into the Firestore emulator.
 */
export async function seedDocuments(
  docs: FirestoreDocument[],
  projectId = 'delib-5'
): Promise<void> {
  await Promise.all(docs.map((doc) => seedDocument(doc, projectId)));
}

/**
 * Convert a JS value to Firestore REST API value format.
 */
function convertToFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(convertToFirestoreValue),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = convertToFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}
