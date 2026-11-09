import {
	applyThemeColor,
	findOpaqueBackground,
	getHeaderElements,
	resolveStatusBarColor,
	restoreInitialThemeColor,
	syncStatusBarColor,
} from '../systemBarSync';

const PAGE = 'rgb(11, 15, 23)';
const LILAC = 'rgb(232, 226, 255)';

function setRect(element: Element, top: number, height: number): void {
	element.getBoundingClientRect = () =>
		({ top, bottom: top + height, height, left: 0, right: 0, width: 0 }) as DOMRect;
}

function buildScreen(headerColor: string): { header: HTMLElement; body: HTMLElement } {
	document.body.style.backgroundColor = PAGE;
	document.body.innerHTML =
		'<div class="page__header"><div class="page__header__full"></div></div>' +
		'<div id="toast" style="background-color: rgb(255, 0, 0)">toast</div>';

	const header = document.querySelector<HTMLElement>('.page__header') as HTMLElement;
	const body = document.querySelector<HTMLElement>('.page__header__full') as HTMLElement;

	body.style.backgroundColor = headerColor;
	setRect(header, 0, 120);

	return { header, body };
}

const metaContent = (): string[] =>
	Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
		(meta) => meta.content,
	);

describe('systemBarSync', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
		document.body.innerHTML = '';
		document.body.removeAttribute('style');
	});

	describe('findOpaqueBackground', () => {
		it('skips transparent and translucent layers', () => {
			document.body.innerHTML = '<div id="a"><div id="b"><span id="c"></span></div></div>';
			const backgrounds: Record<string, string> = {
				c: 'rgba(0, 0, 0, 0)',
				b: 'rgba(0, 0, 0, 0.4)',
				a: LILAC,
			};

			expect(
				findOpaqueBackground(document.getElementById('c'), (el) => backgrounds[el.id] ?? ''),
			).toBe('#e8e2ff');
		});

		it('returns null for null start, nothing opaque, or an unparseable colour', () => {
			expect(findOpaqueBackground(null, () => LILAC)).toBeNull();
			expect(findOpaqueBackground(document.body, () => 'rgba(0, 0, 0, 0)')).toBeNull();
			expect(findOpaqueBackground(document.body, () => 'oklch(0.5 0.1 200)')).toBeNull();
		});
	});

	describe('resolveStatusBarColor', () => {
		it('uses the header while it is at the top', () => {
			buildScreen(LILAC);

			expect(resolveStatusBarColor(document, window)).toBe('#e8e2ff');
		});

		it('falls back to the page background when the header is scrolled away or collapsed', () => {
			const { header } = buildScreen(LILAC);

			setRect(header, -200, 120);
			expect(resolveStatusBarColor(document, window)).toBe('#0b0f17');

			setRect(header, 0, 0);
			expect(resolveStatusBarColor(document, window)).toBe('#0b0f17');
		});

		it('ignores an opaque overlay sitting over the top of the screen', () => {
			buildScreen(LILAC);
			document.elementFromPoint = jest.fn(() => document.getElementById('toast'));

			expect(resolveStatusBarColor(document, window)).toBe('#e8e2ff');
			expect(document.elementFromPoint).not.toHaveBeenCalled();
		});

		it('samples the home header (.homePage__header), not the avatar pill inside it', () => {
			document.body.style.backgroundColor = PAGE;
			document.body.innerHTML =
				'<div class="homePage__header" style="background-color: rgb(251, 250, 247)">' +
				'<span id="pill" style="background-color: rgb(38, 56, 84)"></span></div>';
			setRect(document.querySelector('.homePage__header') as Element, 0, 48);

			expect(resolveStatusBarColor(document, window)).toBe('#fbfaf7');
		});

		it('samples the global .app-header bar (my-suggestions)', () => {
			document.body.style.backgroundColor = PAGE;
			document.body.innerHTML = `<div class="app-header" style="background-color: ${LILAC}"></div>`;
			setRect(document.querySelector('.app-header') as Element, 0, 56);

			expect(resolveStatusBarColor(document, window)).toBe('#e8e2ff');
		});

		it('skips a header that is not at the top and uses the one that is', () => {
			document.body.style.backgroundColor = PAGE;
			document.body.innerHTML =
				'<div class="app-header" id="low" style="background-color: rgb(255, 0, 0)"></div>' +
				`<div class="page__header" id="top" style="background-color: ${LILAC}"></div>`;
			setRect(document.getElementById('low') as Element, 300, 56);
			setRect(document.getElementById('top') as Element, 0, 56);

			expect(resolveStatusBarColor(document, window)).toBe('#e8e2ff');
		});

		it('uses the page background on screens with no header (/my, notification settings)', () => {
			document.body.style.backgroundColor = PAGE;
			document.body.innerHTML = '<main><h1>Me</h1></main>';

			expect(resolveStatusBarColor(document, window)).toBe('#0b0f17');
		});

		it('falls back to the page when there is no header at all', () => {
			document.body.style.backgroundColor = PAGE;

			expect(resolveStatusBarColor(document, window)).toBe('#0b0f17');
		});
	});

	describe('getHeaderElements', () => {
		it('returns the header and its body, or nothing', () => {
			expect(getHeaderElements(document)).toEqual([]);
			buildScreen(LILAC);
			expect(getHeaderElements(document)).toHaveLength(2);
		});
	});

	describe('theme-color metas', () => {
		const twoMetas =
			'<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">' +
			'<meta name="theme-color" content="#0b0f17" media="(prefers-color-scheme: dark)">';

		it('creates the meta when missing and reports changes', () => {
			expect(applyThemeColor(document, '#e8e2ff')).toBe(true);
			expect(applyThemeColor(document, '#e8e2ff')).toBe(false);
			expect(metaContent()).toEqual(['#e8e2ff']);
		});

		it('sets every meta to the same colour', () => {
			document.head.innerHTML = twoMetas;
			applyThemeColor(document, '#123456');

			expect(metaContent()).toEqual(['#123456', '#123456']);
		});

		it('restores each first-paint value when the colour cannot be read', () => {
			document.head.innerHTML = twoMetas;
			buildScreen(LILAC);
			syncStatusBarColor(document, window);
			expect(metaContent()).toEqual(['#e8e2ff', '#e8e2ff']);

			// Both header and page now use a colour we cannot parse.
			document.body.style.backgroundColor = '';
			jest.spyOn(window, 'getComputedStyle').mockReturnValue({
				backgroundColor: 'oklch(0.5 0.1 200)',
			} as CSSStyleDeclaration);
			syncStatusBarColor(document, window);

			expect(metaContent()).toEqual(['#fbfaf7', '#0b0f17']);
			jest.restoreAllMocks();
		});

		it('restore is a no-op before any sync', () => {
			document.head.innerHTML = twoMetas;
			restoreInitialThemeColor(document);

			expect(metaContent()).toEqual(['#fbfaf7', '#0b0f17']);
		});
	});
});
