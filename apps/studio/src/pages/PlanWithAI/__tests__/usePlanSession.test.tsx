import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { StudioPlan, StudioPlanSession } from '@freedi/shared-types';

const studioPlanStart = vi.fn();
const studioPlanMessage = vi.fn();
const studioPlanBuild = vi.fn();
vi.mock('@/db/orgFunctions', () => ({
	studioPlanStart: (...args: unknown[]) => studioPlanStart(...args),
	studioPlanMessage: (...args: unknown[]) => studioPlanMessage(...args),
	studioPlanBuild: (...args: unknown[]) => studioPlanBuild(...args),
}));

let snapshot: { data: StudioPlanSession | null; loading: boolean; error: null } = {
	data: null,
	loading: false,
	error: null,
};
vi.mock('@/db/studioPlan', () => ({
	useStudioPlanSession: () => snapshot,
}));

// react-router in apps/studio/node_modules would load a second React copy
// under vitest, so `useSearchParams` is replaced by a React-state shim.
let initialSearch = '';
vi.mock('react-router-dom', async () => {
	const React = await import('react');
	type Next = URLSearchParams | ((prev: URLSearchParams) => URLSearchParams);

	return {
		useSearchParams: () => {
			const [params, setParams] = React.useState(() => new URLSearchParams(initialSearch));
			const set = (next: Next) =>
				setParams((prev) => (typeof next === 'function' ? next(prev) : new URLSearchParams(next)));

			return [params, set];
		},
	};
});

import { usePlanSession, type UsePlanSessionResult } from '../usePlanSession';

let latest: UsePlanSessionResult | null = null;

function Harness({ qId }: { qId?: string }) {
	latest = usePlanSession({ orgId: 'org-1', qId, enabled: true });

	return null;
}

function tree(qId?: string) {
	return (
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<Harness qId={qId} />
		</TranslationProvider>
	);
}

function renderHarness(search = '', strict = false, qId?: string) {
	initialSearch = search;

	return render(strict ? <React.StrictMode>{tree(qId)}</React.StrictMode> : tree(qId));
}

function planV(version: number, title = 'Ideas'): StudioPlan {
	return {
		mainQuestion: { title: `Q v${version}` },
		activities: [
			{ tempId: 'a1', type: 'crowdSurvey', title, order: 0, openNow: true, change: 'add' },
		],
		scheduledActions: [],
		summary: 'summary',
	};
}

function sessionDoc(overrides: Partial<StudioPlanSession> = {}): StudioPlanSession {
	return {
		sessionId: 's9',
		organizationId: 'org-1',
		organizationName: 'Org',
		createdBy: 'u1',
		language: 'en',
		uiLanguage: 'en',
		timezone: 'UTC',
		status: 'draft',
		messages: [{ role: 'assistant', content: 'Hello, what is the challenge?', createdAt: 1 }],
		planVersion: 0,
		readyToBuild: false,
		userTurns: 0,
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	};
}

describe('usePlanSession', () => {
	beforeEach(() => {
		latest = null;
		snapshot = { data: null, loading: false, error: null };
		studioPlanStart.mockReset();
		studioPlanMessage.mockReset();
		studioPlanBuild.mockReset();
	});
	afterEach(cleanup);

	it('starts exactly one session under StrictMode and writes ?session=', async () => {
		studioPlanStart.mockResolvedValue({
			sessionId: 's1',
			message: { role: 'assistant', content: 'Hi there', createdAt: 1 },
		});
		renderHarness('', true);

		expect(latest?.phase).toBe('starting');
		await waitFor(() => expect(latest?.sessionId).toBe('s1'));
		expect(studioPlanStart).toHaveBeenCalledTimes(1);
		expect(studioPlanStart).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: 'org-1', language: 'en' }),
		);
		expect(latest?.messages.map((m) => m.content)).toEqual(['Hi there']);
		expect(latest?.phase).toBe('chatting');
	});

	it('does not start when ?session= is present and reads the document', () => {
		snapshot = { data: sessionDoc(), loading: false, error: null };
		renderHarness('session=s9');

		expect(studioPlanStart).not.toHaveBeenCalled();
		expect(latest?.sessionId).toBe('s9');
		expect(latest?.phase).toBe('chatting');
		expect(latest?.messages).toHaveLength(1);
	});

	it('shows the user message optimistically, then the reply, plan and version', async () => {
		snapshot = { data: sessionDoc(), loading: false, error: null };
		let resolve: (value: unknown) => void = () => undefined;
		studioPlanMessage.mockImplementation(() => new Promise((r) => (resolve = r)));
		renderHarness('session=s9');

		act(() => void latest?.send('  We need a budget plan  '));
		expect(latest?.phase).toBe('waiting');
		expect(latest?.waitingSince).not.toBeNull();
		expect(latest?.messages.map((m) => m.content)).toEqual([
			'Hello, what is the challenge?',
			'We need a budget plan',
		]);

		await act(async () => {
			resolve({
				message: { role: 'assistant', content: 'Here is a plan', createdAt: 2 },
				plan: planV(1),
				planVersion: 1,
				readyToBuild: true,
				problems: [],
			});
		});
		expect(studioPlanMessage).toHaveBeenCalledWith({
			sessionId: 's9',
			message: 'We need a budget plan',
		});
		expect(latest?.phase).toBe('chatting');
		expect(latest?.messages).toHaveLength(3);
		expect(latest?.plan?.mainQuestion.title).toBe('Q v1');
		expect(latest?.planVersion).toBe(1);
		expect(latest?.readyToBuild).toBe(true);
	});

	it('drops the optimistic overlay once the snapshot contains the turn', async () => {
		snapshot = { data: sessionDoc(), loading: false, error: null };
		studioPlanMessage.mockResolvedValue({
			message: { role: 'assistant', content: 'Reply', createdAt: 2 },
			planVersion: 0,
			readyToBuild: false,
		});
		const { rerender } = renderHarness('session=s9');

		await act(async () => {
			await latest?.send('Hi');
		});
		expect(latest?.messages).toHaveLength(3);

		snapshot = {
			data: sessionDoc({
				messages: [
					{ role: 'assistant', content: 'Hello, what is the challenge?', createdAt: 1 },
					{ role: 'user', content: 'Hi', createdAt: 2 },
					{ role: 'assistant', content: 'Reply', createdAt: 3 },
				],
			}),
			loading: false,
			error: null,
		};
		rerender(tree());
		expect(latest?.messages).toHaveLength(3);
		expect(latest?.messages[2].createdAt).toBe(3);
	});

	it('keeps a failed message for retry and resends it', async () => {
		snapshot = { data: sessionDoc(), loading: false, error: null };
		studioPlanMessage.mockRejectedValueOnce({ code: 'functions/resource-exhausted' });
		renderHarness('session=s9');

		await act(async () => {
			await latest?.send('Again');
		});
		expect(latest?.failedMessage).toBe('Again');
		expect(latest?.error).toMatch(/limit/i);
		expect(latest?.messages.map((m) => m.content)).not.toContain('Again');
		expect(latest?.phase).toBe('chatting');

		studioPlanMessage.mockResolvedValueOnce({
			message: { role: 'assistant', content: 'Ok', createdAt: 5 },
			planVersion: 0,
			readyToBuild: false,
		});
		await act(async () => {
			await latest?.retry();
		});
		expect(studioPlanMessage).toHaveBeenLastCalledWith({ sessionId: 's9', message: 'Again' });
		expect(latest?.failedMessage).toBeNull();
	});

	it('reports changed rows when the snapshot plan moves to a new version', () => {
		snapshot = {
			data: sessionDoc({ planVersion: 1, currentPlan: planV(1) }),
			loading: false,
			error: null,
		};
		const { rerender } = renderHarness('session=s9');
		expect(latest?.changedTempIds).toEqual([]);

		snapshot = {
			data: sessionDoc({ planVersion: 2, currentPlan: planV(2, 'Ideas from residents') }),
			loading: false,
			error: null,
		};
		rerender(tree());
		expect(latest?.planVersion).toBe(2);
		expect(latest?.changedTempIds).toEqual(['a1']);
	});

	it('build → buildResult + builtHere; a failure surfaces buildError', async () => {
		snapshot = {
			data: sessionDoc({
				status: 'ready',
				readyToBuild: true,
				planVersion: 1,
				currentPlan: planV(1),
			}),
			loading: false,
			error: null,
		};
		studioPlanBuild.mockRejectedValueOnce(new Error('boom'));
		renderHarness('session=s9');

		await act(async () => {
			await latest?.build();
		});
		expect(latest?.buildError).toMatch(/could not build/i);
		expect(latest?.builtHere).toBe(false);

		studioPlanBuild.mockResolvedValueOnce({
			topQuestionId: 'q-new',
			activityIds: { a1: 'st-1' },
			surveyIds: [],
			scheduledActionIds: [],
		});
		await act(async () => {
			await latest?.build();
		});
		expect(studioPlanBuild).toHaveBeenCalledWith({ sessionId: 's9' });
		expect(latest?.buildResult?.topQuestionId).toBe('q-new');
		expect(latest?.builtHere).toBe(true);
		expect(latest?.phase).toBe('built');
	});

	it('surfaces a start failure as the error phase', async () => {
		studioPlanStart.mockRejectedValue({ code: 'functions/failed-precondition' });
		renderHarness();

		await waitFor(() => expect(latest?.phase).toBe('error'));
		expect(latest?.error).toMatch(/no longer be changed/i);
	});
});
