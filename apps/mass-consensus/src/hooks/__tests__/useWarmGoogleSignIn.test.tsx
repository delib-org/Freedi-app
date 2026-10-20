/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { warmGoogleSignIn } from '@/lib/firebase/client';
import { useWarmGoogleSignIn } from '../useWarmGoogleSignIn';

jest.mock('@/lib/firebase/client', () => ({
  warmGoogleSignIn: jest.fn().mockResolvedValue(undefined),
}));

const mockWarm = warmGoogleSignIn as jest.MockedFunction<typeof warmGoogleSignIn>;

describe('useWarmGoogleSignIn', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWarm.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('warms sign-in after the page settles, not during render', () => {
    renderHook(() => useWarmGoogleSignIn());
    expect(mockWarm).not.toHaveBeenCalled();

    jest.runAllTimers();

    expect(mockWarm).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    renderHook(() => useWarmGoogleSignIn(false));
    jest.runAllTimers();

    expect(mockWarm).not.toHaveBeenCalled();
  });

  it('cancels the warm-up when the screen unmounts first', () => {
    const { unmount } = renderHook(() => useWarmGoogleSignIn());
    unmount();
    jest.runAllTimers();

    expect(mockWarm).not.toHaveBeenCalled();
  });
});
