/**
 * STAGE 1 NOTE (private-level reads, `accessScope`): this file tests the NEW
 * firestore.rules from `fix/private-statement-reads`, which are NOT on dev yet.
 * Stage 1 shipped the stamping, the backfill, the indexes and the clients but
 * kept dev's old rules, so these assertions fail against the rules on dev.
 * That is why the file is named `*.next.mjs` and lives in `next-rules/`:
 * `npm run test:rules` (node --test) does not pick it up.
 *
 * The rules ship LAST, after Tal's separate yes, from `fix/private-statement-reads`
 * rebased onto dev at that time. See docs/security/access-scope-release.md,
 * "Stage 2: the rules". Shipping them reverts the stage-1 commit that restored
 * dev's rules, which moves this file back to `tests/rules/*.test.mjs`.
 * Run it against the new rules only: `npm run test:rules:next`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	and,
	collection,
	doc,
	documentId,
	getCountFromServer,
	getDoc,
	getDocs,
	limit,
	or,
	orderBy,
	query,
	setDoc,
	startAt,
	updateDoc,
	where,
} from 'firebase/firestore';
import { statementDoc, seed } from '../helpers.mjs';
import {
	ADMIN,
	ANONYMOUS,
	BANNED,
	CREATOR,
	HOST,
	MEMBER,
	OUTSIDER,
	PEOPLE,
	SCANS,
	SHAPES,
	SIGNED_OUT,
	SPACES,
	UNSCOPED,
	WAITING,
	inScopes,
	labelOf,
	mayEnter,
	typeIsQuestionOrOption,
	useWorld,
} from './privateReadsWorld.mjs';

describe('listing /statements', () => {
	const { world, contextOf, statementsAs, subscribe } = useWorld('private-statement-reads');

	for (const [spaceName, space] of Object.entries(SPACES)) {
		describe(spaceName, () => {
			for (const uid of PEOPLE) {
				describe(labelOf(uid), () => {
					const allowed = space.scope === 'open' || mayEnter(uid);
					for (const [shape, build] of Object.entries(SHAPES)) {
						it(`${allowed ? 'allows' : 'denies'} ${shape}`, async () => {
							const q = build(statementsAs(uid), space);
							await (allowed ? assertSucceeds(getDocs(q)) : assertFails(getDocs(q)));
						});
					}

					it('can always ask for open content alone, and gets nothing restricted', async () => {
						const q = query(
							statementsAs(uid),
							where('parents', 'array-contains', space.parent),
							where('accessScope', '==', 'open'),
						);
						const snapshot = await assertSucceeds(getDocs(q));
						assert.equal(snapshot.size, space.scope === 'open' ? 1 : 0);
					});
				});
			}
		});
	}

	describe('old shapes with no scope', () => {
		const SPACE = SPACES['private group'];

		for (const uid of [MEMBER, BANNED, WAITING, OUTSIDER, ANONYMOUS, SIGNED_OUT]) {
			for (const [shape, build] of Object.entries(UNSCOPED)) {
				it(`denies ${shape} for ${labelOf(uid)}`, async () => {
					await assertFails(getDocs(build(statementsAs(uid), SPACE)));
				});
			}
		}

		it('even for an open space: a private child could be in the result', async () => {
			await assertFails(getDocs(UNSCOPED['parentId only'](statementsAs(OUTSIDER), SPACES['no setting anywhere'])));
		});
	});

	describe('scans', () => {
		for (const uid of [OUTSIDER, MEMBER, ANONYMOUS, SIGNED_OUT]) {
			for (const [name, build] of Object.entries(SCANS)) {
				it(`denies ${name} for ${labelOf(uid)}`, async () => {
					await assertFails(getDocs(build(statementsAs(uid))));
				});
			}
		}

		it('denies naming a scope the caller is not in, inside an open-looking query', async () => {
			await assertFails(
				getDocs(query(statementsAs(OUTSIDER), where('parentId', '==', 'pio-top'), where('accessScope', 'in', ['open', 'pg']))),
			);
		});

		it('denies a count over a private scope', async () => {
			await assertFails(getCountFromServer(query(statementsAs(OUTSIDER), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('denies a leaf list under a parent that does not exist', async () => {
			await assertFails(getDocs(query(statementsAs(OUTSIDER), where('parentId', '==', 'nothing-here'), where('statementType', '==', 'option'))));
		});
	});

	describe('a direct landing on a closed level', () => {
		// The client gate needs the document to tell closed from gone. Were this
		// refused, ProtectedLayout would take the read failure for a deletion.
		for (const uid of [OUTSIDER, BANNED, WAITING, ANONYMOUS, SIGNED_OUT]) {
			it(`still lets ${labelOf(uid)} read the one document`, async () => {
				await assertSucceeds(getDoc(doc(contextOf(uid).firestore(), 'statements', 'pg-q')));
			});
		}
	});
});
