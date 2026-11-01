/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import type { Statement } from '@freedi/shared-types';
import { useSimilarByMeaning } from '../useSimilarByMeaning';
import { selectMeaningSuggestions } from '../suggestedQuestions';
import { UI } from '@/constants/common';

const mockAuthedFetch = jest.fn();
const mockLogError = jest.fn();

jest.mock('@/lib/api/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => mockAuthedFetch(...args),
}));
jest.mock('@/lib/utils/errorHandling', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}));

const make = (id: string): Statement => ({ statementId: id, statement: id } as Statement);

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(UI.MEANING_SEARCH_DEBOUNCE);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useSimilarByMeaning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAuthedFetch.mockReset();
    mockLogError.mockReset();
    mockAuthedFetch.mockResolvedValue({ ok: true, json: async () => ({ questions: [make('a')] }) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not call the backend for fewer than 3 characters', async () => {
    renderHook(() => useSimilarByMeaning('ab'));
    await settle();

    expect(mockAuthedFetch).not.toHaveBeenCalled();
  });

  it('waits for the debounce and calls once for a typed query', async () => {
    const { result } = renderHook(() => useSimilarByMeaning('budget'));

    expect(mockAuthedFetch).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    await settle();

    expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
    expect(result.current.questions).toEqual([make('a')]);
    expect(result.current.loading).toBe(false);
  });

  it('answers a query it has already answered from the cache', async () => {
    const { result, rerender } = renderHook(({ q }) => useSimilarByMeaning(q), {
      initialProps: { q: 'budget' },
    });
    await settle();
    rerender({ q: 'parks' });
    await settle();
    rerender({ q: 'Budget' });
    await settle();

    expect(mockAuthedFetch).toHaveBeenCalledTimes(2);
    expect(result.current.questions).toEqual([make('a')]);
  });

  it('only calls for the last query when typing fast', async () => {
    const { rerender } = renderHook(({ q }) => useSimilarByMeaning(q), { initialProps: { q: 'bud' } });
    rerender({ q: 'budg' });
    rerender({ q: 'budget' });
    await settle();

    expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockAuthedFetch.mock.calls[0][1].body)).toEqual({ query: 'budget' });
  });

  it('hides the section and logs when the call fails', async () => {
    mockAuthedFetch.mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useSimilarByMeaning('budget'));
    await settle();

    expect(result.current.questions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

describe('selectMeaningSuggestions', () => {
  it('drops text matches, selected questions and duplicates, keeping rank order', () => {
    const result = selectMeaningSuggestions(
      [make('t'), make('s'), make('x'), make('y'), make('x')],
      [make('t')],
      [make('s')]
    );

    expect(result.map((q) => q.statementId)).toEqual(['x', 'y']);
  });
});
