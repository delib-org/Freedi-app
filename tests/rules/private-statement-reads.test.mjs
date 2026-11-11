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
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * A list rule cannot look at results, only at what a query filters on. Each
 * shape below is a real client query, run against each kind of space for each
 * kind of person. `accessScope` values are what resolveAccessScope stamps.
 */
const MEMBER = 'member';
const HOST = 'ancestor-host';
const BANNED = 'banned';
const WAITING = 'waiting';
const OUTSIDER = 'outsider';
const ANONYMOUS = 'anonymous';
const SIGNED_OUT = null;
const ADMIN = 'system-admin';
const CREATOR = 'creator-person';

const SPACES = {
	'private group': {
		ancestor: 'pg-root',
		top: 'pg-root',
		level: 'pg',
		parent: 'pg-q',
		answer: 'pg-a',
		scope: 'pg',
		levels: {
			'pg-root': { parentId: 'top', topParentId: 'pg-root', parents: [], accessScope: 'open', membership: { access: 'openToAll' } },
			pg: { parentId: 'pg-root', topParentId: 'pg-root', parents: ['pg-root'], accessScope: 'pg', membership: { access: 'secret' } },
			'pg-q': { parentId: 'pg', topParentId: 'pg-root', parents: ['pg-root', 'pg'], accessScope: 'pg', statementType: 'question' },
		},
		answerFields: { parentId: 'pg-q', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'pg-q'], accessScope: 'pg' },
	},
	'public question in a private group': {
		ancestor: 'pip-top',
		top: 'pip-top',
		level: 'pip-top',
		parent: 'pip-q',
		answer: 'pip-a',
		scope: 'open',
		levels: {
			'pip-top': { parentId: 'top', topParentId: 'pip-top', parents: [], accessScope: 'pip-top', membership: { access: 'secret' } },
			'pip-q': { parentId: 'pip-top', topParentId: 'pip-top', parents: ['pip-top'], accessScope: 'open', statementType: 'question', membership: { access: 'public' } },
		},
		answerFields: { parentId: 'pip-q', topParentId: 'pip-top', parents: ['pip-top', 'pip-q'], accessScope: 'open' },
	},
	'private question in an open top': {
		ancestor: 'pio-top',
		top: 'pio-top',
		level: 'pio-q',
		parent: 'pio-q',
		answer: 'pio-a',
		scope: 'pio-q',
		levels: {
			'pio-top': { parentId: 'top', topParentId: 'pio-top', parents: [], accessScope: 'open', membership: { access: 'openToAll' } },
			'pio-q': { parentId: 'pio-top', topParentId: 'pio-top', parents: ['pio-top'], accessScope: 'pio-q', statementType: 'question', membership: { access: 'moderated' } },
		},
		answerFields: { parentId: 'pio-q', topParentId: 'pio-top', parents: ['pio-top', 'pio-q'], accessScope: 'pio-q' },
	},
	'no setting anywhere': {
		ancestor: 'ns-top',
		top: 'ns-top',
		level: 'ns-top',
		parent: 'ns-q',
		answer: 'ns-a',
		scope: 'open',
		levels: {
			'ns-top': { parentId: 'top', topParentId: 'ns-top', parents: [], accessScope: 'open' },
			'ns-q': { parentId: 'ns-top', topParentId: 'ns-top', parents: ['ns-top'], accessScope: 'open', statementType: 'question' },
		},
		answerFields: { parentId: 'ns-q', topParentId: 'ns-top', parents: ['ns-top', 'ns-q'], accessScope: 'open' },
	},
};

const inScopes = (space) =>
	where('accessScope', 'in', space.scope === 'open' ? ['open'] : ['open', space.scope]);
const typeIsQuestionOrOption = () =>
	or(where('statementType', '==', 'question'), where('statementType', '==', 'option'));

/** Every real shape from the client inventory, as clients now send it. */
const SHAPES = {
	// Main: listenToSubStatements
	'parentId + type in + scope, by createdAt': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', 'in', ['option', 'question']), inScopes(s), orderBy('createdAt', 'desc')),
	// Main: fetchOlderSubStatements, subscriptionManager
	'parentId + scope, by createdAt': (C, s) => query(C, where('parentId', '==', s.parent), inScopes(s), orderBy('createdAt', 'desc'), limit(20)),
	// Main: getResults, getLevelResults
	'parentId + scope': (C, s) => query(C, where('parentId', '==', s.parent), inScopes(s)),
	// Main: bulk deltas (direct)
	'parentId + scope + lastUpdate': (C, s) => query(C, where('parentId', '==', s.parent), inScopes(s), where('lastUpdate', '>', 0), orderBy('lastUpdate', 'asc')),
	// Main: listenToTreeDescendants, fetchOlderTreeDescendants
	'parents + scope, by createdAt': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s), orderBy('createdAt', 'desc'), limit(40)),
	// Main: listenToDescendants
	'parents + scope + type !=': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s), where('statementType', '!=', 'statement'), orderBy('statementType'), orderBy('createdAt', 'asc'), limit(40)),
	// Main: listenToAllDescendants
	'parents + scope + or(types)': (C, s) => query(C, and(where('parents', 'array-contains', s.parent), inScopes(s), typeIsQuestionOrOption()), orderBy('createdAt', 'desc')),
	// Main: bulk deltas (descendants)
	'parents + scope + lastUpdate': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s), where('lastUpdate', '>', 0), orderBy('lastUpdate', 'asc')),
	// join-class: c3Data, replies; Odyssey game
	'parents + scope + type': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s), where('statementType', '==', 'option')),
	'parents + scope + classReply': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s), where('classReply.proposalCreatorId', '==', 'someone')),
	'parents + scope': (C, s) => query(C, where('parents', 'array-contains', s.parent), inScopes(s)),
	// Main: listenToMindMapData
	'mind map or()': (C, s) => query(C, and(inScopes(s), or(where('statementId', '==', s.parent), and(where('parents', 'array-contains', s.parent), typeIsQuestionOrOption()), and(where('parentId', '==', s.parent), typeIsQuestionOrOption()))), orderBy('createdAt', 'desc'), limit(200)),
	// Main: listenToTreeByTopParent; Chat realtime
	'topParentId + scope': (C, s) => query(C, where('topParentId', '==', s.top), inScopes(s), orderBy('createdAt', 'desc')),
	// Main: listenToAllSubStatements
	'topParentId + scope + statementId !=': (C, s) => query(C, where('topParentId', '==', s.top), inScopes(s), where('statementId', '!=', s.top), orderBy('statementId'), orderBy('createdAt', 'desc'), limit(7)),
	// Sign: useParagraphSuggestions
	'topParentId + scope + type': (C, s) => query(C, where('topParentId', '==', s.top), inScopes(s), where('statementType', '==', 'option'), orderBy('consensus', 'desc')),
	// Join: messageCounts
	'parentId in + type + one scope': (C, s) => query(C, where('parentId', 'in', [s.parent, s.answer]), where('statementType', '==', 'statement'), where('accessScope', '==', s.scope)),
	// Leaf shapes, unchanged on every client: judged by the parent.
	'leaf: parentId + option': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'option')),
	'leaf: parentId + option, by consensus': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'option'), orderBy('consensus', 'desc'), limit(5)),
	'leaf: parentId + paragraph': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'paragraph')),
	'leaf: parentId + statement, by createdAt': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'statement'), orderBy('createdAt')),
	'leaf: parentId + option + hide': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'option'), where('hide', '==', true)),
	'leaf: parentId + type in option, synthesis': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', 'in', ['option', 'synthesis'])),
	'leaf: official paragraphs': (C, s) => query(C, where('parentId', '==', s.parent), where('doc.isOfficialParagraph', '==', true), orderBy('doc.order', 'asc')),
	'leaf: clusters': (C, s) => query(C, where('parentId', '==', s.parent), where('isCluster', '==', true), limit(10)),
};

/** Old shapes that name no scope, and scans. A cached old client sends the first group. */
const UNSCOPED = {
	'parents only': (C, s) => query(C, where('parents', 'array-contains', s.parent)),
	'parents + or(types)': (C, s) => query(C, and(where('parents', 'array-contains', s.parent), typeIsQuestionOrOption())),
	'topParentId only': (C, s) => query(C, where('topParentId', '==', s.top)),
	'parentId only': (C, s) => query(C, where('parentId', '==', s.parent)),
	'parentId + question type': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'question')),
};

const SCANS = {
	'no filter': (C) => C,
	'statementType only': (C) => query(C, where('statementType', '==', 'group')),
	'orderBy only': (C) => query(C, orderBy('createdAt', 'desc'), limit(5)),
	'parentId == top': (C) => query(C, where('parentId', '==', 'top')),
	'parentId > ""': (C) => query(C, where('parentId', '>', '')),
	'parentId != x': (C) => query(C, where('parentId', '!=', 'x')),
	'topParentId > ""': (C) => query(C, where('topParentId', '>', '')),
	'statementId > ""': (C) => query(C, where('statementId', '>', '')),
	'documentId >=': (C) => query(C, where(documentId(), '>=', 'a')),
	'documentId !=': (C) => query(C, where(documentId(), '!=', 'x')),
	'startAt id': (C) => query(C, orderBy(documentId()), startAt('a')),
	'parents != [x]': (C) => query(C, where('parents', '!=', ['x'])),
	'parents not-in': (C) => query(C, where('parents', 'not-in', [['x']])),
	'accessScope > ""': (C) => query(C, where('accessScope', '>', '')),
	'accessScope != x': (C) => query(C, where('accessScope', '!=', 'x')),
	'accessScope not-in': (C) => query(C, where('accessScope', 'not-in', ['x'])),
	'creatorId == someone else': (C) => query(C, where('creatorId', '==', CREATOR)),
	'statementType != question': (C) => query(C, where('parentId', '==', 'pg-q'), where('statementType', '!=', 'question')),
	'isCluster false': (C) => query(C, where('parentId', '==', 'pg-q'), where('isCluster', '==', false)),
};

/** Who gets a restricted scope. Everyone gets an open one. */
const mayEnter = (uid) => uid === MEMBER || uid === HOST;

const PEOPLE = [MEMBER, HOST, BANNED, WAITING, OUTSIDER, ANONYMOUS, SIGNED_OUT];
const labelOf = (uid) => uid ?? 'signed out';

describe('listing /statements', () => {
	let env;

	const contextOf = (uid) => {
		if (uid === null) return env.unauthenticatedContext();
		if (uid === ANONYMOUS) {
			return env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });
		}

		return env.authenticatedContext(uid);
	};
	const statementsAs = (uid) => collection(contextOf(uid).firestore(), 'statements');
	const subscribe = (db, uid, statementId, role) =>
		setDoc(doc(db, 'statementsSubscribe', `${uid}--${statementId}`), {
			userId: uid,
			statementId,
			role,
		});

	before(async () => {
		env = await makeEnv('private-statement-reads');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', ADMIN), { systemAdmin: true });
			await setDoc(doc(db, 'organizationMembers', `org-1--${MEMBER}`), { role: 'member' });
			for (const space of Object.values(SPACES)) {
				for (const [id, fields] of Object.entries(space.levels)) {
					await setDoc(
						doc(db, 'statements', id),
						statementDoc({ statementId: id, uid: CREATOR, overrides: { statementType: 'group', ...fields } }),
					);
				}
				await setDoc(
					doc(db, 'statements', space.answer),
					statementDoc({ statementId: space.answer, uid: CREATOR, overrides: space.answerFields }),
				);
				await subscribe(db, MEMBER, space.level, 'member');
				await subscribe(db, HOST, space.ancestor, 'admin');
				await subscribe(db, BANNED, space.level, 'banned');
				await subscribe(db, WAITING, space.level, 'waiting');
			}
			await setDoc(
				doc(db, 'statements', 'org-top'),
				statementDoc({ statementId: 'org-top', uid: CREATOR, overrides: { organizationId: 'org-1', parentId: 'top', accessScope: 'open' } }),
			);
			await setDoc(
				doc(db, 'statements', 'agora-1'),
				statementDoc({ statementId: 'agora-1', uid: CREATOR, overrides: { agoraSessionId: 'session-1', accessScope: 'open' } }),
			);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

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

	describe('hosts', () => {
		it('lists every child of a level under what it hosts, with no scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(HOST), where('parentId', '==', 'pg-q'))));
		});

		it('lists a whole tree it tops, with no scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(HOST), where('topParentId', '==', 'pg-root'))));
		});

		it('finds the private levels of a tree it tops', async () => {
			const snapshot = await assertSucceeds(
				getDocs(query(statementsAs(HOST), where('topParentId', '==', 'pg-root'), where('membership.access', 'in', ['moderated', 'secret']))),
			);
			assert.deepEqual(snapshot.docs.map((d) => d.id), ['pg']);
		});

		it('a member of a level is not a host of it', async () => {
			await assertFails(getDocs(query(statementsAs(MEMBER), where('parentId', '==', 'pg-q'))));
			await assertFails(getDocs(query(statementsAs(MEMBER), where('topParentId', '==', 'pg-root'))));
		});

		it('a ban anywhere in the tree beats a host role', async () => {
			await seed(env, (db) => subscribe(db, 'banned-host', 'pg-root', 'admin'));
			await seed(env, (db) => subscribe(db, 'banned-host', 'pg', 'banned'));
			await assertFails(getDocs(query(statementsAs('banned-host'), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('a ban above a member keeps them out', async () => {
			await seed(env, (db) => subscribe(db, 'banned-above', 'pg-root', 'banned'));
			await seed(env, (db) => subscribe(db, 'banned-above', 'pg', 'member'));
			await assertFails(getDocs(query(statementsAs('banned-above'), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('the creator of a private level may read it', async () => {
			await assertSucceeds(getDocs(query(statementsAs(CREATOR), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('allows a host deep in a tree, within the read limit', async () => {
			await seed(env, async (db) => {
				const parents = ['deep-0', 'deep-1', 'deep-2', 'deep-3', 'deep-4'];
				await setDoc(doc(db, 'statements', 'deep-5'), statementDoc({ statementId: 'deep-5', uid: CREATOR, overrides: { parentId: 'deep-4', topParentId: 'deep-0', parents, accessScope: 'deep-5', membership: { access: 'secret' } } }));
				await subscribe(db, 'deep-host', 'deep-3', 'admin');
			});
			await assertSucceeds(getDocs(query(statementsAs('deep-host'), where('accessScope', '==', 'deep-5'))));
		});
	});

	describe('system admins', () => {
		for (const [name, build] of Object.entries(SCANS).slice(0, 3)) {
			it(`may run ${name}`, async () => {
				await assertSucceeds(getDocs(build(statementsAs(ADMIN))));
			});
		}

		it('may count the whole collection', async () => {
			await assertSucceeds(getCountFromServer(statementsAs(ADMIN)));
		});

		it('may read any scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ADMIN), where('accessScope', '==', 'pg'))));
		});
	});

	describe('other named shapes', () => {
		it('by id: the same as get, for anyone', async () => {
			const C = statementsAs(OUTSIDER);
			await assertSucceeds(getDocs(query(C, where(documentId(), 'in', ['pg-q', 'pg-a']))));
			await assertSucceeds(getDocs(query(C, where('__name__', '==', 'pg-q'))));
			await assertSucceeds(getDocs(query(C, where('statementId', '==', 'pg-q'))));
		});

		it('Agora: session plus open', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ANONYMOUS), where('agoraSessionId', '==', 'session-1'), where('accessScope', '==', 'open'))));
		});

		it('Agora: a session with no scope is refused', async () => {
			await assertFails(getDocs(query(statementsAs(ANONYMOUS), where('agoraSessionId', '==', 'session-1'))));
		});

		it('Studio: an organization for its members only', async () => {
			await assertSucceeds(getDocs(query(statementsAs(MEMBER), where('organizationId', '==', 'org-1'))));
			await assertFails(getDocs(query(statementsAs(OUTSIDER), where('organizationId', '==', 'org-1'))));
		});

		it('Flow: one’s own statements', async () => {
			await assertSucceeds(getDocs(query(statementsAs(CREATOR), where('creatorId', '==', CREATOR), where('parentId', '==', 'top'), where('statementType', '==', 'group'), orderBy('createdAt', 'desc'))));
		});

		it('a root that names itself and turns out to be open passes for anyone', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ANONYMOUS), where('parents', 'array-contains', 'ns-top'), where('accessScope', 'in', ['open', 'ns-top']))));
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

	describe('writing accessScope', () => {
		const create = (uid, id, fields) =>
			setDoc(
				doc(contextOf(uid).firestore(), 'statements', id),
				statementDoc({ statementId: id, uid, overrides: fields }),
			);

		it('accepts a child carrying its parent’s scope', async () => {
			await assertSucceeds(create(MEMBER, 'w1', { parentId: 'pg-q', topParentId: 'pg-root', accessScope: 'pg' }));
		});

		it('refuses a child opening itself inside a private level', async () => {
			await assertFails(create(MEMBER, 'w2', { parentId: 'pg-q', topParentId: 'pg-root', accessScope: 'open' }));
		});

		it('accepts a child with no scope yet (an old client)', async () => {
			await assertSucceeds(create(MEMBER, 'w3', { parentId: 'pg-q', topParentId: 'pg-root' }));
		});

		it('accepts an explicit public child as open', async () => {
			await assertSucceeds(create(MEMBER, 'w4', { parentId: 'pg-q', topParentId: 'pg-root', membership: { access: 'public' }, accessScope: 'open' }));
		});

		it('accepts a private child as its own scope, and refuses it as open', async () => {
			await assertSucceeds(create(MEMBER, 'w5', { parentId: 'ns-q', topParentId: 'ns-top', membership: { access: 'secret' }, accessScope: 'w5' }));
			await assertFails(create(MEMBER, 'w6', { parentId: 'ns-q', topParentId: 'ns-top', membership: { access: 'secret' }, accessScope: 'open' }));
		});

		it('accepts a top statement as open', async () => {
			await assertSucceeds(create(MEMBER, 'w7', { parentId: 'top', topParentId: 'w7', parents: [], accessScope: 'open' }));
		});

		it('refuses any client changing a scope, even a host', async () => {
			await assertFails(updateDoc(doc(contextOf(CREATOR).firestore(), 'statements', 'pg-a'), { accessScope: 'open' }));
		});

		it('leaves an update that does not touch it alone', async () => {
			await assertSucceeds(updateDoc(doc(contextOf(CREATOR).firestore(), 'statements', 'pg-a'), { statement: 'edited' }));
		});
	});

	describe('a child of a private level in an open top', () => {
		const SUB = (uid, id, role) => ({
			userId: uid,
			user: { uid },
			statementId: id,
			statementsSubscribeId: `${uid}--${id}`,
			role,
		});
		const selfSubscribe = (uid, id, role = 'member') =>
			setDoc(doc(contextOf(uid).firestore(), 'statementsSubscribe', `${uid}--${id}`), SUB(uid, id, role));

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'statements', 'k-top'), statementDoc({ statementId: 'k-top', uid: CREATOR, overrides: { parentId: 'top', topParentId: 'k-top', parents: [], accessScope: 'open', membership: { access: 'openToAll' } } }));
				await setDoc(doc(db, 'statements', 'k-q'), statementDoc({ statementId: 'k-q', uid: CREATOR, overrides: { parentId: 'k-top', topParentId: 'k-top', parents: ['k-top'], accessScope: 'k-q', statementType: 'question', membership: { access: 'secret' } } }));
				await setDoc(doc(db, 'statements', 'k'), statementDoc({ statementId: 'k', uid: 'k-creator', overrides: { parentId: 'k-q', topParentId: 'k-top', parents: ['k-top', 'k-q'], accessScope: 'k-q', statementType: 'question' } }));
				await setDoc(doc(db, 'statements', 'k-m'), statementDoc({ statementId: 'k-m', uid: CREATOR, overrides: { parentId: 'k-top', topParentId: 'k-top', parents: ['k-top'], accessScope: 'k-m', statementType: 'question', membership: { access: 'moderated' } } }));
				await setDoc(doc(db, 'statements', 'k-m-child'), statementDoc({ statementId: 'k-m-child', uid: CREATOR, overrides: { parentId: 'k-m', topParentId: 'k-top', parents: ['k-top', 'k-m'], accessScope: 'k-m', statementType: 'question' } }));
				await subscribe(db, 'k-q-member', 'k-q', 'member');
				await subscribe(db, 'k-top-member', 'k-top', 'member');
				await subscribe(db, 'k-host', 'k', 'admin');
				// Only someone in the private level can have made a level inside it.
				await subscribe(db, 'k-creator', 'k-q', 'member');
			});
		});

		it('refuses an outsider a member role on the child', async () => {
			await assertFails(selfSubscribe('k-outsider', 'k'));
		});

		it('refuses a plain member of the open top a role on the child', async () => {
			await assertFails(selfSubscribe('k-top-member', 'k'));
		});

		it('lets a member of the governing level follow the child', async () => {
			await assertSucceeds(selfSubscribe('k-q-member', 'k'));
		});

		it('judges a moderated governing level: waiting yes, member no', async () => {
			await assertSucceeds(selfSubscribe('k-asker', 'k-m-child', 'waiting'));
			await assertFails(selfSubscribe('k-asker-2', 'k-m-child', 'member'));
		});

		it('a host of the child may list its children with no scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs('k-host'), where('parentId', '==', 'k'))));
		});

		it('the creator of the child may too', async () => {
			await assertSucceeds(getDocs(query(statementsAs('k-creator'), where('parentId', '==', 'k'))));
		});

		it('but the host may not name the governing scope', async () => {
			const named = (uid) => query(statementsAs(uid), where('parents', 'array-contains', 'k'), where('accessScope', 'in', ['open', 'k-q']));
			await assertFails(getDocs(named('k-host')));
		});

		it('an outsider still may not list the children', async () => {
			await assertFails(getDocs(query(statementsAs('k-outsider'), where('parentId', '==', 'k'))));
		});
	});

	describe('planting a statement inside a private level', () => {
		const make = (uid, id, fields) =>
			setDoc(doc(contextOf(uid).firestore(), 'statements', id), statementDoc({ statementId: id, uid, overrides: fields }));
		const underPg = { parentId: 'pg', topParentId: 'pg-root', parents: ['pg-root', 'pg'], accessScope: 'pg', statementType: 'question' };

		it('refuses an outsider creating under the private level', async () => {
			await assertFails(make(OUTSIDER, 'plant-1', underPg));
		});

		it('refuses it with the scope left off, or with an own public setting', async () => {
			const { accessScope: _scope, ...noScope } = underPg;
			await assertFails(make(OUTSIDER, 'plant-2', noScope));
			await assertFails(make(OUTSIDER, 'plant-3', { ...underPg, accessScope: 'open', membership: { access: 'public' } }));
		});

		it('refuses a banned or waiting person, and an anonymous one', async () => {
			await assertFails(make(BANNED, 'plant-4', underPg));
			await assertFails(make(WAITING, 'plant-5', underPg));
			await assertFails(make(ANONYMOUS, 'plant-6', underPg));
		});

		it('lets a member and a host above write there', async () => {
			await assertSucceeds(make(MEMBER, 'grow-1', underPg));
			await assertSucceeds(make(HOST, 'grow-2', underPg));
			await assertSucceeds(make(MEMBER, 'grow-3', { ...underPg, accessScope: 'open', membership: { access: 'public' } }));
		});

		it('still lets anyone write under an open level', async () => {
			await assertSucceeds(make(OUTSIDER, 'open-1', { parentId: 'ns-q', topParentId: 'ns-top', parents: ['ns-top', 'ns-q'], accessScope: 'open', statementType: 'option' }));
		});

		it('refuses moving one’s own statement under the private level', async () => {
			await assertSucceeds(make(OUTSIDER, 'mytop', { parentId: 'top', topParentId: 'mytop', parents: [], accessScope: 'open' }));
			await assertFails(updateDoc(doc(contextOf(OUTSIDER).firestore(), 'statements', 'mytop'), { parentId: 'pg', topParentId: 'pg-root', parents: ['pg-root', 'pg'] }));
		});

		it('lets a member move a statement within the private level', async () => {
			await assertSucceeds(make(MEMBER, 'mover', underPg));
			await assertSucceeds(updateDoc(doc(contextOf(MEMBER).firestore(), 'statements', 'mover'), { parentId: 'pg-q', parents: ['pg-root', 'pg', 'pg-q'] }));
		});

		describe('a plant made before creates checked the parent', () => {
			before(async () => {
				await seed(env, async (db) => {
					await setDoc(doc(db, 'statements', 'old-plant'), statementDoc({ statementId: 'old-plant', uid: 'planter', overrides: underPg }));
					await subscribe(db, 'planter', 'old-plant', 'admin');
					await setDoc(doc(db, 'statements', 'old-plant-reply'), statementDoc({ statementId: 'old-plant-reply', uid: MEMBER, overrides: { parentId: 'old-plant', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'old-plant'], accessScope: 'pg' } }));
					await setDoc(doc(db, 'statements', 'real-level'), statementDoc({ statementId: 'real-level', uid: MEMBER, overrides: underPg }));
					await subscribe(db, 'real-host', 'real-level', 'admin');
				});
			});

			it('gives its creator and its hosts no unscoped list', async () => {
				await assertFails(getDocs(query(statementsAs('planter'), where('parentId', '==', 'old-plant'))));
			});

			it('still gives a host of a member-made level its children', async () => {
				await assertSucceeds(getDocs(query(statementsAs('real-host'), where('parentId', '==', 'real-level'))));
			});

			it('leaves a member reading it as usual', async () => {
				await assertSucceeds(getDocs(query(statementsAs(MEMBER), where('parents', 'array-contains', 'old-plant'), where('accessScope', 'in', ['open', 'pg']))));
			});
		});
	});

	describe('following a question inside a private group', () => {
		const followAs = (uid, statementId, role = 'member') =>
			setDoc(doc(contextOf(uid).firestore(), 'statementsSubscribe', `${uid}--${statementId}`), {
				userId: uid,
				user: { uid },
				statementId,
				statementsSubscribeId: `${uid}--${statementId}`,
				role,
			});

		it('a member of the top may follow a child with no own setting', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'statements', 'f-top'), statementDoc({ statementId: 'f-top', uid: CREATOR, overrides: { parentId: 'top', topParentId: 'f-top', parents: [], accessScope: 'f-top', membership: { access: 'secret' } } }));
				await setDoc(doc(db, 'statements', 'f-q'), statementDoc({ statementId: 'f-q', uid: CREATOR, overrides: { parentId: 'f-top', topParentId: 'f-top', parents: ['f-top'], accessScope: 'f-top' } }));
				await subscribe(db, 'f-member', 'f-top', 'member');
			});
			await assertSucceeds(followAs('f-member', 'f-q'));
		});

		it('an outsider may not', async () => {
			await assertFails(followAs('f-outsider', 'f-q'));
		});
	});
});
