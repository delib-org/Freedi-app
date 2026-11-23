import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

/**
 * The night look may never leak: the solid look, high contrast, the teacher
 * surface and the projector render the old stylesheets untouched (redesign port
 * spec, section 2). So every rule the night stylesheets emit starts with the
 * night scope, and only the token file holds a raw colour.
 */

const NIGHT_DIR = new URL('../', import.meta.url);
const SCOPE = ':root:not([data-look=solid]):not([data-high-contrast])[data-surface=student]';
/**
 * The projector lane (spec section 7.4) extends the night token block to its
 * own surface; that scope is as closed as this one, so it is allowed too.
 */
const PROJECTOR_SCOPE =
	':root:not([data-look=solid]):not([data-high-contrast])[data-surface=projector]';
const SCOPES = [SCOPE, PROJECTOR_SCOPE];
/** The stylesheets the app imports: the entry part and the three lazy ones. */
const ENTRIES = ['index.scss', 'c2.scss', 'c3.scss', 'state.scss'];
const TOKEN_FILE = '_tokens.scss';

function compiled(entry: string): string {
	return compile(fileURLToPath(new URL(entry, NIGHT_DIR))).css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The selectors of every style rule, at any depth of @media / @supports. */
function selectorsOf(css: string): string[] {
	const selectors: string[] = [];
	let depth = 0;
	let start = 0;
	/** Depth at which a conditional group (@media, @supports) opened. */
	const groups: number[] = [];
	for (let i = 0; i < css.length; i++) {
		const char = css[i];
		if (char === '{') {
			const prelude = css.slice(start, i).trim();
			const inRule = depth > groups.length;
			if (!inRule && /^@(media|supports)\b/.test(prelude)) groups.push(depth);
			else if (!inRule) selectors.push(...splitSelectors(prelude));
			depth += 1;
			start = i + 1;
		} else if (char === '}') {
			depth -= 1;
			if (groups[groups.length - 1] === depth) groups.pop();
			start = i + 1;
		} else if (char === ';' && depth === groups.length) {
			start = i + 1;
		}
	}

	return selectors;
}

/** Split a selector list on the commas that are not inside brackets. */
function splitSelectors(list: string): string[] {
	const parts: string[] = [];
	let nesting = 0;
	let current = '';
	for (const char of list) {
		if (char === '(' || char === '[') nesting += 1;
		if (char === ')' || char === ']') nesting -= 1;
		if (char === ',' && nesting === 0) {
			parts.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}
	parts.push(current.trim());

	return parts.filter(Boolean);
}

function normalized(selector: string): string {
	return selector.replace(/["']/g, '');
}

describe('the night look stays inside its scope', () => {
	for (const entry of ENTRIES) {
		it(`every rule of ${entry} starts with the night scope`, () => {
			const selectors = selectorsOf(compiled(entry));
			const leaked = selectors.filter(
				(selector) => !SCOPES.some((scope) => normalized(selector).startsWith(scope)),
			);

			expect(selectors.length).toBeGreaterThan(0);
			expect(leaked).toEqual([]);
		});

		it(`${entry} adds no keyframes and no font face`, () => {
			expect(compiled(entry)).not.toMatch(/@(keyframes|font-face)\b/);
		});
	}

	it('finds an unscoped rule when there is one (the check itself works)', () => {
		const css = `${SCOPE} .a, ${SCOPE} .b:not(.c, .d) { color: red; } @media (min-width: 1px) { .leak { color: red; } }`;

		expect(selectorsOf(css)).toEqual([`${SCOPE} .a`, `${SCOPE} .b:not(.c, .d)`, '.leak']);
	});
});

describe('night colours live in the token file', () => {
	const partials = readdirSync(NIGHT_DIR).filter(
		(name) => name.endsWith('.scss') && name !== TOKEN_FILE,
	);

	it('no partial but the tokens holds a raw colour', () => {
		const offenders = partials.filter((name) => {
			const source = readFileSync(new URL(name, NIGHT_DIR), 'utf8')
				.replace(/\/\/.*$/gm, '')
				.replace(/#\{/g, '');

			return /#[0-9a-f]{3,8}\b|%23[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i.test(source);
		});

		expect(partials.length).toBeGreaterThan(0);
		expect(offenders).toEqual([]);
	});
});
