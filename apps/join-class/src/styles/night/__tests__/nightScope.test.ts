import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

/**
 * The night look may never leak: the solid look, high contrast and the teacher
 * surface render the old stylesheets untouched (redesign port spec, section 2).
 * So every rule the night stylesheets emit starts with the night scope, and only
 * the token file holds a raw colour. The projector wears the same look at room
 * scale (section 7.4) from its own folder, checked the same way below.
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

/**
 * The projector's own stylesheets (styles/night-projector/**, one lazy entry):
 * every rule there sits under the projector scope alone, and the video mode
 * (black letterbox) is never matched.
 */
const PROJECTOR_DIR = new URL('../../night-projector/', import.meta.url);
const PROJECTOR_ENTRY = 'index.scss';
const WALL = `${PROJECTOR_SCOPE} .projector:not(.projector--video)`;
const WALL_RTL = `${PROJECTOR_SCOPE}[dir=rtl] .projector:not(.projector--video)`;

function compiled(entry: string, dir: URL = NIGHT_DIR): string {
	return compile(fileURLToPath(new URL(entry, dir))).css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Stylesheets of a folder that hold a raw colour (hex, a hex inside a data URI, rgb / hsl). */
function partialsWithRawColour(dir: URL, names: readonly string[]): string[] {
	return names.filter((name) => {
		const source = readFileSync(new URL(name, dir), 'utf8')
			.replace(/\/\/.*$/gm, '')
			.replace(/#\{/g, '');

		return /#[0-9a-f]{3,8}\b|%23[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i.test(source);
	});
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
		expect(partials.length).toBeGreaterThan(0);
		expect(partialsWithRawColour(NIGHT_DIR, partials)).toEqual([]);
	});
});

describe('the night projector look stays inside its scope', () => {
	const css = compiled(PROJECTOR_ENTRY, PROJECTOR_DIR);
	const selectors = selectorsOf(css).map(normalized);

	it('every rule sits under the projector scope, on the wall and never in video mode', () => {
		const leaked = selectors.filter(
			(selector) => !selector.startsWith(WALL) && !selector.startsWith(WALL_RTL),
		);

		expect(selectors.length).toBeGreaterThan(0);
		expect(leaked).toEqual([]);
	});

	it('no rule reaches the student or the teacher surface', () => {
		expect(css).not.toMatch(/data-surface=["']?(student|teacher)/);
	});

	it('adds no keyframes and no font face', () => {
		expect(css).not.toMatch(/@(keyframes|font-face)\b/);
	});

	it('no partial holds a raw colour: the colours are the night tokens', () => {
		const partials = readdirSync(PROJECTOR_DIR).filter((name) => name.endsWith('.scss'));

		expect(partials.length).toBeGreaterThan(0);
		expect(partialsWithRawColour(PROJECTOR_DIR, partials)).toEqual([]);
	});

	it('moves by transform and opacity only', () => {
		const moved = [...css.matchAll(/transition(?:-property)?:([^;}]+)/g)].flatMap((match) =>
			match[1].split(',').map((part) => part.trim().split(/\s+/)[0]),
		);

		expect(
			moved.filter((property) => !['transform', 'opacity', 'none'].includes(property)),
		).toEqual([]);
	});
});

describe("the room-scale tokens are the projector's alone", () => {
	const css = compiled(TOKEN_FILE);

	/** The declarations of every rule whose selector list is exactly `selectors`. */
	function blocksOf(selectors: readonly string[]): string[] {
		const wanted = selectors.join(',');
		const blocks: string[] = [];
		for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const list = splitSelectors(match[1].replace(/@media[^{]*$/, '')).map(normalized);
			if (list.join(',') === wanted) blocks.push(match[2]);
		}

		return blocks;
	}

	it("the look's tokens are one block shared by both scopes, not a copy", () => {
		const shared = blocksOf([SCOPE, PROJECTOR_SCOPE]);

		expect(shared.some((block) => block.includes('--night-sky:'))).toBe(true);
		expect(blocksOf([SCOPE]).some((block) => block.includes('--night-'))).toBe(false);
	});

	it('the room scale is declared for the projector scope only', () => {
		const room = blocksOf([PROJECTOR_SCOPE]);

		expect(room.some((block) => block.includes('--night-room:'))).toBe(true);
		expect(blocksOf([SCOPE, PROJECTOR_SCOPE]).join('')).not.toContain('--night-room');
	});
});
