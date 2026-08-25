import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
	onboardingStorageKey,
	readOnboarding,
	useOnboarding,
	writeOnboarding,
} from '../useOnboarding';

describe('useOnboarding', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('starts at step 0, not dismissed, when nothing is stored', () => {
		const { result } = renderHook(() => useOnboarding('org-1'));
		expect(result.current.step).toBe(0);
		expect(result.current.dismissed).toBe(false);
	});

	it('persists markStep under the org-scoped key and never moves backwards', () => {
		const { result } = renderHook(() => useOnboarding('org-1'));
		act(() => result.current.markStep(2));
		expect(result.current.step).toBe(2);
		act(() => result.current.markStep(1));
		expect(result.current.step).toBe(2);

		const stored = JSON.parse(window.localStorage.getItem(onboardingStorageKey('org-1')) ?? '{}');
		expect(stored.step).toBe(2);
		expect(stored.dismissedAt).toBeNull();
	});

	it('clamps steps to the 0..3 range', () => {
		const { result } = renderHook(() => useOnboarding('org-1'));
		act(() => result.current.markStep(9));
		expect(result.current.step).toBe(3);
	});

	it('dismiss records a timestamp once', () => {
		const { result } = renderHook(() => useOnboarding('org-1'));
		act(() => result.current.dismiss());
		expect(result.current.dismissed).toBe(true);
		const first = readOnboarding('org-1').dismissedAt;
		act(() => result.current.dismiss());
		expect(readOnboarding('org-1').dismissedAt).toBe(first);
	});

	it('reloads state when the org changes', () => {
		writeOnboarding('org-2', { step: 3, dismissedAt: 123 });
		const { result, rerender } = renderHook(({ orgId }) => useOnboarding(orgId), {
			initialProps: { orgId: 'org-1' },
		});
		expect(result.current.step).toBe(0);
		rerender({ orgId: 'org-2' });
		expect(result.current.step).toBe(3);
		expect(result.current.dismissed).toBe(true);
	});

	it('tolerates corrupt storage', () => {
		window.localStorage.setItem(onboardingStorageKey('org-1'), '{not json');
		expect(readOnboarding('org-1')).toEqual({ step: 0, dismissedAt: null });
	});
});
