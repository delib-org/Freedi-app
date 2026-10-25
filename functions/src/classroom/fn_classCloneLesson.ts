import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig, getRandomUID } from '@freedi/shared-types';
import type {
	ClassCloneLessonRequest,
	ClassCloneLessonResponse,
	Statement,
	User,
} from '@freedi/shared-types';
import { db } from '../db';
import { isWorkspaceAdmin, loadMain, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { buildLessonCopy, generateClassCode, isLesson } from './cloneLesson';

/**
 * `classCloneLesson` (admin of the source): a new lesson with the source's
 * plan (see cloneLesson.ts for exactly what travels). One transaction creates
 * the new main statement, its questions, its intro paragraphs and its class
 * code, so there is never a lesson without a code. The caller must own the
 * source (checked before any child is read). `newMainId` comes from the client
 * and makes a retry safe: the second call finds the lesson and returns it.
 * The creator's subscription is not written here: `onStatementCreated` writes
 * it (with a plain `set`) for every new statement.
 */

/** Free-code attempts inside one transaction before giving up. */
export const CLONE_CODE_MAX_ATTEMPTS = 8;
const CLASS_CODES = 'classCodes';
const MAX_TITLE_LENGTH = 200;

function optionalTitle(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string' || value.length > MAX_TITLE_LENGTH) {
		throw new ClassroomError('invalid-argument', 'title is not valid');
	}

	return value;
}

function creatorOf(main: Statement, uid: string): User {
	if (main.creator?.uid === uid) return main.creator;

	return { uid, displayName: '' };
}

export async function cloneLesson(
	firestore: Firestore,
	actorUid: string,
	req: ClassCloneLessonRequest,
	now: () => number = Date.now,
	random: () => number = Math.random,
	newId: () => string = getRandomUID,
): Promise<ClassCloneLessonResponse> {
	const sourceId = requireId(req?.sourceMainId, 'sourceMainId');
	const newMainId = requireId(req?.newMainId, 'newMainId');
	const title = optionalTitle(req?.title);
	if (sourceId === newMainId) {
		throw new ClassroomError('invalid-argument', 'newMainId must be a new id');
	}

	// Ownership first: nothing below the source is read for someone else.
	const source = await loadMain(firestore, sourceId);
	if (!(await isWorkspaceAdmin(firestore, sourceId, actorUid, source))) {
		throw new ClassroomError('permission-denied', 'You can only copy your own lessons');
	}
	if (!isLesson(source)) throw new ClassroomError('failed-precondition', 'This is not a lesson');

	const statements = firestore.collection(Collections.statements);
	const newMainRef = statements.doc(newMainId);

	return firestore.runTransaction(async (tx) => {
		const existing = await tx.get(newMainRef);
		if (existing.exists) {
			const found = existing.data() as Statement;
			if (found.creatorId === actorUid && found.sourceLessonId === sourceId) {
				return {
					mainId: newMainId,
					classCode: found.statementSettings?.classCode ?? '',
					reused: true,
				};
			}
			throw new ClassroomError('already-exists', 'That lesson id is taken');
		}

		const questionSnap = await tx.get(
			statements
				.where('parentId', '==', sourceId)
				.where('statementType', '==', StatementType.question),
		);
		const paragraphSnap = await tx.get(
			statements
				.where('parentId', '==', sourceId)
				.where('statementType', '==', StatementType.paragraph),
		);
		const children = [...questionSnap.docs, ...paragraphSnap.docs].map(
			(d) => d.data() as Statement,
		);

		let classCode: string | null = null;
		for (let attempt = 0; attempt < CLONE_CODE_MAX_ATTEMPTS && !classCode; attempt++) {
			const candidate = generateClassCode(random);
			if (!(await tx.get(firestore.collection(CLASS_CODES).doc(candidate))).exists) {
				classCode = candidate;
			}
		}
		if (!classCode) {
			throw new ClassroomError('resource-exhausted', 'No free class code, try again');
		}

		const at = now();
		const copy = buildLessonCopy({
			source,
			children,
			newMainId,
			title,
			creator: creatorOf(source, actorUid),
			classCode,
			now: at,
			newId,
		});
		tx.create(newMainRef, copy.main);
		for (const child of [...copy.questions, ...copy.paragraphs]) {
			tx.create(statements.doc(child.statementId), child);
		}
		tx.create(firestore.collection(CLASS_CODES).doc(classCode), {
			mainId: newMainId,
			createdAt: at,
		});

		return { mainId: newMainId, classCode, reused: false };
	});
}

export const classCloneLesson = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassCloneLessonRequest>): Promise<ClassCloneLessonResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await cloneLesson(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCloneLesson',
				userId: uid,
				statementId: request.data?.sourceMainId,
				metadata: { newMainId: request.data?.newMainId },
			});
		}
	},
);
