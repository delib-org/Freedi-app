import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The teacher's class view shows the room as the students see it, with no
 * seat behind it — and a watcher that could write would be a seat that is
 * not counted. So the modules that write on a student's behalf (the
 * confirmed writes, the seen-state flush, the progress report, the student
 * side of the thread, the inbox) must never be imported here, and the five
 * stage components that mount with a seat must never be rendered. Pinned as
 * a test because an import is a one-line change nobody reviews.
 */
describe.each(['ClassView.ts', 'watchBodies.ts'])('%s never writes', (file) => {
	const source = readFileSync(resolve(__dirname, `../../views/teacher/${file}`), 'utf8');

	it.each([
		'lib/confirmedWrite',
		'lib/notifications',
		'lib/inbox',
		'lib/seenState',
		'lib/teacherThread',
		'lib/teacherConsole',
		'lib/looks',
		'lib/values',
		'views/Deliberation',
		'views/Positioning',
		'views/ValueIdentification',
		'views/ReRate',
		'components/Toast',
	])('never imports %s', (forbidden) => {
		expect(source).not.toMatch(new RegExp(`from '[./]*${forbidden}'`));
	});

	it.each(['RoundStage', 'QuestionStage', 'Deliberation', 'Positioning', 'SceneStage'])(
		'never mounts %s',
		(component) => {
			expect(source).not.toMatch(new RegExp(`m\\(${component}[,)]`));
		},
	);

	it('hands no seat to its children and reports no progress', () => {
		expect(source).not.toMatch(/myParticipant:\s*(?!null)[a-zA-Z]/);
		expect(source).not.toMatch(/reportStageProgress/);
		expect(source).not.toMatch(/stopListening|stopDeliberationListeners|stopVotingListeners/);
		expect(source).not.toMatch(/realName/);
	});
});

describe('ClassView hands the world nothing a student does not get', () => {
	const source = readFileSync(resolve(__dirname, '../../views/teacher/ClassView.ts'), 'utf8');

	it('passes the same paper builders as the student controller', () => {
		expect(source).toMatch(/papersFor\(stationNotes\(item\), userId, isProposalConfirmed\)/);
		expect(source).toMatch(/stationPapersFor\(plan, currentIndex, stationNotes, userId\)/);
	});

	it('is a watcher with no pen', () => {
		expect(source).toMatch(/writable: false/);
		expect(source).toMatch(/watcher: true/);
		expect(source).toMatch(/readOnly: true/);
	});
});
