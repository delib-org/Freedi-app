import type {
	ClassTable,
	Statement,
	StatementSubscription,
	TableAssignmentParticipant,
	TableAssignmentRun,
} from '@freedi/shared-types';
import { rosterEntryFrom } from '../../tableAssignment/roster';
import type { RegistrationSeatDoc } from '../registration/registrationAccess';
import { FakeFirestore } from './fakeFirestore';

/** A lesson and a registration hosted by the same teacher, for the bridge suites. */

export const MAIN = 'lesson1';
export const SID = 'reg1';
export const TEACHER = 'teacher';
export const NOW = 1_800_000_000_000;

export const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'summary'] as const;
export const TABLES_STEP = STEPS.indexOf('tables');

export interface Registrant {
	uid: string;
	fullName: string;
	position?: number;
}

/** r1-r3 sit at table 0 (Water), r4-r5 at table 1 (Roads), four seats a table. */
export const REGISTRANTS: Registrant[] = [
	{ uid: 'r1', fullName: 'Dana Levi', position: 0 },
	{ uid: 'r2', fullName: 'Avi Cohen', position: 100 },
	{ uid: 'r3', fullName: 'Noa Bar', position: 50 },
	{ uid: 'r4', fullName: 'Yael Shir', position: 25 },
	{ uid: 'r5', fullName: 'Omer Tal' },
];

export function seedLesson(fake: FakeFirestore, stepIndex = 0, classRegistration?: object): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: {
			lessonPlan: { steps: [...STEPS], stepIndex },
			...(classRegistration ? { classRegistration } : {}),
		},
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		statementSettings: { classRole: 'challenge' },
	});
}

export function seedRegistration(
	fake: FakeFirestore,
	overrides: Record<string, unknown> = {},
	registrants: Registrant[] = REGISTRANTS,
): void {
	fake.seed(`tableAssignments/${SID}`, {
		tableAssignmentId: SID,
		hostUid: TEACHER,
		title: 'Evening',
		mode: 'ranked',
		status: 'published',
		publishedRunId: 'run1',
		settings: {
			tableSize: 4,
			balanceTolerance: 0.3,
			positionQuestion: { label: 'Where', poleA: 'Keep', poleB: 'Change' },
		},
		createdAt: NOW,
		lastUpdate: NOW,
		...overrides,
	});
	[
		['t-water', 'Water'],
		['t-roads', 'Roads'],
	].forEach(([topicId, title], order) =>
		fake.seed(`tableAssignmentTopics/${topicId}`, { topicId, sessionId: SID, title, order }),
	);
	for (const r of registrants) {
		const participant: TableAssignmentParticipant = {
			sessionId: SID,
			uid: r.uid,
			fullName: r.fullName,
			preferences: [],
			registeredAt: NOW,
			...(r.position === undefined ? {} : { position: r.position }),
		};
		fake.seed(`tableAssignmentParticipants/${SID}_${r.uid}`, participant);
		fake.seed(`tableAssignmentRoster/${SID}_${r.uid}`, rosterEntryFrom(participant));
	}
	const run: Partial<TableAssignmentRun> = {
		runId: 'run1',
		sessionId: SID,
		status: 'published',
		tables: [
			{
				index: 0,
				topicId: 't-water',
				memberUids: ['r1', 'r2', 'r3'],
				stats: { n: 0, mean: [], sd: [], deviation: 0 },
			},
			{
				index: 1,
				topicId: 't-roads',
				memberUids: ['r4', 'r5'],
				stats: { n: 0, mean: [], sd: [], deviation: 0 },
			},
		],
	};
	fake.seed('tableAssignmentRuns/run1', run);
}

/** A lesson already connected to the registration (as classConnectRegistration leaves it). */
export function connectedRoom(stepIndex = TABLES_STEP): FakeFirestore {
	const fake = new FakeFirestore();
	seedLesson(fake, stepIndex, { tableAssignmentId: SID, connectedAt: NOW, sideStepRemoved: true });
	seedRegistration(fake, { contextStatementId: MAIN });

	return fake;
}

export function seedMember(fake: FakeFirestore, uid: string, createdAt = NOW): void {
	fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
		userId: uid,
		statementId: MAIN,
		role: 'member',
		user: { uid, displayName: uid },
		createdAt,
	});
}

export const tableAt = (fake: FakeFirestore, n: number): ClassTable =>
	fake.read(`classTables/${MAIN}--${n}`) as unknown as ClassTable;

export const subOf = (fake: FakeFirestore, uid: string): StatementSubscription =>
	fake.read(`statementsSubscribe/${uid}--${MAIN}`) as unknown as StatementSubscription;

export const lessonOf = (fake: FakeFirestore): Statement =>
	fake.read(`statements/${MAIN}`) as unknown as Statement;

export const ledgerOf = (fake: FakeFirestore, registrationUid: string): RegistrationSeatDoc =>
	fake.read(`classRegistrationSeats/${MAIN}--${registrationUid}`) as unknown as RegistrationSeatDoc;
