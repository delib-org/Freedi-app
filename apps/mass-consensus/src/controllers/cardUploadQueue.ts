/**
 * Card Upload Queue
 * Uploads the pictures of freshly created cards a few at a time, reporting
 * each card's status as it changes. One failure never stops the others.
 */

import { HttpError } from '@/lib/utils/errorHandling';
import type { CardPictureProblem, CardUploadStatus } from '@/lib/utils/cardDrafts';

export const CARD_UPLOAD_CONCURRENCY = 3;

export interface CardUploadItem {
  /** The draft's key — how the caller finds the row. */
  key: string;
  statementId: string;
  file: File;
  alt: string;
}

export interface CardUploadUpdate {
  key: string;
  status: CardUploadStatus;
  problem?: CardPictureProblem;
}

export type CardUploader = (item: CardUploadItem) => Promise<void>;

/** A server 400 means the file itself was refused; anything else may pass on retry. */
export function problemFromUploadError(error: unknown): CardPictureProblem {
  if (error instanceof HttpError && error.status === 400) return 'content';
  if (error instanceof HttpError && error.status === 413) return 'size';

  return 'network';
}

/**
 * Upload every item with at most `concurrency` requests in flight. Resolves
 * once all have settled; the per-card outcome arrives through `onUpdate`.
 */
export async function runCardUploads(
  items: readonly CardUploadItem[],
  upload: CardUploader,
  onUpdate: (update: CardUploadUpdate) => void,
  concurrency: number = CARD_UPLOAD_CONCURRENCY
): Promise<CardUploadUpdate[]> {
  const results: CardUploadUpdate[] = [];
  items.forEach((item) => onUpdate({ key: item.key, status: 'queued' }));

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      onUpdate({ key: item.key, status: 'uploading' });

      let result: CardUploadUpdate;
      try {
        await upload(item);
        result = { key: item.key, status: 'done' };
      } catch (error) {
        result = { key: item.key, status: 'failed', problem: problemFromUploadError(error) };
      }
      results.push(result);
      onUpdate(result);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);

  return results;
}
