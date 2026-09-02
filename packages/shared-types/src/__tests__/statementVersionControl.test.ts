// src/setupTests.ts replaces valibot with a stub whose parse/safeParse are
// identity functions that always succeed — useful for tests that only build
// schemas, useless for tests that assert what a schema accepts. Opt out so
// these run against the real validator.
jest.unmock('valibot');

import { parse, safeParse } from 'valibot';
import { StatementSchema } from '../models/statement/StatementTypes';
import { StatementType } from '../models/TypeEnums';

/**
 * Regression tests for the versionControl schema.
 *
 * Several writers set a single sub-field via a dotted Firestore path
 * ('versionControl.finalized', 'versionControl.forVersion', …). On a document
 * that has no versionControl, that update *creates* the object without
 * currentVersion. Until currentVersion was given a default, every later read of
 * such a document threw ValiError and took the whole mind-map render with it.
 */

/** Minimal statement that satisfies every required field of StatementSchema. */
function baseStatement(overrides: Record<string, unknown> = {}) {
	return {
		statement: 'A paragraph that has been through the version machinery',
		statementId: 'st_versioncontrol_1',
		parentId: 'st_parent_1',
		topParentId: 'st_top_1',
		creatorId: 'user_1',
		creator: {
			uid: 'user_1',
			displayName: 'Test User',
		},
		statementType: StatementType.statement,
		createdAt: 1_756_000_000_000,
		lastUpdate: 1_756_000_000_000,
		consensus: 0,
		...overrides,
	};
}

describe('StatementSchema.versionControl', () => {
	it('parses a document with no versionControl at all', () => {
		const result = safeParse(StatementSchema, baseStatement());

		expect(result.success).toBe(true);
	});

	it('defaults currentVersion to 1 when a dotted-path write created the object without it', () => {
		// Exactly what finalizeSuggestion's "mark suggestion finalized" update
		// produced on a suggestion that had never been versioned.
		const legacy = baseStatement({
			versionControl: {
				finalized: true,
				finalizedAt: 1_756_000_000_000,
				finalizedBy: 'user_1',
			},
		});

		const parsed = parse(StatementSchema, legacy);

		expect(parsed.versionControl?.currentVersion).toBe(1);
		expect(parsed.versionControl?.finalized).toBe(true);
	});

	it('defaults currentVersion for a suggestion marked only with forVersion', () => {
		const legacy = baseStatement({
			versionControl: { forVersion: 3 },
		});

		const parsed = parse(StatementSchema, legacy);

		expect(parsed.versionControl?.currentVersion).toBe(1);
		expect(parsed.versionControl?.forVersion).toBe(3);
	});

	it('defaults currentVersion for a suggestion marked only as promoted', () => {
		const legacy = baseStatement({
			versionControl: { promotedToVersion: 4, promotedAt: 1_756_000_000_000 },
		});

		const parsed = parse(StatementSchema, legacy);

		expect(parsed.versionControl?.currentVersion).toBe(1);
		expect(parsed.versionControl?.promotedToVersion).toBe(4);
	});

	it('preserves an explicit currentVersion rather than overwriting it with the default', () => {
		const parsed = parse(
			StatementSchema,
			baseStatement({ versionControl: { currentVersion: 7 } }),
		);

		expect(parsed.versionControl?.currentVersion).toBe(7);
	});

	it('still rejects a currentVersion of the wrong type', () => {
		const result = safeParse(
			StatementSchema,
			baseStatement({ versionControl: { currentVersion: 'two' } }),
		);

		expect(result.success).toBe(false);
	});
});
