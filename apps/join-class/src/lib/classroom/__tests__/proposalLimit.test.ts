import { describe, expect, it } from 'vitest';
import { mayAddProposal, proposalLimitOf, type Statement } from '@freedi/shared-types';
import {
	otherOwnProposals,
	proposalDraftScope,
	showsOwnProposalList,
	writeTargetOf,
} from '../proposalLimit';

const proposal = (id: string): Statement => ({ statementId: id }) as Statement;
const newest = proposal('newest');
const older = proposal('older');

describe('proposalLimitOf', () => {
	it('is one unless the teacher chose unlimited', () => {
		expect(proposalLimitOf(undefined)).toBe('one');
		expect(proposalLimitOf({ statementSettings: {} })).toBe('one');
		expect(proposalLimitOf({ statementSettings: { proposalLimit: 'unlimited' } })).toBe(
			'unlimited',
		);
	});
});

describe('mayAddProposal', () => {
	it('one: only while holding none. Unlimited: always', () => {
		expect(mayAddProposal('one', 0)).toBe(true);
		expect(mayAddProposal('one', 1)).toBe(false);
		expect(mayAddProposal('unlimited', 7)).toBe(true);
	});
});

describe('writeTargetOf', () => {
	it('one, holding none: writes a new proposal', () => {
		expect(writeTargetOf({ limit: 'one', mine: [], editId: null, hasNewDraft: true })).toEqual({
			kind: 'new',
		});
	});

	it('one, holding one and no new draft: the box edits it, as it always did', () => {
		expect(
			writeTargetOf({ limit: 'one', mine: [newest], editId: null, hasNewDraft: false }),
		).toEqual({ kind: 'edit', proposal: newest });
	});

	it('limit lowered mid-draft: the draft is blocked, never sent as an edit of something else', () => {
		expect(
			writeTargetOf({ limit: 'one', mine: [newest], editId: null, hasNewDraft: true }),
		).toEqual({ kind: 'blocked' });
	});

	it('unlimited: the box is a new proposal, whatever the student already holds', () => {
		expect(
			writeTargetOf({
				limit: 'unlimited',
				mine: [newest, older],
				editId: null,
				hasNewDraft: false,
			}),
		).toEqual({ kind: 'new' });
	});

	it('a chosen proposal wins, also while a blocked draft waits', () => {
		expect(
			writeTargetOf({ limit: 'one', mine: [newest, older], editId: 'older', hasNewDraft: true }),
		).toEqual({ kind: 'edit', proposal: older });
		expect(
			writeTargetOf({ limit: 'unlimited', mine: [newest], editId: 'newest', hasNewDraft: false }),
		).toEqual({ kind: 'edit', proposal: newest });
	});

	it('a chosen proposal that is gone falls back to the limit', () => {
		expect(
			writeTargetOf({ limit: 'unlimited', mine: [newest], editId: 'gone', hasNewDraft: false }),
		).toEqual({ kind: 'new' });
	});
});

describe('proposalDraftScope', () => {
	it('keeps a new proposal and each edit in drafts of their own', () => {
		expect(proposalDraftScope('m', { kind: 'new' })).toBe('m');
		expect(proposalDraftScope('m', { kind: 'blocked' })).toBe('m');
		expect(proposalDraftScope('m', { kind: 'edit', proposal: older })).toBe('m:older');
	});
});

describe('the list beside the box', () => {
	it('never repeats the proposal in the box', () => {
		expect(otherOwnProposals([newest, older], { kind: 'edit', proposal: newest })).toEqual([older]);
		expect(otherOwnProposals([newest, older], { kind: 'new' })).toEqual([newest, older]);
	});

	it('is hidden only for one author with one proposal under the one limit', () => {
		const edit = { kind: 'edit', proposal: newest } as const;
		expect(showsOwnProposalList('one', [newest], edit)).toBe(false);
		expect(showsOwnProposalList('one', [newest, older], edit)).toBe(true);
		expect(showsOwnProposalList('one', [newest], { kind: 'blocked' })).toBe(true);
		expect(showsOwnProposalList('unlimited', [], { kind: 'new' })).toBe(false);
		expect(showsOwnProposalList('unlimited', [newest], { kind: 'new' })).toBe(true);
	});
});
