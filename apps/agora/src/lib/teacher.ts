import {
	orderBy,
	startAfter,
	type QueryDocumentSnapshot,
	type DocumentData,
} from 'firebase/firestore';
import { t } from './i18n';
import { parse } from 'valibot';
import {
	Collections,
	AgoraCamp,
	AgoraClassAggregate,
	AgoraClassAggregateSchema,
	AgoraClassSchema,
	AgoraSchoolSchema,
	AgoraIdentitySchema,
	AgoraParticipant,
	AgoraParticipantSchema,
	AgoraSession,
	AgoraSessionSchema,
	AgoraStudentAggregate,
	AgoraStudentAggregateSchema,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AgoraThemeChoice,
	VotingStageSettings,
	AGORA_VOTING,
	deriveCamp,
} from '@freedi/shared-types';
import type {
	TeacherConsoleClassDetail,
	TeacherConsoleDashboard,
	TeacherConsoleMember,
	TeacherConsoleReport,
} from '@freedi/shared-types';
import {
	db,
	doc,
	collection,
	query,
	where,
	limit,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	storage,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
} from './firebase';
import { trackWrite } from './confirmedWrite';
import { teacherConsole } from './callables';

/**
 * Everything the teacher and join screens ask of Firestore.
 *
 * The student path has had a data layer since the beginning — views render,
 * lib/proposals.ts and lib/session.ts talk to the database. The teacher path
 * never did: five views built their own queries, parsed their own documents and
 * swallowed their own errors. That is the surface with no e2e coverage worth
 * the name, and the surface most exposed to a rules change, because nobody
 * finds out it broke until a teacher is standing in front of a class.
 *
 * One place now knows the collection names and the schemas. The views keep
 * their own state and their own decisions.
 */

/** A session looked up by its join code, or null when the code is wrong. */
export async function findSessionByCode(code: string): Promise<AgoraSession | null> {
	const snapshot = await getDocs(
		query(collection(db, Collections.agoraSessions), where('code', '==', code), limit(1)),
	);
	if (snapshot.empty) return null;

	try {
		return parse(AgoraSessionSchema, snapshot.docs[0].data());
	} catch (error) {
		console.error('[Teacher] Invalid session doc:', error);

		return null;
	}
}

/**
 * The topic packages this teacher owns.
 *
 * Invalid documents are skipped rather than fatal: one malformed package must
 * not empty a teacher's whole library thirty seconds before a lesson.
 */
export async function listTopicPackages(creatorId: string): Promise<AgoraTopicPackage[]> {
	const snapshot = await getDocs(
		query(collection(db, Collections.agoraTopicPackages), where('creatorId', '==', creatorId)),
	);
	const packages: AgoraTopicPackage[] = [];
	snapshot.forEach((docSnap) => {
		try {
			const topic = parse(AgoraTopicPackageSchema, docSnap.data());
			// A quick game's shell is not a scenario anyone would start again
			if (topic.kind === 'quick') return;
			packages.push(topic);
		} catch (error) {
			console.error('[Teacher] Invalid topic package:', error);
		}
	});

	return packages;
}

export async function saveTopicPackage(topicPackage: AgoraTopicPackage): Promise<void> {
	await setDoc(doc(db, Collections.agoraTopicPackages, topicPackage.topicPackageId), topicPackage);
}

/** One topic package by id — the editor's load. Throws on a malformed doc. */
export async function fetchTopicPackage(topicPackageId: string): Promise<AgoraTopicPackage | null> {
	const snapshot = await getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId));
	if (!snapshot.exists()) return null;

	return parse(AgoraTopicPackageSchema, snapshot.data());
}

/**
 * The fields the topic editor actually edits — the ONLY ones its save may
 * touch. The editor used to write its whole in-memory copy back, which made
 * every save an overwrite of fields it never showed (creator, language,
 * rubric, metrics) with whatever they were when the editor was opened.
 */
export type TopicEditorFields = Partial<
	Pick<
		AgoraTopicPackage,
		'title' | 'framingText' | 'challengeQuestion' | 'characters' | 'scenes' | 'status'
	>
>;

/**
 * Save the editor's fields — under the confirmed-write clock, because a
 * teacher polishing a package on flaky wifi was the textbook silent failure:
 * Firestore queues, the button flashes "saved", and the package still says
 * what it said. The stalled banner now has something to report.
 */
export async function saveTopicEditorFields(
	topicPackageId: string,
	fields: TopicEditorFields,
): Promise<void> {
	await trackWrite(
		'editor.saving_package',
		updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), {
			...fields,
			lastUpdate: Date.now(),
		}),
	);
}

/**
 * Upload one scene asset (video or image) into the package's storage folder.
 * Progress arrives as whole percents; resolves with the download URL to write
 * onto the scene. Storage lives here so no view imports firebase for it.
 */
export function uploadTopicAsset(
	topicPackageId: string,
	fileName: string,
	file: File,
	onProgress: (percent: number) => void,
): Promise<string> {
	const task = uploadBytesResumable(
		storageRef(storage, `agora/${topicPackageId}/${fileName}`),
		file,
	);

	return new Promise<string>((resolve, reject) => {
		task.on(
			'state_changed',
			(snapshot) => {
				onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
			},
			reject,
			() => {
				getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
			},
		);
	});
}

export async function patchTopicPackage(
	topicPackageId: string,
	patch: Partial<AgoraTopicPackage>,
): Promise<void> {
	await updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), patch);
}

/**
 * How the vote will run: which proposals reach the ballot, and what it takes
 * to win it.
 *
 * The teacher owns this; the ballot itself is server-drawn and rules-frozen,
 * so nothing here can name a candidate. `numberOfResults` is clamped before it
 * is written — a ballot of one is not an election, and a ballot of forty is
 * not a decision.
 */
export async function setVotingSettings(
	sessionId: string,
	settings: VotingStageSettings,
): Promise<void> {
	const selection = settings.selection;
	const clamped: VotingStageSettings = {
		...settings,
		...(selection
			? {
					selection: {
						...selection,
						...(selection.numberOfResults !== undefined
							? {
									numberOfResults: Math.min(
										AGORA_VOTING.MAX_TOP_X,
										Math.max(AGORA_VOTING.MIN_TOP_X, Math.round(selection.numberOfResults)),
									),
								}
							: {}),
					},
				}
			: {}),
	};

	await updateDoc(doc(db, Collections.agoraSessions, sessionId), {
		votingSettings: clamped,
		lastUpdate: Date.now(),
	});
}

/**
 * The look the room wears by default. The teacher's to set, live: every phone
 * that has not chosen a look of its own repaints on the next snapshot. The
 * shape is pinned by the rules as well as the schema, because every client
 * parses the session strictly and a malformed theme would brick the room.
 */
export async function setSessionTheme(sessionId: string, theme: AgoraThemeChoice): Promise<void> {
	await updateDoc(doc(db, Collections.agoraSessions, sessionId), {
		theme,
		lastUpdate: Date.now(),
	});
}

/** Who moves the class between the village's stations — the teacher's to switch, live */
export async function setVillageNavigation(
	sessionId: string,
	villageNavigation: 'teacher' | 'free',
): Promise<void> {
	await updateDoc(doc(db, Collections.agoraSessions, sessionId), {
		villageNavigation,
		lastUpdate: Date.now(),
	});
}

/**
 * Walk every student's village to one place. A timestamp rather than a flag,
 * so calling the same place twice calls twice, and each phone acts once per call.
 */
export async function callVillage(sessionId: string, place: 'current' | 'council'): Promise<void> {
	await updateDoc(doc(db, Collections.agoraSessions, sessionId), {
		villageCall: { place, at: Date.now() },
		lastUpdate: Date.now(),
	});
}

/**
 * Where a student placed themselves between the two camps.
 *
 * The camp is derived here rather than taken from the caller, so the one rule
 * that turns a slider position into a side cannot be stated twice — it decides
 * the bridging denominator for every proposal in the room.
 */
export async function saveCampPosition(
	participantId: string,
	campPosition: number,
): Promise<{ camp: AgoraCamp }> {
	const camp = deriveCamp(campPosition);
	await updateDoc(doc(db, Collections.agoraParticipants, participantId), {
		campPosition,
		camp,
		lastActive: Date.now(),
	});

	return { camp };
}

// ─── The teacher console's classroom reads ──────────────────────────────────
// All served by the agoraTeacherConsole callable, not by client queries:
// rules cannot reliably prove document-scoped list queries for the SDK's
// listen path, and the roster (PIN hashes) must never be client-listable at
// all. Wire payloads are valibot-parsed here; malformed entries are skipped —
// one bad doc must not blank a dashboard.

export function parseEach<T>(rows: unknown[], parseRow: (data: unknown) => T, label: string): T[] {
	const parsed: T[] = [];
	for (const row of rows) {
		try {
			parsed.push(parseRow(row));
		} catch (error) {
			console.error(`[Teacher] Invalid ${label} payload:`, error);
		}
	}

	return parsed;
}

const parseSession = (data: unknown): AgoraSession => parse(AgoraSessionSchema, data);
const parseCareer = (data: unknown): AgoraStudentAggregate =>
	parse(AgoraStudentAggregateSchema, data);
const parseParticipant = (data: unknown): AgoraParticipant => parse(AgoraParticipantSchema, data);

export interface TeacherDashboard {
	supervisedSchools: TeacherConsoleDashboard['supervisedSchools'];
	isSystemAdmin: boolean;
	classes: TeacherConsoleDashboard['classes'];
	/** Where this teacher may open classes — empty means "ask your admin" */
	schools: TeacherConsoleDashboard['schools'];
	aggregates: Map<string, AgoraClassAggregate>;
	sessions: AgoraSession[];
}

export const EMPTY_DASHBOARD: TeacherDashboard = {
	supervisedSchools: [],
	isSystemAdmin: false,
	classes: [],
	schools: [],
	aggregates: new Map(),
	sessions: [],
};

/** Grades a teacher picks from; stored as the number, shown in the teacher's language */
export const AGORA_GRADES: readonly string[] = [
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'11',
	'12',
];

/** A stored grade as the screen prints it — a picked grade by its name, anything else as typed */
export function gradeLabel(gradeLevel: string | undefined): string {
	const grade = (gradeLevel ?? '').trim();
	if (!grade) return '';

	return AGORA_GRADES.includes(grade) ? t(`grade.g${grade}`) : grade;
}

/** "ז' · 2" — the grade first, then the label the teacher gave the class */
export function classLabel(agoraClass: { name: string; gradeLevel?: string }): string {
	const grade = gradeLabel(agoraClass.gradeLevel);

	return grade ? `${grade} · ${agoraClass.name}` : agoraClass.name;
}

/**
 * The dashboard, read straight from Firestore by the teacher's own browser.
 *
 * Four queries on the channel the app already holds open, answered by the
 * Firestore frontend — no function, and so no cold start. That is the whole
 * point: `agoraTeacherConsole` shares an entry module with every other
 * function in the codebase, and the first teacher after a quiet period was
 * paying for all of it to load before being told the names of their classes.
 *
 * Every one of these is a `teacherMap.<uid> == true` equality except the
 * sessions, which are already read this way by the archive panel below. The
 * roster does NOT come this way and must not: member documents carry the
 * students' PIN hashes, which is exactly why the console strips them.
 */
async function queryTeacherDashboard(uid: string): Promise<TeacherDashboard> {
	const mine = (collectionName: string) =>
		getDocs(query(collection(db, collectionName), where(`teacherMap.${uid}`, '==', true)));

	const [classSnaps, schoolSnaps, aggregateSnaps, sessionSnaps, supervisedSnaps, userSnap] =
		await Promise.all([
			mine(Collections.agoraClasses),
			mine(Collections.agoraSchools),
			mine(Collections.agoraClassAggregates),
			getDocs(
				query(
					collection(db, Collections.agoraSessions),
					where('teacherId', '==', uid),
					orderBy('createdAt', 'desc'),
					limit(20),
				),
			),
			// The schools this caller supervises — the "supervise" entry. Proved
			// by the same equality constraint as teacherMap, on supervisorMap.
			getDocs(
				query(
					collection(db, Collections.agoraSchools),
					where(`supervisorMap.${uid}`, '==', true),
				),
			),
			// usersV2/{uid}.systemAdmin, as the console reads it
			getDoc(doc(db, Collections.users, uid)),
		]);
	const activeSchools = (snaps: typeof schoolSnaps): TeacherConsoleDashboard['schools'] =>
		parseEach(
			snaps.docs.map((snap) => snap.data()),
			(data: unknown) => parse(AgoraSchoolSchema, data),
			'school',
		)
			.filter((school) => school.status === 'active')
			.map((school) => ({ schoolId: school.schoolId, name: school.name }))
			.sort((a, b) => a.name.localeCompare(b.name));

	const classes = parseEach(
		classSnaps.docs.map((snap) => snap.data()),
		(data: unknown) => parse(AgoraClassSchema, data),
		'class',
	)
		.filter((agoraClass) => agoraClass.status === 'active')
		.sort((a, b) => a.name.localeCompare(b.name));

	const aggregates = new Map<string, AgoraClassAggregate>();
	for (const aggregate of parseEach(
		aggregateSnaps.docs.map((snap) => snap.data()),
		(data: unknown) => parse(AgoraClassAggregateSchema, data),
		'class aggregate',
	)) {
		aggregates.set(aggregate.classId, aggregate);
	}

	return {
		classes: classes.map((agoraClass) => ({
			classId: agoraClass.classId,
			name: agoraClass.name,
			...(agoraClass.gradeLevel ? { gradeLevel: agoraClass.gradeLevel } : {}),
			classCode: agoraClass.classCode,
			memberCount: agoraClass.memberCount,
			schoolId: agoraClass.schoolId,
		})),
		schools: activeSchools(schoolSnaps),
		supervisedSchools: activeSchools(supervisedSnaps),
		isSystemAdmin: userSnap.data()?.systemAdmin === true,
		aggregates,
		sessions: parseEach(
			sessionSnaps.docs.map((snap) => snap.data()),
			parseSession,
			'session',
		),
	};
}

/**
 * Everything the /teach dashboard shows.
 *
 * Read directly when it can be, through the console when it cannot. The
 * fallback is not decoration: hosting and security rules deploy separately,
 * so a browser can be running this code against rules that have not landed
 * yet, and a teacher must not lose their classes over a deploy order. It is
 * logged loudly, because the standing state of this is the fast path.
 */
export async function fetchTeacherDashboard(uid?: string): Promise<TeacherDashboard> {
	if (uid) {
		let direct: TeacherDashboard | null = null;
		try {
			direct = await queryTeacherDashboard(uid);
		} catch (error) {
			console.error('[Teacher] Reading the dashboard direct failed; asking the console:', error);
		}
		if (direct) {
			const unindexed = classesMissingAggregates(
				direct.classes,
				direct.sessions,
				direct.aggregates,
			);
			if (unindexed.length === 0) return direct;

			// The query answered, but it can only see aggregates that carry
			// `teacherMap`. One written before the field existed is simply absent
			// — the class reads "no games yet" over a history it has — until the
			// backfill script runs. The console reads by id and sees them all.
			console.error(
				'[Teacher] Class aggregates missing from the direct read (teacherMap not backfilled?); asking the console for advancement:',
				{ uid, classIds: unindexed },
			);
			try {
				const fromConsole = await fetchConsoleDashboard();

				return {
					...direct,
					aggregates: new Map([...direct.aggregates, ...fromConsole.aggregates]),
				};
			} catch (error) {
				console.error('[Teacher] Asking the console for advancement failed:', error);

				return direct;
			}
		}
	}

	return fetchConsoleDashboard();
}

/**
 * The classes whose advancement the direct read cannot be trusted on: a game
 * of theirs has been folded into an aggregate (`aggregatedAt` on the session),
 * yet no aggregate came back for them. That is the signature of an aggregate
 * written before `teacherMap` existed — invisible to the equality query, not
 * missing from the database. Only the sessions on hand are consulted, so it is
 * a tripwire, not a census.
 */
export function classesMissingAggregates(
	classes: ReadonlyArray<{ classId: string }>,
	sessions: ReadonlyArray<Pick<AgoraSession, 'classId' | 'aggregatedAt'>>,
	aggregates: ReadonlyMap<string, unknown>,
): string[] {
	const mine = new Set(classes.map((agoraClass) => agoraClass.classId));
	const missing = new Set<string>();
	for (const session of sessions) {
		const { classId } = session;
		if (
			classId &&
			session.aggregatedAt !== undefined &&
			mine.has(classId) &&
			!aggregates.has(classId)
		) {
			missing.add(classId);
		}
	}

	return [...missing];
}

/** The dashboard as the `agoraTeacherConsole` callable serves it */
async function fetchConsoleDashboard(): Promise<TeacherDashboard> {
	const data = (await teacherConsole({ view: 'dashboard' })) as TeacherConsoleDashboard;
	const aggregates = new Map<string, AgoraClassAggregate>();
	for (const [classId, aggregate] of Object.entries(data.aggregates ?? {})) {
		try {
			aggregates.set(classId, parse(AgoraClassAggregateSchema, aggregate));
		} catch (error) {
			console.error('[Teacher] Invalid class aggregate payload:', error);
		}
	}

	return {
		classes: data.classes ?? [],
		supervisedSchools: data.supervisedSchools ?? [],
		isSystemAdmin: data.isSystemAdmin ?? false,
		schools: data.schools ?? [],
		aggregates,
		sessions: parseEach(data.sessions ?? [], parseSession, 'session'),
	};
}

export interface TeacherClassDetail {
	classId: string;
	name: string;
	gradeLevel?: string;
	classCode: string;
	schoolName: string;
	/** Every teacher on the class — the reader is one of them */
	teachers: TeacherConsoleClassDetail['teachers'];
	members: TeacherConsoleMember[];
	careers: Map<string, AgoraStudentAggregate>;
	aggregate: AgoraClassAggregate | null;
	sessions: AgoraSession[];
}

/** One class: roster, careers, advancement, game history. */
export async function fetchTeacherClass(classId: string): Promise<TeacherClassDetail | null> {
	let data: TeacherConsoleClassDetail;
	try {
		data = (await teacherConsole({ view: 'class', classId })) as TeacherConsoleClassDetail;
	} catch (error) {
		console.error('[Teacher] Loading class failed:', error);

		return null;
	}
	const careers = new Map<string, AgoraStudentAggregate>();
	for (const career of parseEach(Object.values(data.careers ?? {}), parseCareer, 'career')) {
		careers.set(career.memberId, career);
	}
	let aggregate: AgoraClassAggregate | null = null;
	if (data.aggregate) {
		try {
			aggregate = parse(AgoraClassAggregateSchema, data.aggregate);
		} catch (error) {
			console.error('[Teacher] Invalid class aggregate payload:', error);
		}
	}

	return {
		classId: data.classId,
		name: data.name,
		gradeLevel: data.gradeLevel,
		classCode: data.classCode,
		schoolName: data.schoolName,
		teachers: data.teachers ?? [],
		members: data.members ?? [],
		careers,
		aggregate,
		sessions: parseEach(data.sessions ?? [], parseSession, 'session'),
	};
}

export interface SessionReport {
	session: AgoraSession;
	/** Students only — AI raters filtered out */
	participants: AgoraParticipant[];
	/** userId → the real name typed at the door; empty when nobody gave one */
	realNames: Record<string, string>;
}

/** One finished game, read once — the report screen holds no listeners. */
export async function fetchSessionReport(sessionId: string): Promise<SessionReport | null> {
	let data: TeacherConsoleReport;
	try {
		data = (await teacherConsole({ view: 'report', sessionId })) as TeacherConsoleReport;
	} catch (error) {
		console.error('[Teacher] Loading report failed:', error);

		return null;
	}

	return {
		session: parse(AgoraSessionSchema, data.session),
		participants: parseEach(data.participants ?? [], parseParticipant, 'participant'),
		realNames: Object.fromEntries(
			parseEach(data.identities ?? [], (row) => parse(AgoraIdentitySchema, row), 'identity').map(
				(identity) => [identity.userId, identity.realName],
			),
		),
	};
}

/** Cursor pagination retains access to all past lessons without filling the dashboard. */
export async function fetchSessionHistory(
	uid: string,
	cursor?: QueryDocumentSnapshot<DocumentData>,
) {
	const snap = await getDocs(
		query(
			collection(db, Collections.agoraSessions),
			where('teacherId', '==', uid),
			orderBy('createdAt', 'desc'),
			...(cursor ? [startAfter(cursor)] : []),
			limit(25),
		),
	);

	return {
		sessions: snap.docs.map((d) => parse(AgoraSessionSchema, d.data())),
		cursor: snap.empty ? undefined : snap.docs[snap.docs.length - 1],
		hasMore: snap.size === 25,
	};
}
