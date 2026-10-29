import { FieldPath } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_HOME_KIND,
	CLASS_HOME_PREFIX,
	Collections,
	TEACHER_HOME_PREFIX,
} from '@freedi/shared-types';
import type { AgoraClass, Statement } from '@freedi/shared-types';
import { AGORA_CLASSES_COLLECTION } from '../classroom/classHome';

/**
 * READ-ONLY scan, to run on production BEFORE the lesson-plan rules ship: lists
 * every statement whose id starts with `jcClass_` / `jcTeacher_`. Until the new
 * rules refuse it, any signed-in client can create such a statement, and a
 * squatted home makes classStartLesson refuse that teacher or class
 * ("That home id is taken"). Each doc is judged with the same trust test the
 * server uses (classHome.ts isHomeOf): genuine homes are the server's; anything
 * else is a squat to inspect and delete by hand. Writes nothing.
 */

export type HomeIdVerdict = 'genuine' | 'squat';

export interface HomeIdFinding {
	statementId: string;
	kind: 'class' | 'teacher';
	creatorId: string;
	parentId: string;
	hasClassHome: boolean;
	verdict: HomeIdVerdict;
	reason: string;
}

/** Judges one statement found at a home id (pure; the class is read by the caller). */
export function classifyHomeIdDoc(
	statement: Partial<Statement> & { statementId: string },
	cls: Pick<AgoraClass, 'teacherIds' | 'joinClassHomeId'> | undefined,
): HomeIdFinding {
	const id = statement.statementId;
	const kind = id.startsWith(CLASS_HOME_PREFIX) ? 'class' : 'teacher';
	const creatorId = statement.creatorId || statement.creator?.uid || '';
	const link = statement.statementSettings?.classHome;
	const base = {
		statementId: id,
		kind,
		creatorId,
		parentId: statement.parentId ?? '',
		hasClassHome: !!link,
	} as const;
	const squat = (reason: string): HomeIdFinding => ({ ...base, verdict: 'squat', reason });
	if (statement.parentId !== 'top') return squat('not top-level');
	if (!link) return squat('no statementSettings.classHome');
	if (kind === 'teacher') {
		const uid = id.slice(TEACHER_HOME_PREFIX.length);
		if (link.kind !== CLASS_HOME_KIND.teacher || link.uid !== uid)
			return squat('classHome does not match the id');
		if (creatorId !== uid) return squat('created by someone other than the teacher');

		return { ...base, verdict: 'genuine', reason: 'teacher home' };
	}
	const classId = id.slice(CLASS_HOME_PREFIX.length);
	if (link.kind !== CLASS_HOME_KIND.class || link.classId !== classId) {
		return squat('classHome does not match the id');
	}
	if (!cls) return squat('no such Agora class');
	const teachers = Array.isArray(cls.teacherIds) ? cls.teacherIds : [];
	if (cls.joinClassHomeId === id || teachers.includes(creatorId)) {
		return { ...base, verdict: 'genuine', reason: 'class home' };
	}

	return squat('not linked from the class and not made by its teacher');
}

/**
 * U+F8FF, the last code point of the Private Use Area: `prefix + it` sorts after
 * every id that starts with `prefix`, so [prefix, prefix + U+F8FF) is a prefix range.
 */
const PREFIX_RANGE_END = '\uf8ff';

async function docsWithPrefix(firestore: Firestore, prefix: string): Promise<Statement[]> {
	const snap = await firestore
		.collection(Collections.statements)
		.where(FieldPath.documentId(), '>=', prefix)
		.where(FieldPath.documentId(), '<', `${prefix}${PREFIX_RANGE_END}`)
		.get();

	return snap.docs.map((d) => ({ ...(d.data() as Statement), statementId: d.id }));
}

/** Scans both prefixes; reads the Agora class of each class-home id. */
export async function scanClassHomeIds(firestore: Firestore): Promise<HomeIdFinding[]> {
	const [classDocs, teacherDocs] = await Promise.all([
		docsWithPrefix(firestore, CLASS_HOME_PREFIX),
		docsWithPrefix(firestore, TEACHER_HOME_PREFIX),
	]);
	const findings: HomeIdFinding[] = [];
	for (const statement of classDocs) {
		const classId = statement.statementId.slice(CLASS_HOME_PREFIX.length);
		const cls = classId
			? await firestore.collection(AGORA_CLASSES_COLLECTION).doc(classId).get()
			: undefined;
		findings.push(
			classifyHomeIdDoc(statement, cls?.exists ? (cls.data() as AgoraClass) : undefined),
		);
	}
	for (const statement of teacherDocs) findings.push(classifyHomeIdDoc(statement, undefined));

	return findings;
}

export function formatHomeIdScan(findings: readonly HomeIdFinding[]): string {
	const squats = findings.filter((f) => f.verdict === 'squat');
	const lines = findings.map(
		(f) =>
			`- ${f.verdict.toUpperCase()} ${f.statementId} kind=${f.kind} creator=${f.creatorId || '?'}` +
			` parent=${f.parentId || '?'} classHome=${f.hasClassHome} (${f.reason})`,
	);

	return ['', ...lines, '', `Found ${findings.length} home ids: ${squats.length} squat(s).`].join(
		'\n',
	);
}
