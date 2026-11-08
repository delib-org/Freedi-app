jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), withScope: jest.fn() }));

import { HttpError } from '@/lib/utils/errorHandling';
import {
  CardUploadItem,
  CardUploadUpdate,
  problemFromUploadError,
  runCardUploads,
} from '../cardUploadQueue';

const item = (key: string): CardUploadItem => ({
  key,
  statementId: `opt-${key}`,
  file: new File([new Uint8Array(4)], `${key}.png`, { type: 'image/png' }),
  alt: '',
});

describe('cardUploadQueue', () => {
  describe('runCardUploads', () => {
    it('uploads every item and reports queued → uploading → done', async () => {
      const updates: CardUploadUpdate[] = [];
      const upload = jest.fn().mockResolvedValue(undefined);

      const results = await runCardUploads([item('a'), item('b')], upload, (u) => updates.push(u));

      expect(upload).toHaveBeenCalledTimes(2);
      expect(results.every((r) => r.status === 'done')).toBe(true);
      const forA = updates.filter((u) => u.key === 'a').map((u) => u.status);
      expect(forA).toEqual(['queued', 'uploading', 'done']);
    });

    it('never has more uploads in flight than the concurrency', async () => {
      let inFlight = 0;
      let peak = 0;
      const upload = jest.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      });

      await runCardUploads(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(item), upload, () => undefined, 3);

      expect(upload).toHaveBeenCalledTimes(7);
      expect(peak).toBe(3);
    });

    it('keeps going after a failure and names the problem', async () => {
      const upload = jest.fn(async (i: CardUploadItem) => {
        if (i.key === 'b') throw new HttpError('Unsupported image', 400, '/x');
        if (i.key === 'c') throw new TypeError('Failed to fetch');
      });

      const results = await runCardUploads([item('a'), item('b'), item('c')], upload, () => undefined);
      const byKey = Object.fromEntries(results.map((r) => [r.key, r]));

      expect(byKey.a.status).toBe('done');
      expect(byKey.b).toEqual({ key: 'b', status: 'failed', problem: 'content' });
      expect(byKey.c).toEqual({ key: 'c', status: 'failed', problem: 'network' });
    });

    it('does nothing for an empty list', async () => {
      const upload = jest.fn();
      await expect(runCardUploads([], upload, () => undefined)).resolves.toEqual([]);
      expect(upload).not.toHaveBeenCalled();
    });
  });

  describe('problemFromUploadError', () => {
    it('maps statuses to problems', () => {
      expect(problemFromUploadError(new HttpError('x', 400, '/x'))).toBe('content');
      expect(problemFromUploadError(new HttpError('x', 413, '/x'))).toBe('size');
      expect(problemFromUploadError(new HttpError('x', 500, '/x'))).toBe('network');
      expect(problemFromUploadError(new Error('offline'))).toBe('network');
    });
  });
});
