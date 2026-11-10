import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '../../../..');
const SOURCE_FILE = /\.(ts|tsx)$/;

function productionFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(path);

		return SOURCE_FILE.test(entry.name) ? [path] : [];
	});
}

/**
 * The recompute overwrites live counters and reads every rating of a question.
 * Counters of old questions are a release step, so the app must never call it.
 */
describe('the main app and the question progress recompute', () => {
	const files = productionFiles(SRC);

	it('scans the app source', () => {
		expect(files.some((file) => file.endsWith('useParticipationStats.ts'))).toBe(true);
	});

	it('never names the recompute callable', () => {
		const callers = files
			.filter((file) => /recomputeQuestionProgress/i.test(readFileSync(file, 'utf8')))
			.map((file) => relative(SRC, file));

		expect(callers).toEqual([]);
	});
});
