import { HttpsError } from 'firebase-functions/v2/https';
import type {
	Statement,
	ThemeRebuildApplyResponse,
	ThemeRebuildPreviewResponse,
} from '@freedi/shared-types';

/**
 * The callable's flow: input checks, admin gate, in-flight and lease refusals,
 * preview → stored proposal → apply with late arrivals going to Other.
 */

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../utils/errorHandling', () => ({ logError: jest.fn() }));

const QUESTION = { statementId: 'q1', statement: 'How?' } as Statement;
const assertSynthesisAdmin = jest.fn();
jest.mock('../../admin/assertSynthesisAdmin', () => ({
	assertSynthesisAdmin: (...args: unknown[]) => assertSynthesisAdmin(...args),
}));
jest.mock('../../liveSynth/auditLog', () => ({ recordLiveSynthEvent: jest.fn() }));

const proposals = new Map<string, Record<string, unknown>>();
const store = {
	isSynthesisRunInFlight: jest.fn(),
	acquireLease: jest.fn(),
	releaseLease: jest.fn(),
};
jest.mock('../rebuildStore', () => ({
	isSynthesisRunInFlight: (...a: unknown[]) => store.isSynthesisRunInFlight(...a),
	acquireLease: (...a: unknown[]) => store.acquireLease(...a),
	releaseLease: (...a: unknown[]) => store.releaseLease(...a),
	saveProposal: async (p: { runId: string }) => {
		proposals.set(p.runId, { ...p });
	},
	loadProposal: async (_q: string, runId: string) => proposals.get(runId) ?? null,
	markProposalApplied: async (_q: string, runId: string) => {
		proposals.set(runId, { ...proposals.get(runId), appliedAt: 1 });
	},
}));

const collectAtoms = jest.fn();
jest.mock('../collectAtoms', () => ({
	collectAtoms: (...a: unknown[]) => collectAtoms(...a),
}));
jest.mock('../discoverThemes', () => ({
	discoverThemes: async () => [
		{ key: 't1', name: 'Funding', rule: 'money' },
		{ key: 't2', name: 'Schools', rule: 'education' },
		{ key: 't3', name: 'Unused', rule: 'nothing' },
	],
}));
jest.mock('../assignAtoms', () => ({
	assignAtoms: async () => ({
		assignments: new Map([
			['a', 't1'],
			['b', 't1'],
			['c', 't2'],
			['d', 'NONE'],
		]),
		unanswered: 0,
	}),
}));
const applyRebuild = jest.fn();
jest.mock('../applyRebuild', () => ({
	applyRebuild: (...a: unknown[]) => applyRebuild(...a),
}));

import { handleRebuildThemes } from '../rebuildThemes';
import { PROPOSAL_TTL_MS } from '../constants';

const atom = (id: string) => ({ id, title: `title ${id}`, text: id, isSynth: false });
const oldTheme = (id: string, members: string[]): Statement =>
	({ statementId: id, integratedOptions: members, isCluster: true }) as unknown as Statement;

async function expectHttpsError(promise: Promise<unknown>, code: string, reason?: string) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(HttpsError);
	expect((error as HttpsError).code).toBe(code);
	if (reason) expect((error as HttpsError).details).toEqual({ reason });
}

beforeEach(() => {
	jest.clearAllMocks();
	proposals.clear();
	assertSynthesisAdmin.mockResolvedValue(QUESTION);
	store.isSynthesisRunInFlight.mockResolvedValue(false);
	store.acquireLease.mockResolvedValue(true);
	collectAtoms.mockResolvedValue({
		atoms: ['a', 'b', 'c', 'd'].map(atom),
		liveThemes: [oldTheme('old1', ['a', 'b', 'x'])],
	});
	applyRebuild.mockImplementation(async ({ match }) => ({
		themesWritten: match.themes.length,
		themesHidden: match.hidden.length,
		atomsPlaced: match.themes.reduce(
			(n: number, t: { memberIds: string[] }) => n + t.memberIds.length,
			0,
		),
	}));
});

describe('input and gates', () => {
	it('refuses an unauthenticated caller', async () => {
		await expectHttpsError(
			handleRebuildThemes(undefined, { questionId: 'q1', mode: 'preview' }),
			'unauthenticated',
		);
	});

	it('rejects a bad mode and an apply without runId', async () => {
		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'go' }),
			'invalid-argument',
		);
		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'apply' }),
			'invalid-argument',
		);
		await expectHttpsError(handleRebuildThemes('u1', { mode: 'preview' }), 'invalid-argument');
	});

	it('passes through the admin gate refusal', async () => {
		assertSynthesisAdmin.mockRejectedValue(new HttpsError('permission-denied', 'no'));

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'preview' }),
			'permission-denied',
		);
		expect(store.acquireLease).not.toHaveBeenCalled();
	});

	it('refuses with already-exists while a synthesis run is in flight', async () => {
		store.isSynthesisRunInFlight.mockResolvedValue(true);

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'preview' }),
			'already-exists',
		);
		expect(store.acquireLease).not.toHaveBeenCalled();
	});

	it('refuses with already-exists when another rebuild holds the lease', async () => {
		store.acquireLease.mockResolvedValue(false);

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'preview' }),
			'already-exists',
		);
		expect(collectAtoms).not.toHaveBeenCalled();
	});

	it('refuses no-atoms and still releases the lease', async () => {
		collectAtoms.mockResolvedValue({ atoms: [], liveThemes: [] });

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'preview' }),
			'failed-precondition',
			'no-atoms',
		);
		expect(store.releaseLease).toHaveBeenCalledWith('q1', store.acquireLease.mock.calls[0][1]);
	});

	it('wraps an unexpected failure as internal', async () => {
		collectAtoms.mockRejectedValue(new Error('firestore down'));

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'preview' }),
			'internal',
		);
		expect(store.releaseLease).toHaveBeenCalled();
	});
});

describe('preview → apply', () => {
	it('preview returns non-empty themes with counts, samples, reuse and the Other count', async () => {
		const preview = (await handleRebuildThemes('u1', {
			questionId: 'q1',
			mode: 'preview',
		})) as ThemeRebuildPreviewResponse;

		expect(preview.atomCount).toBe(4);
		expect(preview.otherCount).toBe(1);
		expect(preview.themes).toEqual([
			{
				key: 't1',
				name: 'Funding',
				rule: 'money',
				memberCount: 2,
				sampleTitles: ['title a', 'title b'],
				reusesThemeId: 'old1',
			},
			{ key: 't2', name: 'Schools', rule: 'education', memberCount: 1, sampleTitles: ['title c'] },
		]);
		const stored = proposals.get(preview.runId);
		expect(stored).toEqual(
			expect.objectContaining({ atomIds: ['a', 'b', 'c', 'd'], otherIds: ['d'], createdBy: 'u1' }),
		);
		expect(applyRebuild).not.toHaveBeenCalled();
	});

	it('apply writes the stored proposal and sends late arrivals to Other', async () => {
		const preview = (await handleRebuildThemes('u1', {
			questionId: 'q1',
			mode: 'preview',
		})) as ThemeRebuildPreviewResponse;
		collectAtoms.mockResolvedValue({
			atoms: ['a', 'b', 'c', 'd', 'late'].map(atom),
			liveThemes: [oldTheme('old1', ['a', 'b', 'x'])],
		});

		const applied = (await handleRebuildThemes('u1', {
			questionId: 'q1',
			mode: 'apply',
			runId: preview.runId,
		})) as ThemeRebuildApplyResponse;

		expect(applied).toEqual({
			runId: preview.runId,
			themesWritten: 2,
			themesHidden: 0,
			atomsPlaced: 3,
			atomsToOther: 2,
			lateArrivalsToOther: 1,
		});
		const { match } = applyRebuild.mock.calls[0][0];
		expect(match.themes.flatMap((t: { memberIds: string[] }) => t.memberIds)).not.toContain('late');
		expect(proposals.get(preview.runId)?.appliedAt).toBeDefined();
	});

	it('apply refuses an unknown runId', async () => {
		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'apply', runId: 'nope' }),
			'failed-precondition',
			'proposal-not-found',
		);
	});

	it('apply refuses an expired proposal', async () => {
		const preview = (await handleRebuildThemes('u1', {
			questionId: 'q1',
			mode: 'preview',
		})) as ThemeRebuildPreviewResponse;
		const stored = proposals.get(preview.runId) ?? {};
		proposals.set(preview.runId, { ...stored, expiresAt: Date.now() - 1 });

		await expectHttpsError(
			handleRebuildThemes('u1', { questionId: 'q1', mode: 'apply', runId: preview.runId }),
			'failed-precondition',
			'proposal-expired',
		);
		expect(applyRebuild).not.toHaveBeenCalled();
		expect(PROPOSAL_TTL_MS).toBe(24 * 60 * 60 * 1000);
	});
});
