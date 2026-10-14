import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * The teachers' scenario library. Reads are for APPROVED teachers only (the
 * marker `agoraApprovedTeachers/{uid}` that `agoraLibraryAccess` writes);
 * publishing, ratings, tags and the translation cache are the callables'.
 */
describe('agora scenario library', () => {
	let env;

	const AUTHOR = 'teacher-author';
	const APPROVED = 'teacher-approved';
	const OUTSIDER = 'teacher-not-approved';
	const STUDENT = 'student-1';
	const ADMIN = 'admin-1';

	function pkg(id, overrides = {}) {
		return {
			topicPackageId: id,
			creatorId: AUTHOR,
			topic: 't',
			title: `Title ${id}`,
			language: 'he',
			status: 'ready',
			framingText: 'f',
			challengeQuestion: 'q',
			createdAt: 1,
			lastUpdate: 1,
			...overrides,
		};
	}

	const library = (hidden = false) => ({
		summary: 'a summary that is long enough',
		subjectIds: ['s1'],
		lessonTypeIds: ['l1'],
		publishedAt: 5,
		authorId: AUTHOR,
		authorName: 'Dana',
		hidden,
	});

	before(async () => {
		env = await makeEnv('agora-library');
		await seed(env, async (db) => {
			for (const uid of [AUTHOR, APPROVED, ADMIN]) {
				await setDoc(doc(db, 'agoraApprovedTeachers', uid), {
					teacherId: uid,
					via: uid === ADMIN ? 'admin' : 'school',
					checkedAt: 1,
				});
			}
			await setDoc(doc(db, 'usersV2', ADMIN), { systemAdmin: true });
			await setDoc(
				doc(db, 'agoraTopicPackages', 'pub-1'),
				pkg('pub-1', {
					visibility: 'public',
					library: library(),
					stats: { ratingCount: 0, ratingSum: 0, ratingBayes: 3.8, reviewCount: 0, copyCount: 0 },
				}),
			);
			await setDoc(
				doc(db, 'agoraTopicPackages', 'pub-hidden'),
				pkg('pub-hidden', {
					visibility: 'public',
					library: library(true),
					stats: { ratingCount: 0, ratingSum: 0, ratingBayes: 3.8, reviewCount: 0, copyCount: 0 },
				}),
			);
			await setDoc(
				doc(db, 'agoraTopicPackages', 'private-1'),
				pkg('private-1', { visibility: 'private' }),
			);
			await setDoc(doc(db, 'agoraTopicPackages', 'plain-1'), pkg('plain-1'));
			await setDoc(doc(db, 'agoraLibraryTags', 's1'), { tagId: 's1', label: 'x' });
			await setDoc(doc(db, 'agoraScenarioTranslations', 'pub-1__en'), { scenarioId: 'pub-1' });
			await setDoc(doc(db, 'agoraScenarioRatings', 'pub-1__teacher-approved'), {
				scenarioId: 'pub-1',
				teacherId: APPROVED,
				stars: 4,
				hidden: false,
				lastUpdate: 3,
			});
			await setDoc(doc(db, 'agoraScenarioRatings', 'pub-1__teacher-other'), {
				scenarioId: 'pub-1',
				teacherId: 'teacher-other',
				stars: 1,
				hidden: true,
				lastUpdate: 2,
			});
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	const publicList = (db) =>
		query(
			collection(db, 'agoraTopicPackages'),
			where('visibility', '==', 'public'),
			where('library.hidden', '==', false),
			orderBy('stats.ratingBayes', 'desc'),
		);

	describe('listing scenarios', () => {
		it('lets an approved teacher list the public, un-hidden ones', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			const snap = await assertSucceeds(getDocs(publicList(db)));
			assertIds(snap, ['pub-1']);
		});

		it('lets a sys-admin list the hidden ones to lift a hide, and no one else', async () => {
			const hiddenList = (db) =>
				query(
					collection(db, 'agoraTopicPackages'),
					where('visibility', '==', 'public'),
					where('library.hidden', '==', true),
				);
			const admin = env.authenticatedContext(ADMIN).firestore();
			assertIds(await assertSucceeds(getDocs(hiddenList(admin))), ['pub-hidden']);
			const teacher = env.authenticatedContext(APPROVED).firestore();
			await assertFails(getDocs(hiddenList(teacher)));
		});

		it('refuses a teacher who is not approved', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(getDocs(publicList(db)));
		});

		it('refuses a student the library list', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(getDocs(publicList(db)));
		});

		it('refuses an unauthenticated visitor', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDocs(publicList(db)));
		});

		it('refuses a list that does not exclude hidden scenarios', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraTopicPackages'), where('visibility', '==', 'public'))),
			);
		});

		it('refuses to enumerate private scenarios of someone else', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraTopicPackages'), where('visibility', '==', 'private'))),
			);
		});

		it('still lets an owner list their own shelf, private ones included', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			const snap = await assertSucceeds(
				getDocs(query(collection(db, 'agoraTopicPackages'), where('creatorId', '==', AUTHOR))),
			);
			assertIds(snap, ['plain-1', 'private-1', 'pub-1', 'pub-hidden']);
		});

		it('still lets a teacher who is not approved list their own shelf', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertSucceeds(
				getDocs(query(collection(db, 'agoraTopicPackages'), where('creatorId', '==', OUTSIDER))),
			);
		});

		it('refuses a non-owner listing someone else shelf', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraTopicPackages'), where('creatorId', '==', AUTHOR))),
			);
		});
	});

	describe('reading one scenario by id (the soft spot, kept on purpose)', () => {
		it('lets a student open the package behind a game', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraTopicPackages', 'plain-1')));
			await assertSucceeds(getDoc(doc(db, 'agoraTopicPackages', 'pub-1')));
		});

		it('refuses a signed-out visitor', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(db, 'agoraTopicPackages', 'pub-1')));
		});
	});

	describe('writing scenarios', () => {
		it('lets the owner edit ordinary fields of a published scenario', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'agoraTopicPackages', 'pub-1'), { title: 'Edited', lastUpdate: 9 }),
			);
		});

		it('refuses the owner publishing by hand', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraTopicPackages', 'plain-1'), {
					visibility: 'public',
					library: library(),
				}),
			);
		});

		it('refuses the owner editing their own stats or un-hiding', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraTopicPackages', 'pub-1'), { 'stats.ratingBayes': 5 }),
			);
			await assertFails(
				updateDoc(doc(db, 'agoraTopicPackages', 'pub-hidden'), { 'library.hidden': false }),
			);
		});

		it('refuses to forge a credit to another author on create', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(
				setDoc(
					doc(db, 'agoraTopicPackages', 'forged'),
					pkg('forged', { creatorId: OUTSIDER, sourceScenarioId: 'pub-1', sourceAuthorName: 'Dana' }),
				),
			);
		});

		it('still lets any teacher create an ordinary package of their own', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertSucceeds(
				setDoc(doc(db, 'agoraTopicPackages', 'mine'), pkg('mine', { creatorId: OUTSIDER })),
			);
		});

		it('refuses a non-owner editing or deleting', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			await assertFails(updateDoc(doc(db, 'agoraTopicPackages', 'plain-1'), { title: 'x' }));
			await assertFails(deleteDoc(doc(db, 'agoraTopicPackages', 'plain-1')));
		});
	});

	describe('tags', () => {
		it('are read by approved teachers only, and never client-written', async () => {
			const approved = env.authenticatedContext(APPROVED).firestore();
			await assertSucceeds(getDocs(collection(approved, 'agoraLibraryTags')));
			await assertFails(setDoc(doc(approved, 'agoraLibraryTags', 'new'), { tagId: 'new' }));
			const outsider = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(getDocs(collection(outsider, 'agoraLibraryTags')));
			await assertFails(getDoc(doc(outsider, 'agoraLibraryTags', 's1')));
		});
	});

	describe('ratings', () => {
		const reviews = (db) =>
			query(
				collection(db, 'agoraScenarioRatings'),
				where('scenarioId', '==', 'pub-1'),
				where('hidden', '==', false),
				orderBy('lastUpdate', 'desc'),
			);

		it('lets an approved teacher read the visible reviews', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			const snap = await assertSucceeds(getDocs(reviews(db)));
			assertIds(snap, ['pub-1__teacher-approved']);
		});

		it('refuses a teacher who is not approved', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(getDocs(reviews(db)));
		});

		it('hides a hidden review from everyone but its author and a sys-admin', async () => {
			const approved = env.authenticatedContext(APPROVED).firestore();
			await assertFails(getDoc(doc(approved, 'agoraScenarioRatings', 'pub-1__teacher-other')));
			const admin = env.authenticatedContext(ADMIN).firestore();
			await assertSucceeds(getDoc(doc(admin, 'agoraScenarioRatings', 'pub-1__teacher-other')));
		});

		it('lets a teacher read their own rating, or learn there is none', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraScenarioRatings', 'pub-1__teacher-approved')));
			await assertSucceeds(getDoc(doc(db, 'agoraScenarioRatings', 'pub-1__nobody')));
		});

		it('are never client-written', async () => {
			const db = env.authenticatedContext(APPROVED).firestore();
			await assertFails(
				setDoc(doc(db, 'agoraScenarioRatings', 'pub-1__teacher-approved'), {
					scenarioId: 'pub-1',
					teacherId: APPROVED,
					stars: 5,
					hidden: false,
				}),
			);
			await assertFails(deleteDoc(doc(db, 'agoraScenarioRatings', 'pub-1__teacher-approved')));
		});
	});

	describe('server-only documents', () => {
		it('keeps the translation cache closed to every client', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertFails(getDoc(doc(db, 'agoraScenarioTranslations', 'pub-1__en')));
			await assertFails(setDoc(doc(db, 'agoraScenarioTranslations', 'x__en'), { a: 1 }));
		});

		it('lets a teacher read only their own approval marker, and write none', async () => {
			const db = env.authenticatedContext(OUTSIDER).firestore();
			await assertFails(
				setDoc(doc(db, 'agoraApprovedTeachers', OUTSIDER), {
					teacherId: OUTSIDER,
					via: 'admin',
					checkedAt: 1,
				}),
			);
			const approved = env.authenticatedContext(APPROVED).firestore();
			await assertSucceeds(getDoc(doc(approved, 'agoraApprovedTeachers', APPROVED)));
			await assertFails(getDoc(doc(approved, 'agoraApprovedTeachers', AUTHOR)));
		});
	});
});

function assertIds(snap, expected) {
	const ids = snap.docs.map((entry) => entry.id).sort();
	if (JSON.stringify(ids) !== JSON.stringify([...expected].sort())) {
		throw new Error(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(ids)}`);
	}
}
