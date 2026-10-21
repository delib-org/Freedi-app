// Engine phases of the full-lesson e2e: the part that needs the C1 callables
// (classAssignTables, classTableStep, classFreezeBallot, ...) and the C2/C3/C4
// screens. They are written against the plan, contract and UX labels and are
// switched on with E2E_LESSON_ENGINE=1 once the whole flow is merged.
//
// Until then e2e-lesson.mjs reports each as PENDING_ENGINE.
//
// data-testid the other lanes must provide (none exist on this branch):
//   C2 (student 1)   side-slider (the <input type=range>), side-confirm,
//                    table-number (the big table number on "my table"),
//                    table-mates (list of the tablemates' chips)
//   C3 (student 2)   table-pick-question (one per question, in plan order),
//                    table-start ("read aloud and start", asker only),
//                    table-next-speaker, table-to-write ("we finished, write"),
//                    answer-box, answer-send, proposal-box, proposal-send,
//                    rate-face-<1..5> (inside a text card), vote-option (one per
//                    candidate), vote-send, support-face-<1..5>, asker-mark,
//                    time-over (the "time is over" text of the countdown),
//                    table-next-turn (asker's "next turn" control)
//   C4 (console)     [data-step-key=<key>] on each rail step (aria-current="step" on
//                    the current one), console-assign-tables, console-forward (the ONE forward
//                    control), console-all-rate, console-plenum, console-close-vote
// Role/text selectors are used wherever the UX labels are stable.

const SIX_STUDENTS = 6;
const TABLE_ONE_SIZE = 3;
const TURN_TIMEOUT = 20000;

/** Students at the same table: [asker, other, other]. */
function tableOneOf(students) {
	return students.slice(0, TABLE_ONE_SIZE);
}

async function byId(page, id, timeout = TURN_TIMEOUT) {
	const locator = page.getByTestId(id).first();
	await locator.waitFor({ state: 'visible', timeout });

	return locator;
}

/** Teacher presses the ONE forward control until `stepLabel` is the current step. */
async function teacherForward(teacher, expectedStepKey) {
	await (await byId(teacher, 'console-forward')).click();
	await teacher.waitForFunction(
		(key) => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === key,
		expectedStepKey,
		{ timeout: TURN_TIMEOUT },
	);
}

export const ENGINE_PHASES = [
	{
		name: 'students pick sides on the slider',
		async run({ students, check }) {
			for (const [index, student] of students.entries()) {
				const slider = await byId(student.page, 'side-slider');
				// first two lean to side A, last two to side B, the rest stay at the centre
				const target = index < 2 ? 10 : index >= SIX_STUDENTS - 2 ? 90 : 50;
				await slider.fill(String(target));
				await (await byId(student.page, 'side-confirm')).click();
			}
			check('six students confirmed a side', true);
		},
	},
	{
		name: 'teacher seats the class (tables of 3)',
		async run({ teacher, students, check }) {
			await teacherForward(teacher, 'tables');
			await (await byId(teacher, 'console-assign-tables')).click();
			for (const student of students) {
				const number = await byId(student.page, 'table-number');
				check(`student ${student.index + 1} has a table`, /\d/.test((await number.textContent()) ?? ''));
			}
		},
	},
	{
		name: 'table 1 runs two turns (asker, then a non-asker)',
		async run({ teacher, students, check }) {
			await teacherForward(teacher, 'tableTalk');
			const table = tableOneOf(students);
			for (let turn = 1; turn <= 2; turn += 1) {
				// the asker is the one whose device shows the forward control
				const asker = turn === 1 ? table[0] : table[1];
				const other = turn === 1 ? table[1] : table[0];
				check(`turn ${turn}: asker device shows the mark`, (await asker.page.getByTestId('asker-mark').count()) > 0);
				check(`turn ${turn}: non-asker has no start control`, (await other.page.getByTestId('table-start').count()) === 0);
				await (await byId(asker.page, 'table-pick-question')).click();
				await (await byId(asker.page, 'table-start')).click();
				// the clock runs at VITE_CLASS_CLOCK_SPEED (20x): one speaker's minute is 3 s
				await byId(asker.page, 'time-over', TURN_TIMEOUT);
				await (await byId(asker.page, 'table-to-write')).click();
				const box = await byId(other.page, 'answer-box');
				await box.fill(`Turn ${turn}: an answer from the table`);
				await (await byId(other.page, 'answer-send')).click();
				await (await byId(asker.page, 'table-next-turn')).click();
			}
			check('table 1 completed two turns', true);
		},
	},
	{
		name: 'proposals, rating and plenum',
		async run({ teacher, students, check }) {
			await teacherForward(teacher, 'proposals');
			for (const student of students.slice(0, 3)) {
				await (await byId(student.page, 'proposal-box')).fill(`Proposal by student ${student.index + 1}`);
				await (await byId(student.page, 'proposal-send')).click();
			}
			for (const student of students.slice(3)) {
				const face = student.page.getByTestId('rate-face-5').first();
				await face.click({ timeout: TURN_TIMEOUT });
			}
			await (await byId(teacher, 'console-plenum')).click();
			check('plenum switched on', true);
		},
	},
	{
		name: 'ballot, vote and summary with support by side',
		async run({ teacher, students, check }) {
			await teacherForward(teacher, 'vote');
			for (const student of students) {
				await (await byId(student.page, 'vote-option')).click();
				await (await byId(student.page, 'vote-send')).click();
			}
			await (await byId(teacher, 'console-close-vote')).click();
			await teacherForward(teacher, 'summary');
			for (const student of students) {
				await (await byId(student.page, 'support-face-5')).click();
			}
			await teacher.goto(`${new URL(teacher.url()).origin}/t/${new URL(teacher.url()).pathname.split('/')[2]}/screen`);
			await teacher.locator('.projector-verdict').waitFor({ timeout: TURN_TIMEOUT });
			check(
				'projector shows the verdict',
				(await teacher.locator('.projector-support__row').count()) === 3,
			);
		},
	},
];
