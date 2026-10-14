import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translations } from '../../i18n';

/** Every `.ts` file under `dir`, so the test reads the library's real sources */
function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);

		return path.endsWith('.ts') ? [path] : [];
	});
}

const ROOT = join(__dirname, '..', '..', '..');
const FILES = [
	...sources(join(ROOT, 'views', 'teacher', 'scenarioLibrary')),
	...sources(join(ROOT, 'components', 'scenarioLibrary')),
	...sources(join(ROOT, 'lib', 'scenarioLibrary')),
	join(ROOT, 'components', 'TeacherNav.ts'),
	join(ROOT, 'views', 'teacher', 'TeacherHome.ts'),
	join(ROOT, 'views', 'teacher', 'StartGame.ts'),
];

/** Keys built from a variable: the literal prefix plus every value the code can pass */
const DYNAMIC: Record<string, string[]> = {
	'scenlib.sort_': ['rating', 'new', 'used'],
	'scenlib.notice_': ['published', 'unpublished', 'failed'],
	'scenlib.adm_kind_': ['scenario', 'review', 'post'],
	'scenlib.report_': ['scenario', 'review', 'post'],
};

describe('scenario library strings', () => {
	const used = new Set<string>();
	for (const file of FILES) {
		for (const match of readFileSync(file, 'utf8').matchAll(/['"`](scenlib\.[a-z_0-9]+)/g)) {
			used.add(match[1]);
		}
	}

	it('finds the keys the screens use', () => {
		expect(used.size).toBeGreaterThan(80);
	});

	it('defines every key the screens use, in every language', () => {
		const missing: string[] = [];
		for (const [lang, dictionary] of Object.entries(translations)) {
			for (const key of used) {
				const variants = DYNAMIC[key] ? DYNAMIC[key].map((suffix) => key + suffix) : [key];
				for (const variant of variants) {
					if (!dictionary[variant]) missing.push(`${lang}:${variant}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	it('has the one-form of every counted phrase', () => {
		for (const dictionary of Object.values(translations)) {
			expect(dictionary['scenlib.count_one']).toBeTruthy();
			expect(dictionary['scenlib.copied_n_one']).toBeTruthy();
			expect(dictionary['scenlib.rated_by_one']).toBeTruthy();
		}
	});
});
