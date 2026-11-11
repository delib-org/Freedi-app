/**
 * Shared world for the private-statement rules tests: the spaces, the people,
 * every real query shape, and a seeded environment per test file.
 */
import { after, before } from 'node:test';
import { collection, doc, setDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';
import {
	and,
	documentId,
	limit,
	or,
	orderBy,
	query,
	startAt,
	where,
} from 'firebase/firestore';

/**
 * A list rule cannot look at results, only at what a query filters on. Each
 * shape below is a real client query, run against each kind of space for each
 * kind of person. `accessScope` values are what resolveAccessScope stamps.
 */
export const MEMBER = 'member';
export const HOST = 'ancestor-host';
export const BANNED = 'banned';
export const WAITING = 'waiting';
export const OUTSIDER = 'outsider';
export const ANONYMOUS = 'anonymous';
export const SIGNED_OUT = null;
export const ADMIN = 'system-admin';
export const CREATOR = 'creator-person';

export const SPACES = {
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

export const inScopes = (space) =>
	where('accessScope', 'in', space.scope === 'open' ? ['open'] : ['open', space.scope]);
export const typeIsQuestionOrOption = () =>
	or(where('statementType', '==', 'question'), where('statementType', '==', 'option'));

/** Every real shape from the client inventory, as clients now send it. */
export const SHAPES = {
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
export const UNSCOPED = {
	'parents only': (C, s) => query(C, where('parents', 'array-contains', s.parent)),
	'parents + or(types)': (C, s) => query(C, and(where('parents', 'array-contains', s.parent), typeIsQuestionOrOption())),
	'topParentId only': (C, s) => query(C, where('topParentId', '==', s.top)),
	'parentId only': (C, s) => query(C, where('parentId', '==', s.parent)),
	'parentId + question type': (C, s) => query(C, where('parentId', '==', s.parent), where('statementType', '==', 'question')),
};

export const SCANS = {
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
export const mayEnter = (uid) => uid === MEMBER || uid === HOST;

export const PEOPLE = [MEMBER, HOST, BANNED, WAITING, OUTSIDER, ANONYMOUS, SIGNED_OUT];
export const labelOf = (uid) => uid ?? 'signed out';

/** Seeds the world once per file and gives the helpers each test uses. */
export function useWorld(suite) {
	const world = { env: undefined };
	const contextOf = (uid) => {
		if (uid === null) return world.env.unauthenticatedContext();
		if (uid === ANONYMOUS) {
			return world.env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });
		}

		return world.env.authenticatedContext(uid);
	};
	const statementsAs = (uid) => collection(contextOf(uid).firestore(), 'statements');
	const subscribe = (db, uid, statementId, role) =>
		setDoc(doc(db, 'statementsSubscribe', `${uid}--${statementId}`), {
			userId: uid,
			statementId,
			role,
		});

	before(async () => {
		world.env = await makeEnv(suite);
		await seed(world.env, async (db) => {
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
				statementDoc({ statementId: 'org-top', uid: CREATOR, overrides: { organizationId: 'org-1', parentId: 'top', topParentId: 'org-top', parents: [], accessScope: 'open' } }),
			);
			await setDoc(
				doc(db, 'statements', 'agora-1'),
				statementDoc({ statementId: 'agora-1', uid: CREATOR, overrides: { agoraSessionId: 'session-1', accessScope: 'open' } }),
			);
		});
	});

	after(async () => {
		await world.env?.cleanup();
	});

	return { world, contextOf, statementsAs, subscribe };
}
