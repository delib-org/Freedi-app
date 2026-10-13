/**
 * POST to an HTTP Cloud Function from a Next.js API route.
 *
 * The function itself always answers JSON. Anything else is a Google
 * front-end page: on a cold start Cloud Run can abort the request with
 * "no available instance" (an HTML 500) before our code ever runs. Those
 * pages are retried once after a short pause, and never reach `response.json()`.
 */

/** Statuses whose HTML page means the request never reached our code. */
const RETRYABLE_GATEWAY_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1500;
const MAX_ATTEMPTS = 2;
const PREVIEW_LENGTH = 100;

export type CloudFunctionResult<T> =
  | { kind: 'json'; status: number; ok: boolean; data: T }
  | { kind: 'unavailable'; status: number; attempts: number; preview: string };

export interface CloudFunctionOptions {
  /** Pause between attempts; tests pass 0. */
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

function isJson(response: Response): boolean {
  return (response.headers.get('content-type') || '').includes('application/json');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postToCloudFunction<T = Record<string, unknown>>(
  endpoint: string,
  body: unknown,
  options: CloudFunctionOptions = {}
): Promise<CloudFunctionResult<T>> {
  const { retryDelayMs = RETRY_DELAY_MS, fetchImpl = fetch } = options;
  let attempts = 0;

  while (true) {
    attempts += 1;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (isJson(response)) {
      const data = (await response.json()) as T;

      return { kind: 'json', status: response.status, ok: response.ok, data };
    }

    const preview = (await response.text()).substring(0, PREVIEW_LENGTH);
    const canRetry = RETRYABLE_GATEWAY_STATUSES.has(response.status) && attempts < MAX_ATTEMPTS;
    if (!canRetry) {
      return { kind: 'unavailable', status: response.status, attempts, preview };
    }

    await wait(retryDelayMs);
  }
}
