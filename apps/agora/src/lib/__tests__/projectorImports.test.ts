import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The projector shows the wall what the students see and nothing else. A
 * screen that could toast, read the post box, or list real names is a screen
 * that can leak them onto the wall — so the modules that carry any of that
 * must never be imported here. Pinned as a test because an import is a
 * one-line change nobody reviews.
 */
describe('ProjectorScreen imports', () => {
	const source = readFileSync(resolve(__dirname, '../../views/teacher/ProjectorScreen.ts'), 'utf8');

	it.each([
		'lib/notifications',
		'lib/inbox',
		'lib/seenState',
		'lib/teacherConsole',
		'lib/teacherThread',
		'components/Inbox',
		'components/Toast',
	])('never imports %s', (forbidden) => {
		expect(source).not.toMatch(new RegExp(`from '[./]*${forbidden}'`));
	});

	it('hands no seat to its children', () => {
		expect(source).not.toMatch(/myParticipant:\s*(?!null)[a-zA-Z]/);
		expect(source).not.toMatch(/realName/);
	});
});
