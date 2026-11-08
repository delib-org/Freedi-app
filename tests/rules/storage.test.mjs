import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { FIRESTORE_PORT, seed } from './helpers.mjs';

/**
 * storage.rules calls into Firestore, so these need BOTH emulators, started
 * together. Set STORAGE_EMULATOR_PORT to run them; without it the suite is
 * skipped, because `npm run test:rules:exec` only starts Firestore.
 */
const STORAGE_PORT = process.env.STORAGE_EMULATOR_PORT;
const HOST = '127.0.0.1';
// The Storage emulator answers firestore.get()/exists() from the project the
// emulators were STARTED with, so this must be that project. With a non-demo
// id every upload under these rules was denied, so it must be a `demo-` one.
// Start them with: firebase emulators:start --project demo-freedi-rules-storage
const STORAGE_PROJECT_ID = process.env.STORAGE_EMULATOR_PROJECT ?? 'demo-freedi-rules-storage';
// The emulator's bucket outlives a run, and these rules refuse to replace an
// object, so a test that expects a fresh upload needs a name no run has used.
const RUN = Date.now();
const BYTES = new Uint8Array([1, 2, 3, 4]);
const PNG = { contentType: 'image/png' };
const SVG = { contentType: 'image/svg+xml' };
const VIDEO = { contentType: 'video/mp4' };
const PDF = { contentType: 'application/pdf' };

const ME = 'user-me';
const ANON = 'anon-visitor';
const TEACHER = 'teacher-owner';
const OTHER_TEACHER = 'teacher-other';
const SIGN_OWNER = 'sign-owner';
const SIGN_ADMIN = 'sign-admin';
const SIGN_VIEWER = 'sign-viewer';
const STATEMENT_ADMIN = 'statement-admin';
const STATEMENT = 'statement-1';
const SIGN_DOC = 'sign-doc-1';
const PACKAGE = 'topic-package-1';

describe('storage.rules', { skip: STORAGE_PORT ? false : 'STORAGE_EMULATOR_PORT is not set' }, () => {
	let env;

	before(async () => {
		env = await initializeTestEnvironment({
			projectId: STORAGE_PROJECT_ID,
			firestore: {
				rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
				host: HOST,
				port: FIRESTORE_PORT,
			},
			storage: {
				rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'),
				host: HOST,
				port: Number(STORAGE_PORT),
			},
		});
		await env.clearStorage();
		await env.clearFirestore();
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statementsSubscribe', `${STATEMENT_ADMIN}--${STATEMENT}`), {
				statementId: STATEMENT,
				userId: STATEMENT_ADMIN,
				role: 'admin',
			});
			await setDoc(doc(db, 'statements', SIGN_DOC), { statementId: SIGN_DOC, creatorId: SIGN_OWNER });
			await setDoc(doc(db, 'documentCollaborators', SIGN_DOC, 'collaborators', SIGN_ADMIN), {
				permissionLevel: 'admin',
			});
			await setDoc(doc(db, 'documentCollaborators', SIGN_DOC, 'collaborators', SIGN_VIEWER), {
				permissionLevel: 'viewer',
			});
			await setDoc(doc(db, 'agoraTopicPackages', PACKAGE), { topicPackageId: PACKAGE, creatorId: TEACHER });
		});
		await env.withSecurityRulesDisabled(async (context) => {
			const storage = context.storage();
			await uploadBytes(ref(storage, `statements/${STATEMENT}/existing.png`), BYTES, PNG);
			await uploadBytes(ref(storage, `logos/${SIGN_DOC}/existing.png`), BYTES, PNG);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	const storageOf = (uid) =>
		env.authenticatedContext(uid, uid === ANON ? { firebase: { sign_in_provider: 'anonymous' } } : {}).storage();
	const upload = (uid, path, metadata = PNG) => uploadBytes(ref(storageOf(uid), path), BYTES, metadata);

	describe('statements', () => {
		it('lets an anonymous participant add a picture with a fresh name', async () => {
			await assertSucceeds(upload(ANON, `statements/${STATEMENT}/imgId-${RUN}`));
		});

		it('rejects replacing a picture that already exists', async () => {
			await assertFails(upload(ANON, `statements/${STATEMENT}/existing.png`));
		});

		it('rejects an SVG from a participant', async () => {
			await assertFails(upload(ANON, `statements/${STATEMENT}/x.svg`, SVG));
			await assertFails(upload(ANON, `statements/${STATEMENT}/anchor_icons/x.svg`, SVG));
		});

		it('rejects SVG smuggled through a content-type variant', async () => {
			await assertFails(
				upload(ANON, `statements/${STATEMENT}/y.svg`, { contentType: 'IMAGE/SVG+xml' }),
			);
		});

		it('lets a statement admin upload an SVG anchor icon, and only there', async () => {
			await assertSucceeds(upload(STATEMENT_ADMIN, `statements/${STATEMENT}/anchor_icons/${RUN}_icon_32x32.png`, SVG));
			await assertFails(upload(STATEMENT_ADMIN, `statements/${STATEMENT}/elsewhere.svg`, SVG));
		});

		it('keeps pictures public', async () => {
			const unauth = env.unauthenticatedContext().storage();
			await assertSucceeds(getBytes(ref(unauth, `statements/${STATEMENT}/existing.png`)));
		});
	});

	describe('server-only folders', () => {
		it('rejects client uploads to anchor_icons and survey logos', async () => {
			await assertFails(upload(ANON, `anchor_icons/${STATEMENT}/x.png`));
			await assertFails(upload(ME, `surveys/s1/logos/x.png`));
		});
	});

	describe('Sign logos', () => {
		it('lets the document owner and an admin collaborator upload, SVG included', async () => {
			await assertSucceeds(upload(SIGN_OWNER, `logos/${SIGN_DOC}/1.png`));
			await assertSucceeds(upload(SIGN_ADMIN, `logos/${SIGN_DOC}/2.svg`, SVG));
		});

		it('rejects anyone else, including a viewer collaborator', async () => {
			await assertFails(upload(ANON, `logos/${SIGN_DOC}/3.png`));
			await assertFails(upload(ANON, `logos/${SIGN_DOC}/existing.png`));
			await assertFails(upload(SIGN_VIEWER, `logos/${SIGN_DOC}/4.png`));
			await assertFails(upload(SIGN_ADMIN, 'logos/no-such-doc/5.png'));
		});
	});

	describe('Agora media', () => {
		it('lets the package’s teacher upload a video and an image', async () => {
			await assertSucceeds(upload(TEACHER, `agora/${PACKAGE}/scene-1-film.mp4`, VIDEO));
			await assertSucceeds(upload(TEACHER, `agora/${PACKAGE}/scene-1-img-a.png`));
		});

		it('lets the teacher re-upload a file of the same name', async () => {
			await assertSucceeds(upload(TEACHER, `agora/${PACKAGE}/scene-1-film.mp4`, VIDEO));
		});

		it('rejects an anonymous upload and another teacher', async () => {
			await assertFails(upload(ANON, `agora/${PACKAGE}/x.mp4`, VIDEO));
			await assertFails(upload(OTHER_TEACHER, `agora/${PACKAGE}/x.mp4`, VIDEO));
		});

		it('rejects a video in the materials folder', async () => {
			await assertFails(upload(TEACHER, `agora/${PACKAGE}/materials/x.mp4`, VIDEO));
		});

		it('rejects an SVG in the package folder', async () => {
			await assertFails(upload(TEACHER, `agora/${PACKAGE}/x.svg`, SVG));
		});

		it('lets the teacher add a material PDF and rejects anyone else', async () => {
			await assertSucceeds(upload(TEACHER, `agora/${PACKAGE}/materials/1-report.pdf`, PDF));
			await assertFails(upload(ANON, `agora/${PACKAGE}/materials/2-report.pdf`, PDF));
		});
	});
});
