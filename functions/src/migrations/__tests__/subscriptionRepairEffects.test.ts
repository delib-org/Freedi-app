import { isTopLevelSubscription, Role, StatementType } from '@freedi/shared-types';
import { NON_DOCUMENT_STATEMENT_TYPES } from '../../../../src/helpers/statementTypeHelpers';
import { feedRelevantChange } from '../../userFeed/userFeedMembership';
import {
	emptyEffectTally,
	formatEffectLines,
	isStatementType,
	isTopLevelDoc,
	MEMBERS_EXCLUDED_TYPES,
	membersFieldsAfter,
	membersOutcome,
	newlyVisibleOn,
	recordEffects,
	wouldJoinHomeListener,
} from '../subscriptionRepairEffects';
import type { RepairCandidate } from '../subscriptionRepairPlan';

const host = (parentId: string, statementType?: StatementType): RepairCandidate => ({
	userId: 'u1',
	statementId: 's1',
	role: Role.admin,
	createdAt: 5,
	statement: { parentId, statementType },
});

const onlyType = (statementType: StatementType) => ({ statementType });

describe('MEMBERS_EXCLUDED_TYPES', () => {
	it('mirrors what the client keeps out of the Members query', () => {
		const excludedByClient = Object.values(StatementType).filter(
			(type) => !NON_DOCUMENT_STATEMENT_TYPES.includes(type),
		);

		expect([...MEMBERS_EXCLUDED_TYPES].sort()).toEqual(excludedByClient.sort());
	});
});

describe('isStatementType', () => {
	it('accepts the enum and nothing else', () => {
		expect(isStatementType('question')).toBe(true);
		expect(isStatementType('nope')).toBe(false);
		expect(isStatementType(undefined)).toBe(false);
	});
});

describe('isTopLevelDoc', () => {
	it('reads the own field first, as Home does', () => {
		expect(isTopLevelDoc({ parentId: 'top', statement: { parentId: 'x' } })).toBe(true);
		expect(isTopLevelDoc({ parentId: 'x', statement: { parentId: 'top' } })).toBe(false);
	});

	it('falls back to the embedded copy', () => {
		expect(isTopLevelDoc({ statement: { parentId: 'top' } })).toBe(true);
		expect(isTopLevelDoc({ statement: { parentId: 'x' } })).toBe(false);
		expect(isTopLevelDoc({})).toBe(false);
	});
});

describe('wouldJoinHomeListener', () => {
	it('is true for a listed type on an admin or a creator', () => {
		const patch = onlyType(StatementType.question);

		expect(wouldJoinHomeListener(host('x'), patch)).toBe(true);
		expect(wouldJoinHomeListener({ ...host('x'), role: Role.creator }, patch)).toBe(true);
	});

	it('is false for the legacy role string the listener does not ask for', () => {
		expect(
			wouldJoinHomeListener({ ...host('x'), role: 'creator' }, onlyType(StatementType.question)),
		).toBe(false);
	});

	it('is false when no type is written, or a type the filter refuses', () => {
		expect(wouldJoinHomeListener(host('x'), {})).toBe(false);
		expect(wouldJoinHomeListener(host('x'), onlyType(StatementType.document))).toBe(false);
		expect(wouldJoinHomeListener(host('x'), onlyType(StatementType.agreement))).toBe(false);
	});
});

describe('newlyVisibleOn', () => {
	const on = (data: RepairCandidate, type: StatementType, hasFeedEntry = false) =>
		newlyVisibleOn({ data, patch: onlyType(type), hasFeedEntry });

	it('puts a nested question on Home, Members and the count, not on the side lists', () => {
		expect(on(host('parent'), StatementType.question).sort()).toEqual([
			'homeQuestions',
			'memberCount',
			'membersList',
		]);
	});

	it('leaves a top-level space with a feed entry off the Home surfaces', () => {
		expect(on(host('top'), StatementType.group, true).sort()).toEqual([
			'memberCount',
			'membersList',
		]);
	});

	it('puts a top-level space with no feed entry on every Home surface', () => {
		expect(on(host('top'), StatementType.group).sort()).toEqual([
			'askSpacePicker',
			'homeSpaces',
			'memberCount',
			'membersList',
			'sideMenu',
		]);
	});

	it('gives a nested group no row anywhere on Home', () => {
		expect(on(host('parent'), StatementType.group).sort()).toEqual([
			'homeNoRow',
			'memberCount',
			'membersList',
		]);
	});

	it('puts a top-level question with no feed entry on the side menu and Questions', () => {
		const surfaces = on(host('top'), StatementType.question);

		expect(surfaces).toContain('sideMenu');
		expect(surfaces).toContain('homeQuestions');
		expect(surfaces).not.toContain('askSpacePicker');
	});

	it('counts a nested option as delivered with no row', () => {
		expect(on(host('parent'), StatementType.option)).toContain('homeNoRow');
	});

	it('keeps a document admin out of Members, the count and Home', () => {
		expect(on(host('top'), StatementType.document)).toEqual([]);
	});

	it('keeps an agreement out of Members and Home, but the count takes it', () => {
		expect(on(host('parent'), StatementType.agreement)).toEqual(['memberCount']);
	});

	it('keeps an isDocument subscription off the Home lists', () => {
		const surfaces = on({ ...host('top'), isDocument: true }, StatementType.question);

		expect(surfaces).not.toContain('homeQuestions');
	});

	it('needs a date to list: type alone is not enough', () => {
		const data = { ...host('parent'), createdAt: undefined };

		expect(on(data, StatementType.question)).not.toContain('membersList');
	});

	it('counts a doc that only lacked a date as newly listed, with no Home effect', () => {
		const data = { ...host('parent'), createdAt: undefined, statementType: 'question' };

		expect(newlyVisibleOn({ data, patch: { createdAt: 7 }, hasFeedEntry: false })).toEqual([
			'membersList',
		]);
	});

	it('finds nothing new on a doc already listed', () => {
		const data = { ...host('parent'), statementType: 'question' };

		expect(newlyVisibleOn({ data, patch: {}, hasFeedEntry: false })).toEqual([]);
	});
});

describe('membersFieldsAfter', () => {
	it('prefers what the doc holds', () => {
		expect(
			membersFieldsAfter(
				{ statementType: 'group', createdAt: 1 },
				{ statementType: StatementType.question, createdAt: 2 },
			),
		).toEqual({ statementType: 'group', createdAt: 1 });
	});

	it('takes the patch where the doc lacks the field', () => {
		expect(
			membersFieldsAfter(
				{ statementType: '' },
				{ statementType: StatementType.group, createdAt: 2 },
			),
		).toEqual({ statementType: StatementType.group, createdAt: 2 });
	});

	it('keeps a null createdAt: it is present, so it is left alone', () => {
		expect(membersFieldsAfter({ createdAt: null }, {}).createdAt).toBeNull();
	});
});

describe('membersOutcome', () => {
	const typeHeldBack = false;

	it('lists a doc with a listed type and a date', () => {
		expect(membersOutcome({ statementType: 'question', createdAt: 1, typeHeldBack })).toBe(
			'listed',
		);
	});

	it.each(['document', 'agreement'])('keeps %s out on purpose', (statementType) => {
		expect(membersOutcome({ statementType, createdAt: 1, typeHeldBack })).toBe('byType');
	});

	it('names each reason a doc stays hidden', () => {
		expect(membersOutcome({ statementType: undefined, createdAt: 1, typeHeldBack })).toBe('noType');
		expect(membersOutcome({ statementType: 'nope', createdAt: 1, typeHeldBack })).toBe('noType');
		expect(membersOutcome({ statementType: 'group', createdAt: undefined, typeHeldBack })).toBe(
			'noDate',
		);
		expect(membersOutcome({ statementType: 'group', createdAt: 1, typeHeldBack: true })).toBe(
			'typeHeldBack',
		);
	});
});

describe('the repair and the feed', () => {
	const before = {
		userId: 'u1',
		statementId: 's1',
		role: Role.admin,
		statement: { parentId: 'x' },
	};
	const after = { ...before, statementType: StatementType.question, createdAt: 5 };

	it('does not count as a feed change: role and top-level test stay as they were', () => {
		expect(feedRelevantChange(before, after)).toBe(false);
		expect(isTopLevelSubscription(after)).toBe(isTopLevelSubscription(before));
	});

	it('is why parentId stays out: on a stale embedded copy it would flip the test', () => {
		expect(feedRelevantChange(before, { ...after, parentId: 'top' })).toBe(true);
	});
});

describe('formatEffectLines', () => {
	it('counts distinct users and statements, and never prints an id', () => {
		const tally = emptyEffectTally();
		recordEffects(tally, ['homeQuestions', 'memberCount'], 'secret-uid', 's1');
		recordEffects(tally, ['homeQuestions', 'memberCount'], 'secret-uid', 's2');
		recordEffects(tally, ['membersList'], 'other-uid', 's2');
		tally.alreadyOnHome = 3;

		const text = formatEffectLines(tally, true).join('\n');

		expect(text).toContain('Home, Questions list: 2 doc(s), 1 user(s).');
		expect(text).toContain('+2 across 2 statement(s)');
		expect(text).toContain('Newly listed in Members: 1 doc(s) in 1 statement(s).');
		expect(text).toContain('Already on Home through userFeed, no new row: 3 doc(s).');
		expect(text).toContain('would appear');
		expect(text).not.toContain('secret-uid');
	});

	it('says appeared on a write run', () => {
		expect(formatEffectLines(emptyEffectTally(), false).join('\n')).toContain('appeared');
	});
});
