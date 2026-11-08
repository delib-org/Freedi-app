import type { LangCode } from './i18n';

/**
 * The playful faces a student may give their look.
 *
 * Every one is self-hosted through @fontsource, like Assistant and Alef, so
 * no student's IP reaches a font CDN and the PWA can cache what a class
 * actually uses. They are NOT precached at install (see vite.config.ts): a
 * face is loaded the first time a look asks for it, and only the subset the
 * page needs — the CSS carries a unicode-range per script.
 *
 * `langs` is what the builder filters on: a Hebrew student is offered faces
 * with Hebrew glyphs, an Arabic student faces with Arabic ones. A look built
 * in one language and worn in another simply falls back through the stack
 * to the app's own face — a Rubik Moonrocks look reads as Alef in Arabic,
 * which is the honest outcome.
 *
 * `weight` is the heaviest weight the face ships. Titles and buttons are set
 * at 700; a face with only a 400 would be faux-bolded by the browser, which
 * smears Hebrew stems, so the look block reads --display-weight instead.
 */
export interface PlayfulFont {
	id: string;
	family: string;
	langs: readonly LangCode[];
	weight: 400 | 700;
	load: () => Promise<unknown>;
}

const HE_LATIN: readonly LangCode[] = ['he', 'en', 'es', 'de', 'nl'];
const AR_LATIN: readonly LangCode[] = ['ar', 'en', 'es', 'de', 'nl'];
const LATIN: readonly LangCode[] = ['en', 'es', 'de', 'nl'];

export const PLAYFUL_FONTS: readonly PlayfulFont[] = [
	// --- Hebrew and Latin ---
	{
		id: 'fredoka',
		family: 'Fredoka',
		langs: HE_LATIN,
		weight: 700,
		load: () =>
			Promise.all([import('@fontsource/fredoka/400.css'), import('@fontsource/fredoka/700.css')]),
	},
	{
		id: 'varela-round',
		family: 'Varela Round',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/varela-round/400.css'),
	},
	{
		id: 'secular-one',
		family: 'Secular One',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/secular-one/400.css'),
	},
	{
		id: 'suez-one',
		family: 'Suez One',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/suez-one/400.css'),
	},
	{
		id: 'karantina',
		family: 'Karantina',
		langs: HE_LATIN,
		weight: 700,
		load: () =>
			Promise.all([
				import('@fontsource/karantina/400.css'),
				import('@fontsource/karantina/700.css'),
			]),
	},
	{
		id: 'amatic-sc',
		family: 'Amatic SC',
		langs: HE_LATIN,
		weight: 700,
		load: () =>
			Promise.all([
				import('@fontsource/amatic-sc/400.css'),
				import('@fontsource/amatic-sc/700.css'),
			]),
	},
	{
		id: 'rubik-bubbles',
		family: 'Rubik Bubbles',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/rubik-bubbles/400.css'),
	},
	{
		id: 'rubik-moonrocks',
		family: 'Rubik Moonrocks',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/rubik-moonrocks/400.css'),
	},
	{
		id: 'rubik-wet-paint',
		family: 'Rubik Wet Paint',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/rubik-wet-paint/400.css'),
	},
	{
		id: 'rubik-puddles',
		family: 'Rubik Puddles',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/rubik-puddles/400.css'),
	},
	{
		id: 'rubik-doodle-shadow',
		family: 'Rubik Doodle Shadow',
		langs: HE_LATIN,
		weight: 400,
		load: () => import('@fontsource/rubik-doodle-shadow/400.css'),
	},
	// --- Arabic and Latin ---
	{
		id: 'baloo-bhaijaan-2',
		family: 'Baloo Bhaijaan 2',
		langs: AR_LATIN,
		weight: 700,
		load: () =>
			Promise.all([
				import('@fontsource/baloo-bhaijaan-2/400.css'),
				import('@fontsource/baloo-bhaijaan-2/700.css'),
			]),
	},
	{
		id: 'lalezar',
		family: 'Lalezar',
		langs: AR_LATIN,
		weight: 400,
		load: () => import('@fontsource/lalezar/400.css'),
	},
	{
		id: 'marhey',
		family: 'Marhey',
		langs: AR_LATIN,
		weight: 700,
		load: () =>
			Promise.all([import('@fontsource/marhey/400.css'), import('@fontsource/marhey/700.css')]),
	},
	{
		id: 'cairo-play',
		family: 'Cairo Play',
		langs: AR_LATIN,
		weight: 700,
		load: () =>
			Promise.all([
				import('@fontsource/cairo-play/400.css'),
				import('@fontsource/cairo-play/700.css'),
			]),
	},
	// --- Latin only ---
	{
		id: 'lilita-one',
		family: 'Lilita One',
		langs: LATIN,
		weight: 400,
		load: () => import('@fontsource/lilita-one/400.css'),
	},
	{
		id: 'bubblegum-sans',
		family: 'Bubblegum Sans',
		langs: LATIN,
		weight: 400,
		load: () => import('@fontsource/bubblegum-sans/400.css'),
	},
	{
		id: 'chewy',
		family: 'Chewy',
		langs: LATIN,
		weight: 400,
		load: () => import('@fontsource/chewy/400.css'),
	},
	{
		id: 'luckiest-guy',
		family: 'Luckiest Guy',
		langs: LATIN,
		weight: 400,
		load: () => import('@fontsource/luckiest-guy/400.css'),
	},
];

/** The app's own display face — what every look wears unless it says otherwise */
const DEFAULT_STACK = "'Alef', 'Assistant', Arial, sans-serif";

export function fontById(id: string | undefined): PlayfulFont | undefined {
	return id === undefined ? undefined : PLAYFUL_FONTS.find((font) => font.id === id);
}

/** The faces that have glyphs for this language, in registry order */
export function fontsFor(lang: LangCode): readonly PlayfulFont[] {
	return PLAYFUL_FONTS.filter((font) => font.langs.includes(lang));
}

/** The family, then the app's own faces, so a missing script still reads */
export function fontStack(font: PlayfulFont): string {
	return `'${font.family}', ${DEFAULT_STACK}`;
}

const loaded = new Map<string, Promise<void>>();

/**
 * Fetch a face once. Idempotent and safe to call from a render: the second
 * call returns the first call's promise. Unknown ids resolve to nothing —
 * a look whose face this bundle no longer ships simply wears the default.
 */
export function loadFont(id: string): Promise<void> {
	const font = fontById(id);
	if (!font) return Promise.resolve();
	let pending = loaded.get(id);
	if (!pending) {
		pending = font.load().then(() => undefined);
		loaded.set(id, pending);
	}

	return pending;
}
