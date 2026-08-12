/**
 * Fastlane — put a session on the screen you actually want to look at,
 * without playing the game to get there.
 *
 * Reaching the deliberation chat the honest way costs a teacher browser, two
 * student browsers, a sign-in that races anonymous auth, and every scene of
 * framing → perspectives → needs → positioning clicked through twice. That is
 * minutes of wall clock before the pixel under test is even rendered, and it
 * is re-paid on every retry.
 *
 * None of it is necessary. The teacher's whole contribution is three callables
 * (`agoraCreateSession`, `agoraAdvanceStage`) and the classmates' whole
 * contribution is participant docs plus proposal statements — all of which can
 * be written directly. `e2e-smoke.mjs` already proved the pattern for the
 * teacher; this generalises it.
 *
 * What the bots are NOT: they are not a simulation of students. They exist so
 * the screen has classmates to rate, camps to bridge, and a roster to render.
 * Anything that asserts on game BEHAVIOUR still has to drive real clients —
 * use this to skip the setup, never to skip the thing under test.
 */
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AgoraCamp, AgoraSession, AgoraStage } from '@freedi/shared-types';
import {
	AUTH_HOST,
	FIRESTORE_HOST,
	FUNCTIONS_BASE,
	TOPIC_PACKAGE_ID,
	VITE_HOST,
} from './preflight.mjs';

/**
 * `@freedi/shared-types` cannot be ESM-imported from plain Node: its ESM build
 * emits extensionless relative imports, which bundlers resolve and Node does
 * not. Its CJS build — the one the functions run on — is fine, so require it.
 * Types still come from the normal `import type` above, which is erased.
 *
 * The proposal builder is required the same way (tsx transpiles it on the fly)
 * rather than reimplemented here, so bot proposals cannot drift from the
 * documents real students write.
 */
const require = createRequire(import.meta.url);
const {
	AgoraDeviceMode,
	AgoraStage: AgoraStageEnum,
	Collections,
	createAgoraParticipantId,
	deriveCamp,
} = require('@freedi/shared-types') as typeof import('@freedi/shared-types');
const { buildProposalStatement } = require('../../src/lib/statementDocs') as typeof import('../../src/lib/statementDocs');

const IDENTITY = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

// The Admin SDK talks to the emulator through this env var, and it has to be
// set before the first getFirestore() — same contract as scripts/seed.ts.
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'freedi-test' });
const db = getFirestore(app);

export interface FastlaneBot {
	uid: string;
	idToken: string;
	participantId: string;
	anonName: string;
	campPosition: number;
	camp: AgoraCamp;
	/** Set when this bot posted a proposal */
	proposalId?: string;
}

export interface FastlaneResult {
	sessionId: string;
	code: string;
	/** Open this in a browser and you are a student in the session, at `stage` */
	joinUrl: string;
	teacherUid: string;
	teacherToken: string;
	stage: AgoraStage;
	bots: FastlaneBot[];
}

export interface FastlaneOptions {
	/** Where the session should already be when the browser arrives */
	stage?: AgoraStage;
	/** Bot classmates to enrol (they fill the roster and the camps) */
	students?: number;
	/** How many of those bots post a proposal (capped at `students`) */
	proposals?: number;
	topicPackageId?: string;
	/** Prefix for the teacher identity — a fresh one per run keeps home screens clean */
	runId?: string;
	quiet?: boolean;
}

/**
 * Proposal texts for the seeded French-Revolution package. Real sentences, in
 * the fixture's language, because a screen full of "proposal 1 / proposal 2"
 * tells you nothing about wrapping, RTL punctuation or card height — the very
 * things a look at the screen is for.
 */
const PROPOSAL_TEXTS = [
	'אספה לאומית שבה לכל מעמד יש קול שווה, אבל החלטות שנוגעות לרכוש דורשות רוב מיוחד — כך העם נשמע והאצולה לא נמחקת.',
	'מס מדורג על אדמות האצולה שכולו הולך למחסני תבואה עירוניים, עם ועדת פיקוח משותפת לשני הצדדים.',
	'ביטול זכויות היתר המשפטיות של האצולה, ובתמורה הבטחה חוקתית שאחוזות לא יוחרמו ולא יישרפו.',
	'בית משפט מעורב של אצילים ובורגנים לדיני לחם ומחירים, כדי שאף צד לא ירגיש שהחוק שייך רק לאחרים.',
	'מלוכה חוקתית: המלך נשאר סמל האחדות, אבל התקציב מאושר רק בידי נבחרי העם.',
	'תקופת מעבר של חמש שנים לרפורמות, עם לוח זמנים כתוב ומחייב — שינוי אמיתי, בלי הקפיצה לתהום.',
];

interface CallableError {
	message?: string;
	status?: string;
}

async function callable<T>(name: string, data: unknown, token: string): Promise<T> {
	const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		// The functions emulator cold-starts the whole bundle on the first call
		signal: AbortSignal.timeout(120_000),
	});
	const json = (await res.json()) as { result?: T; error?: CallableError };
	if (json.error) {
		throw new Error(`${name} failed: ${json.error.status ?? ''} ${json.error.message ?? ''}`.trim());
	}
	if (json.result === undefined) {
		throw new Error(`${name} returned no result (HTTP ${res.status})`);
	}

	return json.result;
}

/** Teacher identity via the auth emulator's fake Google IdP — no browser, no sign-in race. */
async function signInTeacher(sub: string): Promise<{ uid: string; idToken: string }> {
	const res = await fetch(`${IDENTITY}/accounts:signInWithIdp?key=fake`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			postBody: `id_token=${encodeURIComponent(
				JSON.stringify({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
			)}&providerId=google.com`,
			requestUri: 'http://localhost',
			returnSecureToken: true,
		}),
	});
	const json = (await res.json()) as { localId?: string; idToken?: string };
	if (!json.idToken || !json.localId) {
		throw new Error('Teacher sign-in failed against the auth emulator');
	}

	return { uid: json.localId, idToken: json.idToken };
}

/** A bot classmate signs in exactly as a student does: anonymously. */
async function signUpAnonymous(): Promise<{ uid: string; idToken: string }> {
	const res = await fetch(`${IDENTITY}/accounts:signUp?key=fake`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ returnSecureToken: true }),
	});
	const json = (await res.json()) as { localId?: string; idToken?: string };
	if (!json.idToken || !json.localId) {
		throw new Error('Anonymous sign-up failed against the auth emulator');
	}

	return { uid: json.localId, idToken: json.idToken };
}

/**
 * Spread the bots across both camps and the centre. A class that all sits in
 * one camp makes bridging scores meaningless and hides exactly the layout
 * cases (two populated camp columns) most worth looking at.
 */
const CAMP_POSITIONS = [12, 88, 30, 72, 50, 8, 94, 40, 60, 20];

export async function fastlane(options: FastlaneOptions = {}): Promise<FastlaneResult> {
	const {
		stage = AgoraStageEnum.deliberation,
		students = 4,
		proposals = 3,
		topicPackageId = TOPIC_PACKAGE_ID,
		runId = `fastlane-${Date.now().toString(36)}`,
		quiet = false,
	} = options;

	const say = (msg: string): void => {
		if (!quiet) console.log(msg);
	};

	const teacher = await signInTeacher(`${runId}-teacher`);
	const { sessionId, code } = await callable<{ sessionId: string; code: string }>(
		'agoraCreateSession',
		{ topicPackageId, deviceMode: AgoraDeviceMode.individual },
		teacher.idToken,
	);
	say(`   ✓ session ${sessionId} (code ${code})`);

	// Bots join through the real callable so their participant docs are
	// identical to a student's — including the anon name the class reads.
	const bots: FastlaneBot[] = [];
	for (let index = 0; index < students; index++) {
		const bot = await signUpAnonymous();
		const joined = await callable<{ participantId: string; anonName: string }>(
			'agoraJoinSession',
			{ code },
			bot.idToken,
		);
		const campPosition = CAMP_POSITIONS[index % CAMP_POSITIONS.length];
		const camp = deriveCamp(campPosition);
		// Positioning is a one-field write on the student's own participant doc
		await db
			.collection(Collections.agoraParticipants)
			.doc(createAgoraParticipantId(sessionId, bot.uid))
			.update({ campPosition, camp });

		bots.push({
			uid: bot.uid,
			idToken: bot.idToken,
			participantId: joined.participantId,
			anonName: joined.anonName,
			campPosition,
			camp,
		});
	}
	say(`   ✓ ${bots.length} bot classmates enrolled and positioned`);

	// Proposals need the session's statement spine, which only exists after
	// agoraCreateSession has written it
	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	const session = sessionSnap.data() as AgoraSession | undefined;
	if (!session) throw new Error(`Session ${sessionId} vanished right after creation`);

	const posting = bots.slice(0, Math.min(proposals, bots.length));
	for (const [index, bot] of posting.entries()) {
		const statementId = `fastlane-${sessionId}-p${index}`;
		const statement = buildProposalStatement(
			session,
			statementId,
			bot.uid,
			bot.anonName,
			PROPOSAL_TEXTS[index % PROPOSAL_TEXTS.length],
		);
		await db.collection(Collections.statements).doc(statementId).set(statement);
		bot.proposalId = statementId;
	}
	if (posting.length > 0) say(`   ✓ ${posting.length} proposals posted`);

	if (stage !== AgoraStageEnum.lobby) {
		await callable<{ ok: boolean }>(
			'agoraAdvanceStage',
			{ sessionId, stage },
			teacher.idToken,
		);
		say(`   ✓ stage → ${stage}`);
	}

	return {
		sessionId,
		code,
		joinUrl: `${VITE_HOST}/#!/join/${code}`,
		teacherUid: teacher.uid,
		teacherToken: teacher.idToken,
		stage,
		bots,
	};
}

/**
 * Give a real (browser) student the camp they would have chosen on the
 * positioning screen. Needed whenever a client joins a session that is already
 * past positioning: without a camp they sit outside every bridging
 * calculation, which is most of what the deliberation screens display.
 */
export async function positionStudent(
	sessionId: string,
	uid: string,
	campPosition: number,
): Promise<void> {
	await db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, uid))
		.update({ campPosition, camp: deriveCamp(campPosition) });
}

/**
 * Write a proposal FOR a real (browser) student.
 *
 * The game gates the classmates' side of the deliberation behind having
 * proposed yourself ("write first — then light the lantern"), which is right
 * pedagogically and means a student who has not written cannot see the rate,
 * feedback or helped screens at all. Handing them a proposal opens every one
 * of them without a single keystroke.
 */
export async function proposeAs(sessionId: string, uid: string, text?: string): Promise<string> {
	const [sessionSnap, participantSnap] = await Promise.all([
		db.collection(Collections.agoraSessions).doc(sessionId).get(),
		db
			.collection(Collections.agoraParticipants)
			.doc(createAgoraParticipantId(sessionId, uid))
			.get(),
	]);
	const session = sessionSnap.data() as AgoraSession | undefined;
	const participant = participantSnap.data() as { anonName?: string } | undefined;
	if (!session) throw new Error(`Session ${sessionId} not found`);
	if (!participant?.anonName) throw new Error(`${uid} has no participant doc in ${sessionId}`);

	const statementId = `fastlane-${sessionId}-mine`;
	const statement = buildProposalStatement(
		session,
		statementId,
		uid,
		participant.anonName,
		text ??
			'הצעה: אספה נבחרת שמאשרת מסים, לצד ערובה חוקתית לביטחון האחוזות — כל צד מקבל את מה שהוא הכי חושש לאבד.',
	);
	await db.collection(Collections.statements).doc(statementId).set(statement);

	return statementId;
}

/** The teacher's own board for this session — handy alongside a student view. */
export function teacherUrl(sessionId: string): string {
	return `${VITE_HOST}/#!/teach/session/${sessionId}`;
}
