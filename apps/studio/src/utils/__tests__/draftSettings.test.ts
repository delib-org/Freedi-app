import { describe, it, expect } from 'vitest';
import { ActivityType, DEFAULT_DRAFT_CUTOFF } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import {
	defaultDraftSettings,
	defaultDraftSources,
	describeCutoff,
	isCutoffValid,
} from '../draftSettings';

const t = (text: string) => text;
const tWithParams = (text: string, params: Record<string, string | number>) =>
	Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)), text);

function activity(overrides: Partial<DerivedActivity>): DerivedActivity {
	return {
		statementId: 'a',
		title: 'A',
		order: 0,
		type: ActivityType.massConsensus,
		runState: 'open',
		...overrides,
	} as DerivedActivity;
}

describe('describeCutoff', () => {
	it('describes the default as top 20 with 3 raters', () => {
		expect(describeCutoff(DEFAULT_DRAFT_CUTOFF, t, tWithParams)).toBe(
			'top 20 suggestions, at least 3 raters',
		);
	});

	it('describes chosen and threshold modes', () => {
		expect(describeCutoff({ mode: 'chosen' }, t, tWithParams)).toBe('top answers');
		expect(describeCutoff({ mode: 'threshold', minConsensus: 0.6 }, t, tWithParams)).toBe(
			'consensus ≥ 0.6',
		);
		expect(
			describeCutoff({ mode: 'threshold', minConsensus: 0.6, minEvaluators: 5 }, t, tWithParams),
		).toBe('consensus ≥ 0.6, at least 5 raters');
	});

	it('falls back to the default when no cutoff is given', () => {
		expect(describeCutoff(undefined, t, tWithParams)).toBe('top 20 suggestions, at least 3 raters');
	});
});

describe('defaultDraftSources', () => {
	const activities = [
		activity({ statementId: 'mc-open', type: ActivityType.massConsensus, runState: 'open' }),
		activity({ statementId: 'mc-closed', type: ActivityType.massConsensus, runState: 'closed' }),
		activity({ statementId: 'join-closed', type: ActivityType.join, runState: 'closed' }),
		activity({ statementId: 'q-closed', type: ActivityType.question, runState: 'closed' }),
		activity({ statementId: 'doc', type: ActivityType.signDocument, runState: 'queued' }),
	];

	it('picks the closed crowd surveys and live sessions, never documents or discussions', () => {
		expect(defaultDraftSources(activities, 'doc')).toEqual(['mc-closed', 'join-closed']);
	});

	it('falls back to every crowd survey / live session when none has closed', () => {
		const allOpen = activities.map((a) => ({ ...a, runState: 'open' as const }));
		expect(defaultDraftSources(allOpen, 'doc')).toEqual(['mc-open', 'mc-closed', 'join-closed']);
	});

	it('never lists the document itself', () => {
		const doc = activity({
			statementId: 'doc',
			type: ActivityType.massConsensus,
			runState: 'closed',
		});
		expect(defaultDraftSources([doc], 'doc')).toEqual([]);
	});

	it('builds default settings around the default cutoff', () => {
		const settings = defaultDraftSettings(activities, 'doc');
		expect(settings.cutoff).toEqual(DEFAULT_DRAFT_CUTOFF);
		expect(settings.cutoff).not.toBe(DEFAULT_DRAFT_CUTOFF);
		expect(settings.intent).toBe('');
	});
});

describe('isCutoffValid', () => {
	it('checks the numbers each mode needs', () => {
		expect(isCutoffValid({ mode: 'chosen' })).toBe(true);
		expect(isCutoffValid({ mode: 'topN', n: 10 })).toBe(true);
		expect(isCutoffValid({ mode: 'topN' })).toBe(false);
		expect(isCutoffValid({ mode: 'topN', n: 0 })).toBe(false);
		expect(isCutoffValid({ mode: 'threshold', minConsensus: 0.5 })).toBe(true);
		expect(isCutoffValid({ mode: 'threshold', minConsensus: 1.5 })).toBe(false);
		expect(isCutoffValid({ mode: 'threshold' })).toBe(false);
	});
});
