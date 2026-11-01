/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import type { Statement } from '@freedi/shared-types';
import { useAccessibleQuestions } from '../useAccessibleQuestions';
import { filterQuestionsBySearch } from '../questionSearchFilter';

const mockAuthedFetch = jest.fn();

jest.mock('@/lib/api/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => mockAuthedFetch(...args),
}));
jest.mock('@/lib/utils/errorHandling', () => ({
  httpErrorFromResponse: async () => new Error('http'),
}));

const make = (id: string, text: string, createdAt: number): Statement =>
  ({ statementId: id, statement: text, createdAt } as Statement);

const ALL = [make('1', 'Annual Budget', 5), make('2', 'Old budget plan', 1), make('3', 'Parks', 9)];

describe('useAccessibleQuestions', () => {
  beforeEach(() => {
    mockAuthedFetch.mockReset();
    mockAuthedFetch.mockResolvedValue({ ok: true, json: async () => ({ questions: ALL }) });
  });

  it('fetches once for several searches', async () => {
    const { result } = renderHook(() => useAccessibleQuestions());

    const [a, b, c] = await Promise.all([result.current(), result.current(), result.current()]);
    await result.current();

    expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthedFetch.mock.calls[0][0]).toBe('/api/questions?scope=all');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('retries after a failed load', async () => {
    mockAuthedFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAccessibleQuestions());

    await expect(result.current()).rejects.toThrow();
    await expect(result.current()).resolves.toEqual(ALL);
    expect(mockAuthedFetch).toHaveBeenCalledTimes(2);
  });
});

describe('filterQuestionsBySearch', () => {
  it('matches case-insensitively, newest first, including old questions', () => {
    expect(filterQuestionsBySearch(ALL, 'BUDGET').map((q) => q.statementId)).toEqual(['1', '2']);
  });

  it('returns nothing for an empty or unmatched search', () => {
    expect(filterQuestionsBySearch(ALL, '  ')).toEqual([]);
    expect(filterQuestionsBySearch(ALL, 'zzz')).toEqual([]);
  });
});
