/**
 * join-class classroom seed (emulator only). Shared fixtures for lanes C1-C5.
 *
 * Creates, with firebase-admin against the emulators:
 *   - a teacher auth user (admin of the workspace) and N student auth users
 *   - the lesson workspace (main statement) with lessonPlan, classCode, classCodes/{code}
 *   - 3 guiding questions + 1 challenge question (classRole)
 *   - a subscription per student with side / camp (+ tableId when --seated)
 *   - --seated    6 classTables of 4 (classTables/{mainId}--{n}), students seated mixed by camp
 *   - --proposals 4 proposals under the challenge + 2 answers under guiding question 1,
 *                 each with a `classTable` marker and a `consensus` value
 *   - --support   decisionSupport on 16 of the students (for the summary screen)
 *
 * Usage (from repo root; emulators on the host in env, default alt ports shown):
 *   FIRESTORE_EMULATOR_HOST=localhost:8091 FIREBASE_AUTH_EMULATOR_HOST=localhost:9109 \
 *     npx tsx apps/join-class/scripts/seed-classroom.ts --step=4 --seated --proposals
 *   npm run seed:classroom -- --step=4 --seated        (default suite, 8081 / 9099)
 *   npm run seed:classroom:solo -- --step=4 --seated   (solo suite, 8101 / 9119)
 *
 * Flags: --step=<0..7> lessonPlan.stepIndex (default 0)   --students=<n> (default 24)
 *        --id=<mainId> fixed workspace id (default: random; re-running with the same
 *        id overwrites the same docs)
 *        --tokens      (C1) add a `customToken` to every student in the output
 * Output: JSON summary on stdout and in apps/join-class/scripts/.seed-output.json
 *   { projectId, mainId, classCode, stepIndex, teacher: {uid, email, password, customToken},
 *     students: [{uid, name, side, camp, tableId?}], guidingIds[], challengeId,
 *     tables: [{tableId, n, memberUids}], proposalIds[], answerIds[] }
 * Teacher sign-in: email + password (Auth emulator) or signInWithCustomToken(customToken).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
	Access,
	CLASS_TABLES_COLLECTION,
	Role,
	StatementType,
	campOf,
	classTableId,
	createStatementObject,
} from '@freedi/shared-types';
import type { Camp, ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.AGORA_PROJECT_ID ?? 'freedi-test';
const DEFAULT_FIRESTORE_HOST = 'localhost:8081';
const DEFAULT_AUTH_HOST = 'localhost:9099';
const DEFAULT_STUDENTS = 24;
const TABLE_SIZE = 4;
const SUPPORTED_STUDENTS = 16;
const CLASS_CODE_LENGTH = 6;
const STEP_KEYS = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'vote',
	'summary',
] as const;
const GUIDING_TITLES = [
	'What do you gain from the rule?',
	'What does it cost someone?',
	'Who is not heard in this debate?',
];
const CHALLENGE_TITLE = 'Should the school ban phones during lessons?';
const PROPOSAL_TEXTS = [
	'Phones stay in a box during lessons and come out at breaks.',
	'Phones are allowed only when the teacher asks for them.',
	'Each class agrees its own phone rule at the start of the year.',
	'No ban, but a visible timer of screen use for the class.',
];
const PROPOSAL_CONSENSUS = [0.72, 0.64, 0.48, 0.31];
const ANSWER_TEXTS = [
	'Fewer distractions, so lessons move faster.',
	'Students who need the phone for health are left out.',
];
const ANSWER_CONSENSUS = [0.55, 0.4];

const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const numArg = (name: string, fallback: number): number => {
	const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
	const parsed = raw ? Number(raw) : NaN;

	return Number.isFinite(parsed) ? parsed : fallback;
};
const strArg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST =
	process.env.FIREBASE_AUTH_EMULATOR_HOST ?? DEFAULT_AUTH_HOST;

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth(app);

interface SeedStudent {
	uid: string;
	name: string;
	side: number;
	camp: Camp;
	tableId?: string;
}

function randomDigits(length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) out += String(Math.floor(Math.random() * 10));

	return out;
}

/** Slider value of student i of n: thirds a / centre / b, spread inside each third. */
function sideOf(i: number, n: number): number {
	const third = Math.ceil(n / 3);
	const group = Math.floor(i / third);
	const within = (i % third) / Math.max(1, third - 1);
	if (group === 0) return Math.round(5 + within * 30); // 5..35  -> a
	if (group === 1) return Math.round(45 + within * 10); // 45..55 -> center
	return Math.round(65 + within * 30); // 65..95 -> b
}

async function ensureAuthUser(
	uid: string,
	displayName: string,
	email?: string,
	password?: string,
): Promise<void> {
	try {
		await auth.getUser(uid);
		await auth.updateUser(uid, { displayName, ...(email ? { email, password } : {}) });
	} catch {
		await auth.createUser({ uid, displayName, ...(email ? { email, password } : {}) });
	}
}

function creatorOf(uid: string, displayName: string): Statement['creator'] {
	return { uid, displayName, email: '', photoURL: '', isAnonymous: !uid.includes('teacher') };
}

function subscriptionOf(
	uid: string,
	displayName: string,
	role: Role,
	main: Statement,
	extra: Partial<StatementSubscription>,
): StatementSubscription {
	const now = Date.now();
	const subId = `${uid}--${main.statementId}`;

	return {
		statementsSubscribeId: subId,
		userId: uid,
		statementId: main.statementId,
		statement: main,
		user: creatorOf(uid, displayName),
		role,
		parentId: main.parentId,
		statementType: main.statementType,
		topParentId: main.statementId,
		lastUpdate: now,
		createdAt: now,
		openedInJoin: role === Role.admin ? now : undefined,
		...extra,
	};
}

function mustCreate(statement: Statement | undefined, what: string): Statement {
	if (!statement) throw new Error(`createStatementObject failed for ${what}`);

	return statement;
}

async function main(): Promise<void> {
	const stepIndex = Math.min(STEP_KEYS.length - 1, Math.max(0, numArg('step', 0)));
	const studentCount = numArg('students', DEFAULT_STUDENTS);
	const seated = flag('seated');
	const withProposals = flag('proposals');
	const withSupport = flag('support');
	const mainId = strArg('id') ?? `class-${randomDigits(8)}`;
	const classCode = randomDigits(CLASS_CODE_LENGTH);
	const teacherUid = `seed-teacher-${mainId}`;
	const teacherEmail = `${teacherUid}@example.test`;
	const teacherPassword = 'seed-pass-123';

	console.info(
		`[seed-classroom] ${PROJECT_ID} fs=${process.env.FIRESTORE_EMULATOR_HOST} auth=${process.env.FIREBASE_AUTH_EMULATOR_HOST} main=${mainId}`,
	);

	// ---- users ---------------------------------------------------------------
	await ensureAuthUser(teacherUid, 'Seed Teacher', teacherEmail, teacherPassword);
	const students: SeedStudent[] = [];
	for (let i = 0; i < studentCount; i++) {
		const uid = `seed-student-${mainId}-${String(i + 1).padStart(2, '0')}`;
		const side = sideOf(i, studentCount);
		students.push({ uid, name: `Student ${i + 1}`, side, camp: campOf(side) });
		await ensureAuthUser(uid, `Student ${i + 1}`);
	}

	// ---- workspace + questions ------------------------------------------------
	const teacherCreator = creatorOf(teacherUid, 'Seed Teacher');
	const baseSettings = {
		showEvaluation: true,
		enableAddEvaluationOption: true,
		enableAddVotingOption: true,
		enableSimilaritiesSearch: true,
		enableNavigationalElements: true,
	};
	const mainDraft = mustCreate(
		createStatementObject({
			statementId: mainId,
			statement: 'The phone rule (seed lesson)',
			statementType: StatementType.question,
			parentId: 'top',
			topParentId: mainId,
			creatorId: teacherUid,
			creator: teacherCreator,
			statementSettings: {
				...baseSettings,
				lessonPlan: { steps: [...STEP_KEYS], stepIndex },
				classCode,
			},
		}),
		'main',
	);
	const mainStatement: Statement = {
		...mainDraft,
		topParentId: mainId,
		membership: { access: Access.openToAll },
	};
	await db.doc(`statements/${mainId}`).set(mainStatement);
	await db.doc(`classCodes/${classCode}`).set({ mainId, createdAt: Date.now() });

	const makeQuestion = async (
		title: string,
		role: 'guiding' | 'challenge',
		order: number,
		hint?: string,
	): Promise<string> => {
		const q = mustCreate(
			createStatementObject({
				statement: title,
				statementType: StatementType.question,
				parentId: mainId,
				topParentId: mainId,
				parents: [mainId],
				creatorId: teacherUid,
				creator: teacherCreator,
				statementSettings: {
					...baseSettings,
					classRole: role,
					...(hint ? { hint } : {}),
					...(role === 'challenge' ? { roundPhase: 'write' as const } : {}),
				},
			}),
			title,
		);
		await db.doc(`statements/${q.statementId}`).set({ ...q, order });

		return q.statementId;
	};
	const guidingIds: string[] = [];
	for (let i = 0; i < GUIDING_TITLES.length; i++) {
		guidingIds.push(await makeQuestion(GUIDING_TITLES[i], 'guiding', i, `Hint ${i + 1}`));
	}
	const challengeId = await makeQuestion(CHALLENGE_TITLE, 'challenge', GUIDING_TITLES.length);

	// ---- tables (optional) ----------------------------------------------------
	const tables: ClassTable[] = [];
	if (seated) {
		const tableCount = Math.ceil(students.length / TABLE_SIZE);
		for (let k = 0; k < tableCount; k++) {
			const members = students.filter((_, i) => i % tableCount === k);
			const n = k + 1;
			const tableId = classTableId(mainId, n);
			for (const s of members) s.tableId = tableId;
			tables.push({
				tableId,
				mainId,
				n,
				memberUids: members.map((s) => s.uid),
				noDeviceMembers: [],
				step: 'pick',
				askerUid: null,
				turn: 1,
				writingMode: 'each',
				writingLocked: false,
				spokenUids: [],
				usedQuestionIds: [],
				updatedAt: Date.now(),
			});
		}
		for (const table of tables) await db.doc(`${CLASS_TABLES_COLLECTION}/${table.tableId}`).set(table);
	}

	// ---- subscriptions --------------------------------------------------------
	await db
		.doc(`statementsSubscribe/${teacherUid}--${mainId}`)
		.set(subscriptionOf(teacherUid, 'Seed Teacher', Role.admin, mainStatement, {}));
	for (let i = 0; i < students.length; i++) {
		const s = students[i];
		await db.doc(`statementsSubscribe/${s.uid}--${mainId}`).set(
			subscriptionOf(s.uid, s.name, Role.member, mainStatement, {
				side: s.side,
				camp: s.camp,
				tableId: s.tableId,
				decisionSupport: withSupport && i < SUPPORTED_STUDENTS ? supportFor(s.camp, i) : undefined,
			}),
		);
	}

	// ---- answers + proposals (optional) -----------------------------------------
	const proposalIds: string[] = [];
	const answerIds: string[] = [];
	if (withProposals) {
		const write = async (
			text: string,
			parentId: string,
			authorIndex: number,
			consensus: number,
			shared: boolean,
		): Promise<string> => {
			const author = students[authorIndex % students.length];
			const table = tables.find((tb) => tb.memberUids.includes(author.uid));
			const option = mustCreate(
				createStatementObject({
					statement: text,
					statementType: StatementType.option,
					parentId,
					topParentId: mainId,
					parents: [mainId, parentId],
					creatorId: author.uid,
					creator: creatorOf(author.uid, author.name),
					consensus,
				}),
				text,
			);
			await db.doc(`statements/${option.statementId}`).set({
				...option,
				classTable: {
					tableId: table?.tableId ?? classTableId(mainId, 1),
					shared,
					coAuthors: table?.memberUids ?? [author.uid],
				},
			});

			return option.statementId;
		};
		for (let i = 0; i < PROPOSAL_TEXTS.length; i++) {
			proposalIds.push(
				await write(PROPOSAL_TEXTS[i], challengeId, i * 5, PROPOSAL_CONSENSUS[i], false),
			);
		}
		for (let i = 0; i < ANSWER_TEXTS.length; i++) {
			answerIds.push(await write(ANSWER_TEXTS[i], guidingIds[0], i * 7, ANSWER_CONSENSUS[i], i === 0));
		}
	}

	// ---- output ---------------------------------------------------------------
	const customToken = await auth.createCustomToken(teacherUid);
	const studentsOut = flag('tokens') ? await withStudentTokens(students) : students;
	const summary = {
		projectId: PROJECT_ID,
		mainId,
		classCode,
		stepIndex,
		teacher: { uid: teacherUid, email: teacherEmail, password: teacherPassword, customToken },
		students: studentsOut,
		guidingIds,
		challengeId,
		tables: tables.map((t) => ({ tableId: t.tableId, n: t.n, memberUids: t.memberUids })),
		proposalIds,
		answerIds,
	};
	const json = JSON.stringify(summary, null, 2);
	const outPath = join(dirname(fileURLToPath(import.meta.url)), '.seed-output.json');
	writeFileSync(outPath, json);
	console.info(json);
	console.info(`[seed-classroom] wrote ${outPath}`);
}

// ============================================================================
// C1 (engine) additions — `--tokens`
// Adds `customToken` to every student in the output so e2e scripts and the
// engine smoke test (scripts/smoke-classroom-engine.ts) can act as a student:
// signInWithCustomToken(auth, token) in a browser context, or the Auth
// emulator's accounts:signInWithCustomToken REST call from node.
// ============================================================================
async function withStudentTokens(
	students: SeedStudent[],
): Promise<(SeedStudent & { customToken: string })[]> {
	return Promise.all(
		students.map(async (s) => ({ ...s, customToken: await auth.createCustomToken(s.uid) })),
	);
}
// ======================== end of C1 additions ===============================

/** Mixed support: the poles lean toward the decision, the centre is split. */
function supportFor(camp: Camp, i: number): number {
	if (camp === 'center') return i % 2 === 0 ? 0 : -0.5;

	return i % 3 === 0 ? 0.5 : 1;
}

main().catch((error: unknown) => {
	console.error('[seed-classroom] failed:', error);
	process.exit(1);
});
