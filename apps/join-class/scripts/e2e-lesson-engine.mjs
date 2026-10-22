// Engine phases of the full-lesson e2e: the whole lesson driven through the
// screens, against the real classroom callables (classAssignTables,
// classTableStep, classAllTablesTo, classFreezeBallot, classCloseBallot) and the
// onStatementCreated engine. Switched on with E2E_LESSON_ENGINE=1; without it
// e2e-lesson.mjs reports each as PENDING_ENGINE.
//
// data-testid used (all exist in src):
//   student  side-slider, side-confirm, table-number, table-mates,
//            table-pick-question, table-start, table-next-speaker, table-to-write,
//            table-to-rate, table-claim, asker-mark, time-over, proposal-box,
//            proposal-send, rate-face-1..5,
//            vote-option, vote-send, support-face-1..5
//   console  [data-step-key] (aria-current="step" on the current one),
//            console-forward, console-assign-tables, console-all-rate,
//            console-plenum, console-freeze-vote, console-close-vote
// The clock runs at VITE_CLASS_CLOCK_SPEED (20x): a speaker's minute is 3 s.

const TURN_TIMEOUT = 25000;
const SLOW_TIMEOUT = 60000; // one onStatementCreated / newEvaluation round is ~6 s on the emulator
const POLL_MS = 250;
const SIDE_A = 10;
const SIDE_B = 90;
const SIDE_CENTER = 50;
const SIDES_EACH = 2;
const TURNS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function byId(page, id, timeout = TURN_TIMEOUT) {
	const locator = page.getByTestId(id).first();
	await locator.waitFor({ state: 'visible', timeout });

	return locator;
}

async function until(read, label, timeout = TURN_TIMEOUT) {
	const end = Date.now() + timeout;
	let value = await read();
	while (!value && Date.now() < end) {
		await sleep(POLL_MS);
		value = await read();
	}
	if (!value) throw new Error(`timed out: ${label}`);

	return value;
}

/** Teacher presses the ONE forward control until `expectedStepKey` is the current step. */
async function teacherForward(teacher, expectedStepKey) {
	await (await byId(teacher, 'console-forward')).click();
	await teacher.waitForFunction(
		(key) =>
			document
				.querySelector('[data-step-key][aria-current="step"]')
				?.getAttribute('data-step-key') === key,
		expectedStepKey,
		{ timeout: TURN_TIMEOUT },
	);
}

/** Table number shown on a student's phone ("my table"), or null. */
async function tableNumberOf(student) {
	const node = student.page.getByTestId('table-number').first();
	if ((await node.count()) === 0) return null;
	const digits = ((await node.textContent()) ?? '').match(/\d+/);

	return digits ? Number(digits[0]) : null;
}

/** Who sits where, read off the phones while they show "my table" (the next steps replace that screen). */
const seating = new Map();
/** Table 1's asker of its last turn: it stays the table's asker when the lesson moves on to Proposals. */
let tableOneLastAsker;

async function tablemates(students, number) {
	const mates = [];
	for (const student of students) {
		if ((await tableNumberOf(student)) === number) mates.push(student);
	}

	return mates;
}

/** The seated tables as lists of students, by table number. */
function tableOf(number) {
	return seating.get(number) ?? [];
}

async function hasTestId(student, id) {
	return (await student.page.getByTestId(id).count()) > 0;
}

/** The one device at `table` that shows the asker mark (and is not `except`, the previous turn's asker). */
async function askerOf(table, except) {
	return until(async () => {
		const askers = [];
		for (const student of table) if (await hasTestId(student, 'asker-mark')) askers.push(student);

		return askers.length === 1 && askers[0] !== except ? askers[0] : null;
	}, 'exactly one asker at the table');
}

async function clearLessonLeftovers({ admin, mid, challengeId }) {
	const { FieldValue } = await import('firebase-admin/firestore');
	const subs = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();
	const tables = await admin.collection('classTables').where('mainId', '==', mid).get();
	const questions = await admin.collection('statements').where('parentId', '==', mid).get();
	const options = [];
	for (const question of questions.docs) {
		const found = await admin.collection('statements').where('parentId', '==', question.id).get();
		options.push(...found.docs);
	}
	const votes = await admin.collection('votes').where('parentId', '==', challengeId).get();
	await Promise.all([...tables.docs, ...options, ...votes.docs].map((d) => d.ref.delete()));
	await Promise.all(
		subs.docs
			.filter((d) => d.data().role !== 'admin')
			.map((d) =>
				d.ref.update({
					side: FieldValue.delete(),
					camp: FieldValue.delete(),
					tableId: FieldValue.delete(),
					decisionSupport: FieldValue.delete(),
				}),
			),
	);
	await admin.collection('statements').doc(challengeId).update({
		'statementSettings.roundPhase': FieldValue.delete(),
		'statementSettings.ballot': FieldValue.delete(),
		selections: FieldValue.delete(),
	});
}

export const ENGINE_PHASES = [
	{
		name: 'students pick sides on the slider',
		async run({ teacher, students, check, admin, mid }) {
			await teacherForward(teacher, 'opening');
			await teacherForward(teacher, 'side');
			for (const [index, student] of students.entries()) {
				const slider = await byId(student.page, 'side-slider');
				// two lean to side A, two to side B, the rest stay at the centre
				const target =
					index < SIDES_EACH ? SIDE_A : index >= students.length - SIDES_EACH ? SIDE_B : SIDE_CENTER;
				await slider.fill(String(target));
				await (await byId(student.page, 'side-confirm')).click();
			}
			const camps = await until(async () => {
				const snap = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();
				const list = snap.docs.filter((d) => d.data().role !== 'admin').map((d) => d.data().camp);

				return list.filter(Boolean).length === students.length ? list : null;
			}, 'every student wrote a camp');
			const count = (camp) => camps.filter((c) => c === camp).length;
			check(
				'six students confirmed a side (2 / 2 / 2)',
				count('a') === SIDES_EACH && count('b') === SIDES_EACH && count('center') === SIDES_EACH,
				camps.join(','),
			);
		},
	},
	{
		name: 'teacher seats the class (tables of 3)',
		async run({ teacher, students, check }) {
			await teacherForward(teacher, 'tables');
			await (await byId(teacher, 'console-assign-tables')).click();
			for (const student of students) {
				const number = await until(() => tableNumberOf(student), `student ${student.index + 1} has a table`);
				check(`student ${student.index + 1} has a table`, number > 0, `table ${number}`);
			}
			const one = await tablemates(students, 1);
			const two = await tablemates(students, 2);
			seating.set(1, one);
			seating.set(2, two);
			check('two tables of three', one.length === 3 && two.length === 3, `${one.length} + ${two.length}`);
			const mateCount = await until(async () => {
				const count = await one[0].page.getByTestId('table-mates').locator('li').count();

				return count === 3 ? count : null;
			}, 'the table card lists the three tablemates').catch(() => 0);
			check('the table card lists the tablemates', mateCount === 3, `${mateCount}`);
		},
	},
	{
		name: 'table 1 runs two turns (a volunteer asks, then another volunteer)',
		async run({ teacher, check }) {
			await teacherForward(teacher, 'tableTalk');
			const table = tableOf(1);
			const askers = [];
			let previous;
			for (let turn = 1; turn <= TURNS; turn += 1) {
				// a volunteer: the first tablemate who has not asked taps "אני אשאל" (V1, then V2)
				const claimer = table.find((s) => s !== previous && !askers.includes(s.index));
				await (await byId(claimer.page, 'table-claim')).click();
				const asker = await askerOf(table, previous);
				previous = asker;
				askers.push(asker.index);
				const others = table.filter((s) => s !== asker);
				check(`turn ${turn}: asker device shows the mark`, await hasTestId(asker, 'asker-mark'));
				check(`turn ${turn}: non-asker has no start control`, !(await hasTestId(others[0], 'table-start')));
				await asker.page.locator('[data-testid=table-pick-question]:not([disabled])').first().click({ timeout: TURN_TIMEOUT });
				await (await byId(asker.page, 'table-start')).click();
				// talk: everyone speaks, the asker too. The engine counts real seconds (the 20x clock only speeds the
				// display), so the asker taps each name and passes the last minute to reach "everyone spoke".
				const allEnabled = () =>
					asker.page.waitForFunction(
						() => [...document.querySelectorAll('[data-testid=table-next-speaker]')].every((b) => !b.disabled),
						null,
						{ timeout: TURN_TIMEOUT },
					);
				for (let seat = 0; seat < table.length; seat += 1) {
					await allEnabled();
					await asker.page.locator('[data-testid=table-next-speaker]').nth(seat).click({ timeout: TURN_TIMEOUT });
				}
				const pass = asker.page.locator('[data-testid=pass-for],[data-testid=pass-speak]').first();
				await pass.waitFor({ state: 'visible', timeout: TURN_TIMEOUT });
				await pass.click();
				check(`turn ${turn}: nobody writes at Table talk`, !(await hasTestId(asker, 'table-to-write')) && !(await hasTestId(others[0], 'answer-box')));
			}
			tableOneLastAsker = previous;
			check('the turn went to a different volunteer the second time', askers[0] !== askers[1], askers.join(' -> '));
		},
	},
	{
		name: 'proposals, rating and plenum',
		async run({ teacher, students, check, admin, challengeId }) {
			await teacherForward(teacher, 'proposals');
			// table 1 leaves the talk screen for writing through its last asker; table 2 had no turn, so nobody asks
			// there and any tablemate may do it
			for (const finisher of [tableOneLastAsker, tableOf(2)[0]]) {
				await (await byId(finisher.page, 'table-to-write')).click();
			}
			for (const student of students) {
				await (await byId(student.page, 'proposal-box')).fill(`Proposal by student ${student.index + 1}`);
				await (await byId(student.page, 'proposal-send')).click();
			}
			const proposals = await until(async () => {
				const snap = await admin.collection('statements').where('parentId', '==', challengeId).get();

				return snap.size >= students.length ? snap : null;
			}, 'six proposals exist', SLOW_TIMEOUT);
			check('six proposals under the challenge question', proposals.size >= students.length, `${proposals.size}`);
			await (await byId(teacher, 'console-all-rate')).click();
			for (const student of students) {
				const face = await byId(student.page, 'rate-face-5', TURN_TIMEOUT);
				await face.click();
			}
			await (await byId(teacher, 'console-plenum')).click();
			await until(async () => (await admin.collection('statements').doc(challengeId).get()).data()?.statementSettings?.roundPhase === 'improve', 'plenum on');
			check('plenum switched on', true);
		},
	},
	{
		name: 'ballot, vote and summary with support by side',
		async run({ teacher, students, check, admin, mid, challengeId }) {
			await teacherForward(teacher, 'vote');
			await (await byId(teacher, 'console-freeze-vote')).click();
			const ballot = await until(async () => (await admin.collection('statements').doc(challengeId).get()).data()?.statementSettings?.ballot, 'ballot frozen');
			check('the ballot is frozen with candidates', ballot.candidateIds.length >= 1, `${ballot.candidateIds.length} candidates`);
			for (const [index, student] of students.entries()) {
				const options = student.page.getByTestId('vote-option');
				await options.first().waitFor({ state: 'visible', timeout: TURN_TIMEOUT });
				await options.nth(index % ballot.candidateIds.length).click();
				await (await byId(student.page, 'vote-send')).click();
			}
			await until(async () => {
				const snap = await admin.collection('votes').where('parentId', '==', challengeId).get();

				return snap.size >= students.length ? snap : null;
			}, 'six votes exist', SLOW_TIMEOUT);
			check('six votes were written', true);
			await (await byId(teacher, 'console-close-vote')).click();
			const closed = await until(async () => {
				const data = (await admin.collection('statements').doc(challengeId).get()).data()?.statementSettings?.ballot;

				return data?.closedAt && data?.decisionId ? data : null;
			}, 'ballot closed with a decision');
			check('the ballot closed with a decision', !!closed.decisionId, closed.decisionId);
			await teacherForward(teacher, 'summary');
			for (const student of students) {
				await (await byId(student.page, 'support-face-5')).click();
			}
			await until(async () => {
				const snap = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();
				const pupils = snap.docs.filter((d) => d.data().role !== 'admin');

				return pupils.length === students.length && pupils.every((d) => d.data().decisionSupport === 1);
			}, 'every student support was written');
			await teacher.goto(`${new URL(teacher.url()).origin}/t/${new URL(teacher.url()).pathname.split('/')[2]}/screen`);
			await teacher.locator('.projector-verdict').waitFor({ timeout: TURN_TIMEOUT });
			check('projector shows three support bars by side', (await teacher.locator('.projector-support__row').count()) === 3);
			const verdictClass = await until(async () => {
				const cls = (await teacher.locator('.projector-verdict').getAttribute('class')) ?? '';

				return cls.includes('--insufficient') ? null : cls;
			}, 'the verdict leaves "insufficient" once every side has rated');
			check('projector shows the verdict: everyone gave +1, so the sides came closer', verdictClass.includes('--closer'), verdictClass);
		},
	},
];

/** Called once before the engine phases: a clean lesson at step 0, teacher on the console. */
export async function prepareEngineLesson(ctx) {
	await clearLessonLeftovers(ctx);
	await ctx.setPlan(0);
	const { teacher, mid, baseUrl } = ctx;
	await teacher.goto(`${baseUrl}/t/${mid}`, { waitUntil: 'domcontentloaded' });
	await teacher.locator('[data-step-key][aria-current="step"]').first().waitFor({ timeout: TURN_TIMEOUT });
}
