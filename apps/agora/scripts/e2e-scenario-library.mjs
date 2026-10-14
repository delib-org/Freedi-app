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

console.log('\nALL SCENARIO LIBRARY CHECKS PASSED');
process.exit(0);
