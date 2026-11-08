import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The 3D world is a page every student runs. What the shell posts into it
 * is what every student could read, so the modules that build that payload
 * must never hold a real name: they never import the teacher console, and
 * never mention a real name at all. The teacher's author chip gets its
 * names through an attr the console passes in, and draws them in the
 * shell's own DOM, never in the iframe. Pinned as a test because an import
 * is a one-line change nobody reviews.
 */
describe.each(['components/VillageShell.ts', 'components/VillageCommunity.ts'])(
	'%s keeps names out of the world',
	(file) => {
		const source = readFileSync(resolve(__dirname, `../../${file}`), 'utf8');

		it('never imports the teacher console', () => {
			expect(source).not.toMatch(/from '[./]*lib\/teacherConsole'/);
		});

		it('never names a real name', () => {
			expect(source).not.toMatch(/realName/);
		});
	},
);

describe('the world payload', () => {
	const source = readFileSync(resolve(__dirname, '../../components/VillageShell.ts'), 'utf8');

	it('posts papers from the shared builders only, by pseudonym', () => {
		expect(source).toMatch(/papers: attrs\.papers/);
		expect(source).toMatch(/stationPapers: attrs\.stationPapers/);
		// the builders are the model's, and the model carries `author` = anonName
		const model = readFileSync(resolve(__dirname, '../flows/villageModel.ts'), 'utf8');
		expect(model).toMatch(/author: note\.anonName/);
		// a uid decides "own", and is never copied onto a paper
		expect(model).toMatch(/own: note\.creatorId === userId/);
		expect(model).not.toMatch(/creatorId: note\.creatorId/);
	});
});
