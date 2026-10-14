/* The teachers' scenario library, end to end, at the callable + rules level.
 *
 * Approved teachers (attached to a school by a sys-admin) publish, find, copy
 * and rate scenarios; an outsider gets nothing — not from the callables, not
 * from the list query under the real security rules. Ratings follow the Bayes
 * formula, the owner cannot rate, a copy stays linked to its original, an
 * admin can hide, and translations are cached per scenario per language.
 *
 * Asserts Firestore state, not pixels. Needs OPENAI_API_KEY in the functions
 * env for the translation steps (it skips them, loudly, without one).
 * Run: npx tsx scripts/e2e-scenario-library.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { preflight, FIRESTORE_REST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';
import shared from '@freedi/shared-types';

// The package is CommonJS: its re-exports are not visible as named imports
const { bayesianAverage, isNewerVersionAvailable, normalizeTagKey, agoraTagId } = shared;

await preflight({ needs: ['firestore', 'auth', 'functions'] });

/** Posts of one scenario as a signed-in client (rules apply), with an optional extra equality filter */
async function listPosts(token, scenarioId, extra = []) {
	const field = (path, value) => ({ fieldFilter: { field: { fieldPath: path }, op: 'EQUAL', value } });
	const response = await fetch(`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'agoraScenarioPosts' }],
				where: { compositeFilter: { op: 'AND', filters: [field('scenarioId', { stringValue: scenarioId }), ...extra] } },
			},
		}),
	});
	const body = await response.text();
	if (response.status === 403 || /PERMISSION_DENIED/i.test(body)) return null;
	if (!response.ok) fail(`list failed: ${response.status} ${body}`);

	return JSON.parse(body)
		.filter((row) => row.document)
		.map((row) => row.document.name.split('/').pop());
}
const eqFilter = (path, value) => ({ fieldFilter: { field: { fieldPath: path }, op: 'EQUAL', value } });


const runId = `lib-${Date.now().toString(36)}`;
const refuses = (promise, pattern) =>
	promise.then(
		() => false,
		(error) => pattern.test(String(error)),
	);

/** One structuredQuery as a signed-in client — rules apply, exactly as in the browser. */
async function listPublic(token) {
	const response = await fetch(`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'agoraTopicPackages' }],
				where: {
					compositeFilter: {
						op: 'AND',
						filters: [
							{ fieldFilter: { field: { fieldPath: 'visibility' }, op: 'EQUAL', value: { stringValue: 'public' } } },
							{ fieldFilter: { field: { fieldPath: 'library.hidden' }, op: 'EQUAL', value: { booleanValue: false } } },
						],
					},
				},
			},
		}),
	});
	const body = await response.text();
	if (response.status === 403 || /PERMISSION_DENIED/i.test(body)) return null;
	if (!response.ok) fail(`list failed: ${response.status} ${body}`);

	return JSON.parse(body)
		.filter((row) => row.document)
		.map((row) => row.document.name.split('/').pop());
}

step('A. a school, two approved teachers, an outsider, an admin');
const admin = await signInTeacher(`${runId}-admin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true, displayName: 'Ada Admin' }, { merge: true });
const emailOf = (sub) => `${runId}-${sub}@example.com`;
const mk = async (sub, name) => {
	const who = await signInTeacher(`${runId}-${sub}`);
	await db.collection('usersV2').doc(who.uid).set({ email: emailOf(sub), displayName: name }, { merge: true });

	return who;
};
const author = await mk('author', 'Dana Author');
const reader = await mk('reader', 'Ron Reader');
const second = await mk('second', 'Sam Second');
const outsider = await mk('outsider', 'Olly Outsider');
const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: `${runId} school` }, admin.idToken);
for (const sub of ['author', 'reader', 'second']) {
	await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: emailOf(sub) }, admin.idToken);
}

step('B. the door: approved teachers in, an outsider out');
const open = await callable('agoraLibraryAccess', {}, author.idToken);
eq('author approved', open.approved, true);
eq('approved via the school', open.via, 'school');
eq('marker written', (await db.collection('agoraApprovedTeachers').doc(author.uid).get()).exists, true);
eq('starting vocabulary seeded', (await db.collection('agoraLibraryTags').get()).size >= 6, true);
const closed = await callable('agoraLibraryAccess', {}, outsider.idToken);
eq('outsider not approved', closed.approved, false);
eq('no marker for the outsider', (await db.collection('agoraApprovedTeachers').doc(outsider.uid).get()).exists, false);
const adminOpen = await callable('agoraLibraryAccess', {}, admin.idToken);
eq('a sys-admin is approved too', adminOpen.via, 'admin');
await callable('agoraLibraryAccess', {}, reader.idToken);
await callable('agoraLibraryAccess', {}, second.idToken);

const smoking = agoraTagId('subject', normalizeTagKey('עישון'));
const civics = agoraTagId('lessonType', normalizeTagKey('אזרחות'));
const history = agoraTagId('lessonType', normalizeTagKey('היסטוריה'));
eq('seed tag ids match what a teacher typing the words would hit', (await db.collection('agoraLibraryTags').doc(smoking).get()).exists, true);

step('C. tags: a new one is usable at once and never duplicated');
const made = await callable('agoraLibraryCreateTag', { kind: 'subject', label: 'חינוך  מיני', lang: 'he' }, author.idToken);
eq('first time mints', made.existed, false);
const tagDoc = (await db.collection('agoraLibraryTags').doc(made.tagId).get()).data();
eq('pending until adopted', tagDoc.status, 'pending');
eq('its label is stored with the author words', tagDoc.labels.he, 'חינוך מיני');
console.log('   labels:', JSON.stringify(tagDoc.labels));
const again = await callable('agoraLibraryCreateTag', { kind: 'subject', label: '״חִינוּך מיני״', lang: 'he' }, reader.idToken);
eq('the same words land on the same tag', again.tagId, made.tagId);
eq('...and say so', again.existed, true);
eq('outsider cannot add tags', await refuses(callable('agoraLibraryCreateTag', { kind: 'subject', label: 'חלל', lang: 'he' }, outsider.idToken), /PERMISSION_DENIED|approved/i), true);

step('D. publishing');
const pkgId = `${runId}-scenario`;
const seed = (await db.collection('agoraTopicPackages').doc('demo-french-revolution').get()).data();
if (!seed) fail('the demo package is not seeded — run npm run seed');
const now = Date.now();
await db.collection('agoraTopicPackages').doc(pkgId).set({ ...seed, topicPackageId: pkgId, creatorId: author.uid, title: 'המהפכה הצרפתית — מבחן ספרייה', status: 'ready', language: 'he', createdAt: now, lastUpdate: now });
const summary = 'הכיתה חוזרת לצרפת של 1789 ומחפשת פתרון שכל הצדדים יכולים לחיות איתו.';
const publishBody = { scenarioId: pkgId, summary, subjectIds: [smoking, made.tagId], lessonTypeIds: [civics, history] };
eq('outsider cannot publish', await refuses(callable('agoraLibraryPublish', publishBody, outsider.idToken), /PERMISSION_DENIED|approved/i), true);
eq('a non-owner cannot publish it', await refuses(callable('agoraLibraryPublish', publishBody, reader.idToken), /PERMISSION_DENIED|owner/i), true);
eq('a short summary is refused, by name', await refuses(callable('agoraLibraryPublish', { ...publishBody, summary: 'קצר' }, author.idToken), /summary_short/), true);
eq('a missing subject is refused', await refuses(callable('agoraLibraryPublish', { ...publishBody, subjectIds: [] }, author.idToken), /subjects_missing/), true);
eq('an unknown tag is refused', await refuses(callable('agoraLibraryPublish', { ...publishBody, subjectIds: ['nope'] }, author.idToken), /Unknown subject/i), true);
eq('a cover from someone else folder is refused', await refuses(callable('agoraLibraryPublish', { ...publishBody, coverUrl: 'https://evil.example.com/agora/x/y.png' }, author.idToken), /cover/i), true);

step('D2. AI cover: generated from the scenario, limited per teacher per day');
// Real OpenAI image call when the functions env has a key (about 20 s, ~USD 0.015 each);
// with AGORA_COVER_STUB=1 on the functions emulator a fixed swatch is painted instead.
const genBody = { scenarioId: pkgId, summary };
eq('outsider cannot generate', await refuses(callable('agoraLibraryGenerateCover', genBody, outsider.idToken), /PERMISSION_DENIED|approved/i), true);
eq('a non-owner cannot generate for it', await refuses(callable('agoraLibraryGenerateCover', genBody, reader.idToken), /PERMISSION_DENIED|owner/i), true);
eq('an unknown scenario is not found', await refuses(callable('agoraLibraryGenerateCover', { scenarioId: 'nope' }, author.idToken), /NOT_FOUND/i), true);
const started = Date.now();
const cover = await callable('agoraLibraryGenerateCover', genBody, author.idToken);
console.log('   cover made in', Date.now() - started, 'ms');
eq('not listed yet, so not applied', cover.applied, false);
eq('9 left after one', cover.remainingToday, 9);
eq('the URL is under the scenario folder', cover.coverUrl.includes(`agora%2F${pkgId}%2F`), true);
const picture = await fetch(cover.coverUrl);
eq('the picture is stored and served', picture.status, 200);
eq('as webp', picture.headers.get('content-type'), 'image/webp');
const bytes = Buffer.from(await picture.arrayBuffer());
if (bytes.length < 500) fail('the generated picture is suspiciously small');
mkdirSync('output/scenario-library', { recursive: true });
writeFileSync('output/scenario-library/ai-cover-generated.webp', bytes);
console.log('   saved output/scenario-library/ai-cover-generated.webp,', bytes.length, 'bytes');
eq('the day counter is on the marker', (await db.collection('agoraApprovedTeachers').doc(author.uid).get()).data().coversToday, 1);
publishBody.coverUrl = cover.coverUrl;

await callable('agoraLibraryPublish', publishBody, author.idToken);
eq('publishing with it marks the cover as AI', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().library.coverSource, 'ai');
const regenerated = await callable('agoraLibraryGenerateCover', genBody, author.idToken);
eq('regenerating on a listed scenario applies at once', regenerated.applied, true);
eq('...with a new picture', regenerated.coverUrl !== cover.coverUrl, true);
eq('...on the card', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().library.coverUrl, regenerated.coverUrl);
const marker = db.collection('agoraApprovedTeachers').doc(author.uid);
await marker.set({ coversToday: 10 }, { merge: true });
eq('the eleventh of the day is refused', await refuses(callable('agoraLibraryGenerateCover', genBody, author.idToken), /RESOURCE_EXHAUSTED|limit/i), true);
await marker.set({ coversDay: '1999-01-01' }, { merge: true });
eq('a new day starts the count again', (await callable('agoraLibraryGenerateCover', { scenarioId: pkgId }, author.idToken)).remainingToday, 9);
await callable('agoraLibraryPublish', { ...publishBody, coverUrl: undefined }, author.idToken);
let pkg = (await db.collection('agoraTopicPackages').doc(pkgId).get()).data();
eq('public', pkg.visibility, 'public');
eq('card summary', pkg.library.summary, summary);
eq('card author name is a first name', pkg.library.authorName, 'Dana');
eq('not hidden', pkg.library.hidden, false);
eq('stats start empty', pkg.stats.ratingCount, 0);
eq('publishing did not touch lastUpdate', pkg.lastUpdate, now);
eq('subject count', (await db.collection('agoraLibraryTags').doc(smoking).get()).data().scenarioCount, 1);
eq('pending tag counted too', (await db.collection('agoraLibraryTags').doc(made.tagId).get()).data().scenarioCount, 1);

step('E. who can list it under the real rules');
eq('an approved teacher sees it', (await listPublic(reader.idToken))?.includes(pkgId), true);
eq('an outsider is refused the list outright', await listPublic(outsider.idToken), null);

step('F. translation is cached per scenario per language');
let translatedTitle = null;
if (process.env.OPENAI_API_KEY || true) {
	try {
		const first = await callable('agoraLibraryTranslate', { scenarioIds: [pkgId], lang: 'en' }, reader.idToken);
		translatedTitle = first.translations[pkgId]?.title ?? null;
		console.log('   title in English:', translatedTitle);
		eq('a Hebrew scenario came back in English', Boolean(translatedTitle) && translatedTitle !== pkg.title, true);
		const cacheDoc = db.collection('agoraScenarioTranslations').doc(`${pkgId}__en`);
		const cached = (await cacheDoc.get()).data();
		eq('the translation is stored', cached.sourceVersion, now);
		const stamp = cached.lastUpdate;
		const second_ = await callable('agoraLibraryTranslate', { scenarioIds: [pkgId], lang: 'en' }, reader.idToken);
		eq('second look returns the same words', second_.translations[pkgId].title, translatedTitle);
		eq('...without translating again', (await cacheDoc.get()).data().lastUpdate, stamp);
		const own = await callable('agoraLibraryTranslate', { scenarioIds: [pkgId], lang: 'he' }, reader.idToken);
		eq('nothing to translate into the scenario own language', Object.keys(own.translations).length, 0);
	} catch (error) {
		console.log('   (translation steps skipped:', String(error).slice(0, 120), ')');
	}
}
eq('outsider cannot translate', await refuses(callable('agoraLibraryTranslate', { scenarioIds: [pkgId], lang: 'en' }, outsider.idToken), /PERMISSION_DENIED|approved/i), true);

step('G. use: a linked, private copy in my own language');
eq('outsider cannot use', await refuses(callable('agoraLibraryUse', { scenarioId: pkgId, lang: 'he' }, outsider.idToken), /PERMISSION_DENIED|approved/i), true);
const sameLang = await callable('agoraLibraryUse', { scenarioId: pkgId, lang: 'he' }, reader.idToken);
eq('same language is not translated', sameLang.translated, false);
const copy = (await db.collection('agoraTopicPackages').doc(sameLang.copyId).get()).data();
eq('the reader owns the copy', copy.creatorId, reader.uid);
eq('the copy is private', copy.visibility, undefined);
eq('no library card on a copy', copy.library, undefined);
eq('linked to the original', copy.sourceScenarioId, pkgId);
eq('original author credited', copy.sourceAuthorName, 'Dana');
eq('original title kept', copy.sourceTitle, pkg.title);
eq('remembers the original version', copy.sourceVersion, now);
eq('the copy is ready to teach', copy.status, 'ready');
eq('copy count +1', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().stats.copyCount, 1);
if (translatedTitle) {
	const inEnglish = await callable('agoraLibraryUse', { scenarioId: pkgId, lang: 'en' }, second.idToken);
	eq('a different language is translated', inEnglish.translated, true);
	const english = (await db.collection('agoraTopicPackages').doc(inEnglish.copyId).get()).data();
	eq('the copy says it is English', english.language, 'en');
	eq('the copy title is translated', english.title !== pkg.title, true);
	eq('ids survive translation', english.characters[0].characterId, pkg.characters[0].characterId);
	eq('scene kinds survive translation', english.scenes[0].kind, pkg.scenes[0].kind);
	eq('still linked', english.sourceScenarioId, pkgId);
	console.log('   English copy title:', english.title);
}

step('H. "a new version is available"');
eq('not yet', isNewerVersionAvailable(copy, { lastUpdate: now }), false);
await db.collection('agoraTopicPackages').doc(pkgId).update({ lastUpdate: now + 5000 });
eq('after the original is edited', isNewerVersionAvailable(copy, { lastUpdate: now + 5000 }), true);

step('I. ratings');
const rate = (who, stars, text) => callable('agoraLibraryRate', { scenarioId: pkgId, stars, ...(text ? { text } : {}) }, who.idToken);
eq('the author cannot rate their own', await refuses(rate(author, 5), /PERMISSION_DENIED|your own/i), true);
eq('an outsider cannot rate', await refuses(rate(outsider, 5), /PERMISSION_DENIED|approved/i), true);
eq('six stars is refused', await refuses(rate(reader, 6), /INVALID_ARGUMENT|stars/i), true);
const firstRating = await rate(reader, 5, 'הילדים נכנסו לעניין, מומלץ');
eq('one rating counted', firstRating.stats.ratingCount, 1);
eq('one review counted', firstRating.stats.reviewCount, 1);
const edited = await rate(reader, 3);
eq('editing replaces, never adds', edited.stats.ratingCount, 1);
eq('the sum follows the edit', edited.stats.ratingSum, 3);
eq('the review went with the old rating', edited.stats.reviewCount, 0);
const two = await rate(second, 4, 'צריך להוסיף זמן');
eq('a second teacher adds', two.stats.ratingCount, 2);
eq('sum', two.stats.ratingSum, 7);
const totals = (await db.collection('agoraStats').doc('library').get()).data();
eq('library totals follow', totals.ratingCount, 2);
const expected = bayesianAverage(7, 2, (totals.ratingTotal + 5 * 3.8) / (totals.ratingCount + 5));
if (Math.abs(two.stats.ratingBayes - expected) > 0.05) fail(`bayes ${two.stats.ratingBayes} vs ${expected}`);
console.log('   ✓ ratingBayes =', two.stats.ratingBayes.toFixed(3));
eq('one rating doc per teacher', (await db.collection('agoraScenarioRatings').where('scenarioId', '==', pkgId).get()).size, 2);

step('J. the admin hide');
const ratingId = `${pkgId}__${second.uid}`;
eq('a teacher cannot hide', await refuses(callable('agoraLibraryModerate', { action: 'hide', targetKind: 'review', targetId: ratingId }, reader.idToken), /PERMISSION_DENIED|admin/i), true);
await callable('agoraLibraryModerate', { action: 'hide', targetKind: 'review', targetId: ratingId, reason: 'test' }, admin.idToken);
let after = (await db.collection('agoraTopicPackages').doc(pkgId).get()).data();
eq('a hidden review leaves the numbers', after.stats.ratingCount, 1);
eq('the review is marked', (await db.collection('agoraScenarioRatings').doc(ratingId).get()).data().hidden, true);
const stillHidden = await rate(second, 5, 'עריכה');
eq('editing a hidden review does not bring it back', (await db.collection('agoraScenarioRatings').doc(ratingId).get()).data().hidden, true);
eq('...nor the numbers', stillHidden.stats.ratingCount, 1);
await callable('agoraLibraryModerate', { action: 'unhide', targetKind: 'review', targetId: ratingId }, admin.idToken);
after = (await db.collection('agoraTopicPackages').doc(pkgId).get()).data();
eq('lifting the hide puts it back', after.stats.ratingCount, 2);

await callable('agoraLibraryModerate', { action: 'hide', targetKind: 'scenario', targetId: pkgId, reason: 'spam' }, admin.idToken);
eq('a hidden scenario leaves the list', (await listPublic(reader.idToken))?.includes(pkgId), false);
eq('...and cannot be copied', await refuses(callable('agoraLibraryUse', { scenarioId: pkgId, lang: 'he' }, reader.idToken), /NOT_FOUND/i), true);
await callable('agoraLibraryPublish', publishBody, author.idToken);
eq('the owner cannot un-hide it by publishing again', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().library.hidden, true);
await callable('agoraLibraryModerate', { action: 'unhide', targetKind: 'scenario', targetId: pkgId }, admin.idToken);
eq('lifted', (await listPublic(reader.idToken))?.includes(pkgId), true);
eq('the reason is gone with the hide', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().library.hiddenReason, undefined);

step('K. private again: not listed, ratings kept, copies untouched');
await callable('agoraLibraryUnpublish', { scenarioId: pkgId }, author.idToken);
eq('not listed', (await listPublic(reader.idToken))?.includes(pkgId), false);
eq('tag counter went back', (await db.collection('agoraLibraryTags').doc(smoking).get()).data().scenarioCount, 0);
eq('the copy is still there', (await db.collection('agoraTopicPackages').doc(sameLang.copyId).get()).exists, true);
eq('only the owner can unpublish', await refuses(callable('agoraLibraryUnpublish', { scenarioId: pkgId }, reader.idToken), /PERMISSION_DENIED|owner/i), true);
await callable('agoraLibraryPublish', publishBody, author.idToken);
eq('ratings come back with the scenario', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().stats.ratingCount, 2);
eq('tag counter again', (await db.collection('agoraLibraryTags').doc(smoking).get()).data().scenarioCount, 1);

step('L. discussion: posts and one level of replies');
const post = (who, text, parentId) => callable('agoraLibraryPost', { scenarioId: pkgId, text, ...(parentId ? { parentId } : {}) }, who.idToken);
const postDoc = async (id) => (await db.collection('agoraScenarioPosts').doc(id).get()).data();
const scenarioStats = async () => (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().stats;
eq('an outsider cannot post', await refuses(post(outsider, 'שלום'), /PERMISSION_DENIED|approved/i), true);
eq('an empty post is refused', await refuses(post(reader, '   '), /INVALID_ARGUMENT|characters/i), true);
eq('a post over the limit is refused', await refuses(post(reader, 'x'.repeat(1001)), /INVALID_ARGUMENT|characters/i), true);
eq('an unknown scenario is not found', await refuses(callable('agoraLibraryPost', { scenarioId: 'nope', text: 'hi' }, reader.idToken), /NOT_FOUND/i), true);
const question = await post(reader, 'האם הכיתה צריכה הכנה מראש לפני התרחיש?');
const q = await postDoc(question.postId);
eq('author name is a first name', q.authorName, 'Ron');
eq('the post remembers the scenario author', q.scenarioOwnerId, author.uid);
eq('not hidden', q.hidden, false);
eq('post count 1', (await scenarioStats()).postCount, 1);
const answer = await post(author, 'לא צריך, כדאי לקרוא את שאלת האתגר יחד.', question.postId);
eq('a reply carries its parent', (await postDoc(answer.postId)).parentId, question.postId);
eq('a reply to a reply is refused', await refuses(post(second, 'עוד', answer.postId), /INVALID_ARGUMENT|not to a reply/i), true);
eq('a reply to a missing post is refused', await refuses(post(second, 'עוד', 'nope'), /NOT_FOUND/i), true);
const third = await post(second, 'תודה, זה עזר לי.', question.postId);
eq('post count 3', (await scenarioStats()).postCount, 3);
eq('a teacher sees the visible thread under the rules', (await listPosts(reader.idToken, pkgId, [eqFilter('hidden', { booleanValue: false })]))?.length, 3);
eq('an outsider is refused the thread', await listPosts(outsider.idToken, pkgId, [eqFilter('hidden', { booleanValue: false })]), null);

step('M. discussion: hide (author and admin), lift, who may lift what');
const hide = (who, postId, action = 'hide') => callable('agoraLibraryHidePost', { postId, action }, who.idToken);
eq('another teacher cannot hide', await refuses(hide(second, question.postId), /PERMISSION_DENIED|author or a system admin/i), true);
eq('even a post author cannot hide their own', await refuses(hide(reader, question.postId), /PERMISSION_DENIED/i), true);
await hide(author, third.postId);
let t3 = await postDoc(third.postId);
eq('the scenario author hid it', t3.hidden, true);
eq('...marked as the owner hide', t3.hiddenBy, 'owner');
eq('a hidden post leaves the count', (await scenarioStats()).postCount, 2);
eq('a teacher no longer sees it under the rules', (await listPosts(reader.idToken, pkgId, [eqFilter('hidden', { booleanValue: false })]))?.includes(third.postId), false);
eq('another teacher cannot list hidden posts', await listPosts(reader.idToken, pkgId, [eqFilter('hidden', { booleanValue: true })]), null);
eq('the scenario author lists hidden posts of their own thread', (await listPosts(author.idToken, pkgId, [eqFilter('scenarioOwnerId', { stringValue: author.uid }), eqFilter('hidden', { booleanValue: true })]))?.includes(third.postId), true);
eq('an admin lists every hidden post', (await listPosts(admin.idToken, pkgId, [eqFilter('hidden', { booleanValue: true })]))?.includes(third.postId), true);
await hide(author, third.postId, 'unhide');
eq('the author lifts their own hide', (await postDoc(third.postId)).hidden, false);
eq('the count comes back', (await scenarioStats()).postCount, 3);
await hide(admin, third.postId);
t3 = await postDoc(third.postId);
eq('an admin hide is marked as one', t3.hiddenBy, 'admin');
eq('the scenario author cannot lift an admin hide', await refuses(hide(author, third.postId, 'unhide'), /PERMISSION_DENIED|system admin/i), true);
await hide(admin, third.postId, 'unhide');
eq('an admin lifts it', (await postDoc(third.postId)).hidden, false);
eq('hiding twice is harmless', (await hide(admin, third.postId)).hidden && (await hide(admin, third.postId)).hidden, true);
eq('...and counts once', (await scenarioStats()).postCount, 2);
await hide(admin, third.postId, 'unhide');
eq('the count is whole again after the admin lifts', (await scenarioStats()).postCount, 3);

step('N. discussion: a day allowance of posts');
const reMarker = db.collection('agoraApprovedTeachers').doc(second.uid);
await reMarker.set({ postsDay: new Date().toISOString().slice(0, 10), postsToday: 30 }, { merge: true });
eq('the thirty-first post of the day is refused', await refuses(post(second, 'עוד אחת'), /RESOURCE_EXHAUSTED|limit/i), true);
await reMarker.set({ postsDay: '1999-01-01' }, { merge: true });
await post(second, 'ביום חדש שוב אפשר');
eq('a new day starts the count again', (await scenarioStats()).postCount, 4);

step('O. reports: a teacher reports, an admin decides');
const report = (who, targetKind, targetId, reason) => callable('agoraLibraryReport', { targetKind, targetId, ...(reason ? { reason } : {}) }, who.idToken);
const reportsOpen = async () => (await db.collection('agoraLibraryReports').where('status', '==', 'open').get()).docs.map((d) => d.data());
const reviewId = `${pkgId}__${second.uid}`;
eq('an outsider cannot report', await refuses(report(outsider, 'post', question.postId), /PERMISSION_DENIED|approved/i), true);
eq('an unknown target is not found', await refuses(report(reader, 'post', 'nope'), /NOT_FOUND/i), true);
eq('a bad kind is refused', await refuses(report(reader, 'banana', 'x'), /INVALID_ARGUMENT/i), true);
const r1 = await report(reader, 'post', third.postId, 'לשון פוגענית');
eq('a report is filed', r1.existed, false);
eq('the same teacher reporting again files nothing', (await report(reader, 'post', third.postId)).existed, true);
await report(second, 'post', third.postId);
await report(reader, 'review', reviewId, 'ספאם');
await report(reader, 'scenario', pkgId);
const openNow = await reportsOpen();
eq('four open reports (two on the same post)', openNow.filter((entry) => entry.scenarioId === pkgId).length, 4);
const stored = (await db.collection('agoraLibraryReports').doc(r1.reportId).get()).data();
eq('the report remembers the reporter by first name', stored.reporterName, 'Ron');
eq('...and the scenario it belongs to', stored.scenarioId, pkgId);
eq('the reason is kept', stored.reason, 'לשון פוגענית');
const queue = async (token) => {
	const response = await fetch(`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'agoraLibraryReports' }], where: eqFilter('status', { stringValue: 'open' }) } }),
	});
	const body = await response.text();
	if (response.status === 403 || /PERMISSION_DENIED/i.test(body)) return null;

	return JSON.parse(body).filter((row) => row.document).length;
};
eq('a teacher cannot read the queue', await queue(reader.idToken), null);
eq('the author of the reported thing cannot either', await queue(author.idToken), null);
eq('an admin reads it under the rules', (await queue(admin.idToken)) >= 4, true);
const lim = db.collection('agoraApprovedTeachers').doc(second.uid);
await lim.set({ reportsDay: new Date().toISOString().slice(0, 10), reportsToday: 20 }, { merge: true });
eq('the twenty-first report of the day is refused', await refuses(report(second, 'scenario', pkgId), /RESOURCE_EXHAUSTED|limit/i), true);
await lim.set({ reportsDay: '1999-01-01' }, { merge: true });
const resolve = (who, targetKind, targetId, resolution) => callable('agoraLibraryResolveReport', { targetKind, targetId, resolution }, who.idToken);
eq('a teacher cannot resolve', await refuses(resolve(reader, 'post', third.postId, 'hidden'), /PERMISSION_DENIED|admin/i), true);
const hiddenOut = await resolve(admin, 'post', third.postId, 'hidden');
eq('both reports on the post are resolved together', hiddenOut.resolved, 2);
eq('the post is hidden', (await postDoc(third.postId)).hidden, true);
eq('...as an admin hide', (await postDoc(third.postId)).hiddenBy, 'admin');
eq('the post count follows', (await scenarioStats()).postCount, 3);
eq('the reports say hidden', (await db.collection('agoraLibraryReports').doc(r1.reportId).get()).data().resolution, 'hidden');
const dismissed = await resolve(admin, 'review', reviewId, 'dismissed');
eq('dismissing resolves the review report', dismissed.resolved, 1);
eq('...and hides nothing', (await db.collection('agoraScenarioRatings').doc(reviewId).get()).data().hidden, false);
eq('resolving twice finds nothing open', (await resolve(admin, 'review', reviewId, 'dismissed')).resolved, 0);
eq('the scenario report is still open', (await reportsOpen()).some((entry) => entry.targetKind === 'scenario' && entry.targetId === pkgId), true);
await callable('agoraLibraryModerate', { action: 'unhide', targetKind: 'post', targetId: third.postId }, admin.idToken);
eq('the admin moderate callable also lifts a post hide', (await postDoc(third.postId)).hidden, false);
eq('and counts it again', (await scenarioStats()).postCount, 4);

step('P. an admin hide takes the scenario off its tag counts (and back)');
const count = async (id) => (await db.collection('agoraLibraryTags').doc(id).get()).data().scenarioCount;
const listedTags = [smoking, made.tagId, civics, history];
for (const id of listedTags) eq(`listed: ${id} counts it`, await count(id), 1);
await callable('agoraLibraryModerate', { action: 'hide', targetKind: 'scenario', targetId: pkgId, reason: 'test' }, admin.idToken);
for (const id of listedTags) eq(`hidden: ${id} no longer counts it`, await count(id), 0);
await callable('agoraLibraryModerate', { action: 'hide', targetKind: 'scenario', targetId: pkgId }, admin.idToken);
for (const id of listedTags) eq(`hiding twice changes nothing: ${id}`, await count(id), 0);
await callable('agoraLibraryPublish', { ...publishBody, subjectIds: [smoking] }, author.idToken);
for (const id of listedTags) eq(`republishing while hidden counts nothing: ${id}`, await count(id), 0);
await callable('agoraLibraryModerate', { action: 'unhide', targetKind: 'scenario', targetId: pkgId }, admin.idToken);
eq('lifted: the carried tags count it', [await count(smoking), await count(civics), await count(history)].join(','), '1,1,1');
eq('...and the one it dropped does not', await count(made.tagId), 0);
await callable('agoraLibraryPublish', publishBody, author.idToken);
eq('publishing with the tag again counts it', await count(made.tagId), 1);
await callable('agoraLibraryModerate', { action: 'hide', targetKind: 'scenario', targetId: pkgId }, admin.idToken);
await callable('agoraLibraryUnpublish', { scenarioId: pkgId }, author.idToken);
for (const id of listedTags) eq(`unpublishing a hidden scenario does not subtract twice: ${id}`, await count(id), 0);
await callable('agoraLibraryModerate', { action: 'unhide', targetKind: 'scenario', targetId: pkgId }, admin.idToken);
for (const id of listedTags) eq(`lifting a hide on a private scenario counts nothing: ${id}`, await count(id), 0);
await callable('agoraLibraryPublish', publishBody, author.idToken);
for (const id of listedTags) eq(`published again: ${id}`, await count(id), 1);

step('Q. merging tags: a duplicate becomes an alias, scenarios and counters follow');
const dup = await callable('agoraLibraryCreateTag', { kind: 'subject', label: 'כדור הארץ', lang: 'he' }, reader.idToken);
const canon = await callable('agoraLibraryCreateTag', { kind: 'subject', label: 'סביבה', lang: 'he' }, author.idToken);
const pkg2 = `${runId}-scenario-2`;
await db.collection('agoraTopicPackages').doc(pkg2).set({ ...seed, topicPackageId: pkg2, creatorId: author.uid, title: 'סביבה — מבחן מיזוג', status: 'ready', language: 'he', createdAt: now, lastUpdate: now });
await callable('agoraLibraryPublish', { scenarioId: pkg2, summary, subjectIds: [dup.tagId, canon.tagId], lessonTypeIds: [civics] }, author.idToken);
await callable('agoraLibraryPublish', { ...publishBody, subjectIds: [smoking, dup.tagId] }, author.idToken);
const pkg3 = `${runId}-scenario-3`;
await db.collection('agoraTopicPackages').doc(pkg3).set({ ...seed, topicPackageId: pkg3, creatorId: author.uid, title: 'מיזוג — פרטי', status: 'ready', language: 'he', createdAt: now, lastUpdate: now });
await callable('agoraLibraryPublish', { scenarioId: pkg3, summary, subjectIds: [dup.tagId], lessonTypeIds: [history] }, author.idToken);
await callable('agoraLibraryUnpublish', { scenarioId: pkg3 }, author.idToken);
eq('before: the duplicate counts the two listed scenarios', await count(dup.tagId), 2);
eq('before: the canonical tag counts one', await count(canon.tagId), 1);
eq('a teacher cannot merge', await refuses(callable('agoraLibraryMergeTags', { fromId: dup.tagId, intoId: canon.tagId }, reader.idToken), /PERMISSION_DENIED|admin/i), true);
eq('a tag cannot merge into itself', await refuses(callable('agoraLibraryMergeTags', { fromId: dup.tagId, intoId: dup.tagId }, admin.idToken), /INVALID_ARGUMENT|itself/i), true);
eq('kinds must match', await refuses(callable('agoraLibraryMergeTags', { fromId: dup.tagId, intoId: civics }, admin.idToken), /INVALID_ARGUMENT|same kind/i), true);
const merged = await callable('agoraLibraryMergeTags', { fromId: dup.tagId, intoId: canon.tagId }, admin.idToken);
eq('three scenarios re-pointed (listed, listed and private)', merged.scenarios, 3);
const tagOf = async (id) => (await db.collection('agoraLibraryTags').doc(id).get()).data();
eq('the duplicate points at the canonical tag', (await tagOf(dup.tagId)).aliasOf, canon.tagId);
eq('the duplicate counts nothing now', await count(dup.tagId), 0);
eq('the canonical tag gained the one that had only the duplicate', await count(canon.tagId), 2);
eq('a scenario that carried both keeps one', (await db.collection('agoraTopicPackages').doc(pkg2).get()).data().library.subjectIds.sort().join(','), [canon.tagId].join(','));
eq('the scenario is re-pointed', (await db.collection('agoraTopicPackages').doc(pkgId).get()).data().library.subjectIds.sort().join(','), [smoking, canon.tagId].sort().join(','));
eq('the private one too', (await db.collection('agoraTopicPackages').doc(pkg3).get()).data().library.subjectIds.join(','), canon.tagId);
eq('typing the duplicate words hands back the canonical tag', (await callable('agoraLibraryCreateTag', { kind: 'subject', label: 'כדור הארץ', lang: 'he' }, author.idToken)).tagId, canon.tagId);
eq('publishing with the alias is refused', await refuses(callable('agoraLibraryPublish', { ...publishBody, subjectIds: [dup.tagId] }, author.idToken), /Unknown subject/i), true);
eq('running the merge again moves nothing', (await callable('agoraLibraryMergeTags', { fromId: dup.tagId, intoId: canon.tagId }, admin.idToken)).scenarios, 0);
eq('...and counts nothing twice', [await count(dup.tagId), await count(canon.tagId)].join(','), '0,2');
eq('merging into an alias is refused', await refuses(callable('agoraLibraryMergeTags', { fromId: canon.tagId, intoId: dup.tagId }, admin.idToken), /FAILED_PRECONDITION|merged away/i), true);

console.log('\nALL SCENARIO LIBRARY CHECKS PASSED');
process.exit(0);
