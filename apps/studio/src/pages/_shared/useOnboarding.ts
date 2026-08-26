import { useCallback, useEffect, useState } from 'react';
import { logError } from '@/utils/logError';

/**
 * First-run checklist state, per organization, in localStorage
 * (`studio-onboarding-${orgId}`). Steps: 1 = wrote the main question,
 * 2 = added an activity, 3 = opened it and shared the link.
 */
export const ONBOARDING_STEPS = 3;

export interface OnboardingState {
	step: number;
	dismissedAt: number | null;
}

export interface UseOnboardingResult {
	/** Highest completed step (0 = nothing yet). */
	step: number;
	/** Mark step `n` (1..3) done; never moves backwards. */
	markStep: (n: number) => void;
	dismiss: () => void;
	dismissed: boolean;
}

const EMPTY: OnboardingState = { step: 0, dismissedAt: null };

export function onboardingStorageKey(orgId: string): string {
	return `studio-onboarding-${orgId}`;
}

export function readOnboarding(orgId: string): OnboardingState {
	try {
		const raw = window.localStorage.getItem(onboardingStorageKey(orgId));
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw) as Partial<OnboardingState>;

		return {
			step: typeof parsed.step === 'number' ? parsed.step : 0,
			dismissedAt: typeof parsed.dismissedAt === 'number' ? parsed.dismissedAt : null,
		};
	} catch {
		return EMPTY;
	}
}

export function writeOnboarding(orgId: string, state: OnboardingState): void {
	try {
		window.localStorage.setItem(onboardingStorageKey(orgId), JSON.stringify(state));
	} catch (error) {
		logError(error, { operation: 'useOnboarding.write', organizationId: orgId });
	}
}

export function useOnboarding(orgId: string | null | undefined): UseOnboardingResult {
	const [state, setState] = useState<OnboardingState>(() =>
		orgId ? readOnboarding(orgId) : EMPTY,
	);

	useEffect(() => {
		setState(orgId ? readOnboarding(orgId) : EMPTY);
	}, [orgId]);

	const update = useCallback(
		(next: (prev: OnboardingState) => OnboardingState) => {
			setState((prev) => {
				const value = next(prev);
				if (orgId && value !== prev) writeOnboarding(orgId, value);

				return value;
			});
		},
		[orgId],
	);

	const markStep = useCallback(
		(n: number) => {
			const clamped = Math.min(ONBOARDING_STEPS, Math.max(0, Math.floor(n)));
			update((prev) => (clamped > prev.step ? { ...prev, step: clamped } : prev));
		},
		[update],
	);

	const dismiss = useCallback(() => {
		update((prev) => (prev.dismissedAt ? prev : { ...prev, dismissedAt: Date.now() }));
	}, [update]);

	return { step: state.step, markStep, dismiss, dismissed: state.dismissedAt !== null };
}
