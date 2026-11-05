import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import he from '@/lib/locales/he';
import en from '@/lib/locales/en';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import nl from '@/lib/locales/nl';
import { consoleViewOf } from '../../consoleView';
import { sampleMates, sampleProposals, sampleResults } from '../sampleData';

const FOLDER = join(__dirname, '..');

function sourceFiles(): { name: string; text: string }[] {
	return readdirSync(FOLDER)
		.filter((name) => name.endsWith('.ts'))
		.map((name) => ({ name, text: readFileSync(join(FOLDER, name), 'utf8') }));
}

function importsOf(text: string): string[] {
	return Array.from(text.matchAll(/from\s+'([^']+)'/g)).map((match) => match[1]);
}

/** Modules that write, listen or mount the real student stage. */
const FORBIDDEN = [
	'studentWrites',
	'classroom/api',
	'classroom/c3Data',
	'classroom/proposals',
	'classroom/classState',
	'student/StudentStage',
	'student/steps/',
	'student/replies/',
	'student/c3/TableFlow',
	'student/c3/VoteScreen',
	'student/c3/SummaryScreen',
	'student/c3/VoteResults',
	'student/c2/SideView',
	'student/c2/TablesView',
	'student/c2/WaitingView',
];

describe('consoleViewOf', () => {
	it('keeps tables as the default and names the other two views', () => {
		expect(consoleViewOf(undefined)).toBe('tables');
		expect(consoleViewOf('tables')).toBe('tables');
		expect(consoleViewOf('texts')).toBe('texts');
		expect(consoleViewOf('student')).toBe('student');
		expect(consoleViewOf('nonsense')).toBe('tables');
	});
});

describe('the student screen sample is look-only', () => {
	it('imports nothing that writes, listens or mounts the real student stage', () => {
		for (const { name, text } of sourceFiles()) {
			for (const specifier of importsOf(text)) {
				for (const banned of FORBIDDEN) {
					expect(specifier.includes(banned), `${name} imports ${specifier}`).toBe(false);
				}
			}
		}
	});

	it('wraps the phone content in inert', () => {
		const sample = sourceFiles().find((file) => file.name === 'StudentScreenSample.ts');
		expect(sample?.text).toMatch(/inert:\s*true/);
	});

	it('gives no screen a live handler: every callback in screens.ts is the no-op', () => {
		const screens = sourceFiles().find((file) => file.name === 'screens.ts')?.text ?? '';
		expect(screens).not.toMatch(/onclick:\s*\(/);
		expect(screens).not.toMatch(/\bfetch\(|getDoc\(|onSnapshot\(/);
	});
});

describe('sample content', () => {
	it('is made of fixed strings, three tablemates and one "you"', () => {
		const mates = sampleMates();
		expect(mates).toHaveLength(3);
		expect(mates.filter((mate) => mate.isMe)).toHaveLength(1);
		expect(new Set(mates.map((mate) => mate.name)).size).toBe(3);
	});

	it('gives every sample proposal a share and the shares add up to about 100', () => {
		const proposals = sampleProposals();
		const results = sampleResults(proposals);
		const total = proposals.reduce((sum, p) => sum + results[p.statementId].percent, 0);
		expect(Object.keys(results)).toHaveLength(proposals.length);
		expect(total).toBeGreaterThanOrEqual(99);
		expect(total).toBeLessThanOrEqual(100);
	});
});

describe('translations', () => {
	const KEYS = [
		'console.student_screen',
		'console.student_screen_note',
		'student_screen.name_1',
		'student_screen.name_2',
		'student_screen.name_3',
		'student_screen.proposal_1',
		'student_screen.proposal_2',
		'student_screen.proposal_3',
	];

	it('every language has every key', () => {
		const languages: Record<string, Record<string, string>> = { en, he, ar, de, es, fa, nl };
		for (const [lang, dictionary] of Object.entries(languages)) {
			for (const key of KEYS) {
				expect(dictionary[key], `${lang} lacks ${key}`).toBeTruthy();
			}
		}
	});

	it('uses the agreed Hebrew label', () => {
		expect(he['console.student_screen']).toBe('מסך התלמידים');
		expect(he['console.student_screen_note']).toBe('דוגמה של תלמיד אחד. הטקסטים לא אמיתיים.');
	});
});
