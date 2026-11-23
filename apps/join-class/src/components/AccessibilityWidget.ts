/**
 * AccessibilityWidget — a draggable floating button that exposes:
 *   • Font-size increase / decrease (clamped to 14–24 px)
 *   • High-contrast mode toggle
 *
 * Vanilla-TS port of the React Accessibility component from the main app.
 * Uses the same localStorage key ('userConfig') so preferences carry across.
 *
 * Architecture notes:
 *   • Self-contained DOM module — no Mithril, no framework dependency.
 *   • All interaction goes through `a11yStore` (lib/accessibility.ts).
 *   • Panel auto-closes after 10 s of inactivity (matching main-app behaviour).
 *   • Drag is pointer-event based (works on mouse + touch + stylus).
 */

import { a11yStore } from '../lib/accessibility';
import { clampTop, firstClearTop, readSavedTop, saveTop } from '../lib/a11yPlacement';
import {
	t,
	getLang,
	setLang,
	getAvailableLanguages,
	isLanguageForced,
	onLangChange,
} from '../lib/i18n';

const AUTO_CLOSE_MS = 10_000;

/** Keeping the tab off pressable content: how far apart the spots tried are, and the pause after a change. */
const PLACEMENT_STEP_PX = 48;
const PLACEMENT_TOP_MIN_PX = 8;
const PLACEMENT_BOTTOM_GAP_PX = 100;
const PLACEMENT_DEBOUNCE_MS = 300;
/** Heights inside the 44 px tab that are probed for something pressable beneath it. */
const PLACEMENT_PROBES_PX = [4, 22, 40];
const PRESSABLE =
	'a[href], button, input, select, textarea, summary, label, [role="button"], [role="tab"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])';

// --------------------------------------------------------------------------
// SVG icons (inlined to avoid any asset pipeline dependency)
// --------------------------------------------------------------------------
const ACCESSIBILITY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" focusable="false" width="24" height="24">
  <circle cx="12" cy="4" r="1.5"/>
  <path d="M5.5 8.5 12 7l6.5 1.5"/>
  <path d="M9 12v5l3 3 3-3v-5"/>
  <path d="M7.5 12.5 9 12"/>
  <path d="M16.5 12.5 15 12"/>
</svg>`;

const HIGH_CONTRAST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" focusable="false" width="18" height="18">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor"/>
</svg>`;

const LIGHT_CONTRAST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" focusable="false" width="18" height="18">
  <circle cx="12" cy="12" r="10"/>
</svg>`;

/** True when a line of the element's own text is drawn at this point (not just its empty padding). */
function hasTextAt(el: Element, x: number, y: number): boolean {
	try {
		for (const node of Array.from(el.childNodes)) {
			if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			const hit = Array.from(range.getClientRects()).some(
				(r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
			);
			if (hit) return true;
		}
	} catch {
		// no layout (a test DOM): nothing can be said to be under the tab
	}

	return false;
}

function safeStorage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

// --------------------------------------------------------------------------
// Widget class
// --------------------------------------------------------------------------
export class AccessibilityWidget {
	private root: HTMLDivElement;
	private triggerBtn: HTMLButtonElement;
	private panel: HTMLDivElement;
	private fontSizeLabel: HTMLSpanElement;

	// Language row references — refreshed on every lang/force change so the
	// select tracks programmatic changes (admin pushed a defaultLanguage) and
	// the row hides/returns as the teacher's lock flips.
	private langSelect: HTMLSelectElement | null = null;
	private langRow: HTMLDivElement | null = null;
	private langRowLabel: HTMLSpanElement | null = null;
	private unsubscribeLang: (() => void) | null = null;

	private isOpen = false;
	private placementTimer: ReturnType<typeof setTimeout> | null = null;
	private placementObserver: MutationObserver | null = null;
	private onResizePlacement: (() => void) | null = null;
	private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

	// Drag state
	private isDragging = false;
	private dragMoved = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragStartTop = 0;

	// Current vertical position (px from top)
	private positionTop: number;

	constructor() {
		const saved = readSavedTop(safeStorage());
		this.positionTop =
			saved === null
				? Math.max(80, window.innerHeight * 0.3)
				: clampTop(saved, window.innerHeight, PLACEMENT_TOP_MIN_PX, PLACEMENT_BOTTOM_GAP_PX);
		// It may still step aside (not saved) when it would cover something pressable.

		this.root = this.buildRoot();
		this.triggerBtn = this.buildTriggerButton();
		this.panel = this.buildPanel();
		this.fontSizeLabel = this.panel.querySelector<HTMLSpanElement>('.a11y-widget__font-label')!;

		this.root.appendChild(this.triggerBtn);
		this.root.appendChild(this.panel);
		document.body.appendChild(this.root);

		this.bindPointerDrag();
		this.bindKeyboard();
		this.bindClickOutside();

		// Re-render when store changes (e.g. from a different tab)
		a11yStore.onChange(() => this.updateUI());
		// Re-render when language flips (user picked, admin pushed, force toggled)
		// so the select value, lock chip, and translated labels stay accurate.
		this.unsubscribeLang = onLangChange(() => this.updateUI());
		this.updateUI();
		this.watchPlacement();
	}

	// --------------------------------------------------------------------------
	// DOM construction
	// --------------------------------------------------------------------------
	private buildRoot(): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'a11y-widget';
		el.style.top = `${this.positionTop}px`;

		return el;
	}

	private buildTriggerButton(): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = 'a11y-widget__trigger';
		btn.setAttribute('aria-label', t('a11y.trigger'));
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-controls', 'a11y-panel');
		// Explicitly set type to prevent form submission if nested in a form
		btn.type = 'button';
		btn.innerHTML = ACCESSIBILITY_SVG;

		return btn;
	}

	private buildPanel(): HTMLDivElement {
		const panel = document.createElement('div');
		panel.id = 'a11y-panel';
		panel.className = 'a11y-widget__panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-modal', 'false');
		panel.setAttribute('aria-label', t('a11y.panel_label'));
		// Visibility/animation is driven by the `.a11y-widget--open` class on the
		// root (see _components.scss). We use aria-hidden, not the `hidden`
		// attribute, because `hidden` sets display:none which kills the slide
		// animation. CSS `visibility: hidden` (with delayed transition) still
		// removes the panel from the a11y tree and from focus order when closed.
		panel.setAttribute('aria-hidden', 'true');

		// --- Font size row ---
		const fontRow = document.createElement('div');
		fontRow.className = 'a11y-widget__row a11y-widget__row--font';
		fontRow.setAttribute('role', 'group');
		fontRow.setAttribute('aria-label', t('a11y.font_size'));

		const decreaseBtn = this.buildIconButton('–', t('a11y.decrease_font'), () =>
			this.changeFontSize(-1),
		);
		const label = document.createElement('span');
		label.className = 'a11y-widget__font-label';
		label.setAttribute('aria-live', 'polite');
		label.setAttribute('aria-atomic', 'true');
		label.textContent = 'Aa';

		const increaseBtn = this.buildIconButton('+', t('a11y.increase_font'), () =>
			this.changeFontSize(+1),
		);

		fontRow.appendChild(decreaseBtn);
		fontRow.appendChild(label);
		fontRow.appendChild(increaseBtn);

		// --- Contrast row ---
		const contrastRow = document.createElement('div');
		contrastRow.className = 'a11y-widget__row a11y-widget__row--contrast';
		contrastRow.setAttribute('role', 'group');
		contrastRow.setAttribute('aria-label', t('a11y.contrast'));

		const hcBtn = document.createElement('button');
		hcBtn.type = 'button';
		hcBtn.className = 'a11y-widget__contrast-btn a11y-widget__contrast-btn--high';
		hcBtn.setAttribute('aria-pressed', 'false');
		hcBtn.innerHTML = `${HIGH_CONTRAST_SVG}<span>${t('a11y.high_contrast')}</span>`;
		hcBtn.addEventListener('click', () => {
			a11yStore.setHighContrast(true);
			this.resetAutoClose();
		});

		const lcBtn = document.createElement('button');
		lcBtn.type = 'button';
		lcBtn.className = 'a11y-widget__contrast-btn a11y-widget__contrast-btn--light';
		lcBtn.setAttribute('aria-pressed', 'false');
		lcBtn.innerHTML = `${LIGHT_CONTRAST_SVG}<span>${t('a11y.light_contrast')}</span>`;
		lcBtn.addEventListener('click', () => {
			a11yStore.setHighContrast(false);
			this.resetAutoClose();
		});

		contrastRow.appendChild(hcBtn);
		contrastRow.appendChild(lcBtn);

		// --- Language row ---
		// A simple <label> + native <select>. The native select gives us free
		// OS-level keyboard, RTL handling, and (on mobile) the OS's own picker —
		// by far the most familiar pattern for "pick from a list of 7". Native
		// language names (with dir="auto" on each option) sidestep the political
		// baggage of flags. The whole row is hidden while the teacher's lock is on.
		const languageRow = document.createElement('div');
		languageRow.className = 'a11y-widget__row a11y-widget__row--language';
		languageRow.setAttribute('role', 'group');
		languageRow.setAttribute('aria-label', t('a11y.language'));

		const langLabel = document.createElement('span');
		langLabel.className = 'a11y-widget__lang-label';
		langLabel.textContent = t('a11y.language');
		this.langRowLabel = langLabel;

		const langSelect = document.createElement('select');
		langSelect.className = 'a11y-widget__lang-select';
		langSelect.setAttribute('aria-label', t('a11y.language'));
		for (const { code, name } of getAvailableLanguages()) {
			const opt = document.createElement('option');
			opt.value = code;
			opt.textContent = name;
			// dir="auto" so RTL native names render correctly even when the
			// surrounding select is mounted in an LTR document.
			opt.setAttribute('dir', 'auto');
			langSelect.appendChild(opt);
		}
		langSelect.value = getLang();
		langSelect.addEventListener('change', (e) => {
			const code = (e.target as HTMLSelectElement).value;
			setLang(code);
			this.resetAutoClose();
		});
		this.langSelect = langSelect;

		languageRow.appendChild(langLabel);
		languageRow.appendChild(langSelect);
		this.langRow = languageRow;

		panel.appendChild(fontRow);
		panel.appendChild(contrastRow);
		panel.appendChild(languageRow);

		return panel;
	}

	private buildIconButton(
		glyph: string,
		ariaLabel: string,
		onClick: () => void,
	): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'a11y-widget__icon-btn';
		btn.setAttribute('aria-label', ariaLabel);
		btn.textContent = glyph;
		btn.addEventListener('click', () => {
			onClick();
			this.resetAutoClose();
		});

		return btn;
	}

	// --------------------------------------------------------------------------
	// UI state sync
	// --------------------------------------------------------------------------
	private updateUI(): void {
		const prefs = a11yStore.getPrefs();

		// Font label reflects current size
		if (this.fontSizeLabel) {
			this.fontSizeLabel.textContent = `Aa ${prefs.fontSize}px`;
		}

		// High-contrast button pressed states
		const hcBtn = this.panel.querySelector<HTMLButtonElement>('.a11y-widget__contrast-btn--high');
		const lcBtn = this.panel.querySelector<HTMLButtonElement>('.a11y-widget__contrast-btn--light');
		if (hcBtn) hcBtn.setAttribute('aria-pressed', String(prefs.highContrast));
		if (lcBtn) lcBtn.setAttribute('aria-pressed', String(!prefs.highContrast));

		// Trigger button: reflect active high-contrast state visually
		if (prefs.highContrast) {
			this.triggerBtn.classList.add('a11y-widget__trigger--active');
		} else {
			this.triggerBtn.classList.remove('a11y-widget__trigger--active');
		}

		this.refreshLabels();

		// Language row sync — value, visibility, label texts.
		// We refresh translated strings here too so a language change made in the
		// widget itself flips its own labels without needing a separate code path.
		const forced = isLanguageForced();
		if (this.langSelect) {
			const activeLang = getLang();
			if (this.langSelect.value !== activeLang) {
				this.langSelect.value = activeLang;
			}
			this.langSelect.setAttribute('aria-label', t('a11y.language'));
		}
		if (this.langRowLabel) {
			this.langRowLabel.textContent = t('a11y.language');
		}
		// A teacher's lock removes the choice altogether rather than greying it out.
		if (this.langRow) this.langRow.hidden = forced;
		// Trigger button aria-label may include "language" — refresh on each
		// language change so screen readers announce the localized version.
		this.triggerBtn.setAttribute('aria-label', t('a11y.trigger'));
		this.panel.setAttribute('aria-label', t('a11y.panel_label'));
	}

	/** The panel is built once; its words follow the language (it was left English in a Hebrew UI). */
	private refreshLabels(): void {
		const setText = (selector: string, text: string): void => {
			const el = this.panel.querySelector<HTMLElement>(selector);
			if (el) el.textContent = text;
		};
		const setLabel = (selector: string, text: string): void => {
			this.panel.querySelector<HTMLElement>(selector)?.setAttribute('aria-label', text);
		};
		setText('.a11y-widget__contrast-btn--high span', t('a11y.high_contrast'));
		setText('.a11y-widget__contrast-btn--light span', t('a11y.light_contrast'));
		setLabel('.a11y-widget__row--font', t('a11y.font_size'));
		setLabel('.a11y-widget__row--contrast', t('a11y.contrast'));
		setLabel('.a11y-widget__row--language', t('a11y.language'));
		const [decrease, increase] = Array.from(
			this.panel.querySelectorAll<HTMLElement>('.a11y-widget__icon-btn'),
		);
		decrease?.setAttribute('aria-label', t('a11y.decrease_font'));
		increase?.setAttribute('aria-label', t('a11y.increase_font'));
	}

	// --------------------------------------------------------------------------
	// Panel open/close
	// --------------------------------------------------------------------------
	private openPanel(): void {
		if (this.isOpen) return;
		this.isOpen = true;
		this.root.classList.add('a11y-widget--open');
		this.panel.setAttribute('aria-hidden', 'false');
		this.triggerBtn.setAttribute('aria-expanded', 'true');

		// Move focus into the panel's first interactive child
		const firstBtn = this.panel.querySelector<HTMLButtonElement>('button');
		firstBtn?.focus();

		this.resetAutoClose();
	}

	private closePanel(): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.root.classList.remove('a11y-widget--open');
		this.panel.setAttribute('aria-hidden', 'true');
		this.triggerBtn.setAttribute('aria-expanded', 'false');
		this.clearAutoClose();
	}

	private togglePanel(): void {
		if (this.isOpen) {
			this.closePanel();
		} else {
			this.openPanel();
		}
	}

	// --------------------------------------------------------------------------
	// Auto-close timer
	// --------------------------------------------------------------------------
	private resetAutoClose(): void {
		this.clearAutoClose();
		this.autoCloseTimer = setTimeout(() => this.closePanel(), AUTO_CLOSE_MS);
	}

	private clearAutoClose(): void {
		if (this.autoCloseTimer !== null) {
			clearTimeout(this.autoCloseTimer);
			this.autoCloseTimer = null;
		}
	}

	// --------------------------------------------------------------------------
	// Font size
	// --------------------------------------------------------------------------
	private changeFontSize(delta: number): void {
		const current = a11yStore.getPrefs().fontSize;
		a11yStore.setFontSize(current + delta);
	}

	// --------------------------------------------------------------------------
	// Pointer drag (mouse + touch + stylus)
	// --------------------------------------------------------------------------
	private bindPointerDrag(): void {
		this.triggerBtn.addEventListener('pointerdown', (e: PointerEvent) => {
			// Only drag with primary button / touch
			if (e.button > 0) return;

			this.isDragging = false;
			this.dragMoved = false;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.dragStartTop = this.positionTop;

			this.triggerBtn.setPointerCapture(e.pointerId);

			const onMove = (ev: PointerEvent): void => {
				const dx = Math.abs(ev.clientX - this.dragStartX);
				const dy = Math.abs(ev.clientY - this.dragStartY);

				if (!this.isDragging && (dx > 5 || dy > 5)) {
					this.isDragging = true;
					this.dragMoved = true;
					this.root.classList.add('a11y-widget--dragging');
				}

				if (this.isDragging) {
					const deltaY = ev.clientY - this.dragStartY;
					this.positionTop = Math.min(
						Math.max(this.dragStartTop + deltaY, 0),
						window.innerHeight - 100,
					);
					this.root.style.top = `${this.positionTop}px`;
				}
			};

			const onUp = (): void => {
				this.triggerBtn.removeEventListener('pointermove', onMove);
				this.triggerBtn.removeEventListener('pointerup', onUp);
				this.triggerBtn.removeEventListener('pointercancel', onUp);
				this.root.classList.remove('a11y-widget--dragging');

				if (!this.dragMoved) {
					// It was a tap, not a drag — toggle the panel
					this.togglePanel();
				} else {
					saveTop(safeStorage(), this.positionTop);
				}

				this.isDragging = false;
				this.dragMoved = false;
			};

			this.triggerBtn.addEventListener('pointermove', onMove);
			this.triggerBtn.addEventListener('pointerup', onUp);
			this.triggerBtn.addEventListener('pointercancel', onUp);

			// Prevent default to stop text selection on mobile
			e.preventDefault();
		});
	}

	// --------------------------------------------------------------------------
	// Keyboard: Enter/Space on trigger, Escape closes
	// --------------------------------------------------------------------------
	private bindKeyboard(): void {
		this.triggerBtn.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.togglePanel();
			}
		});

		document.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.isOpen) {
				this.closePanel();
				this.triggerBtn.focus();
			}
		});
	}

	// --------------------------------------------------------------------------
	// Click outside
	// --------------------------------------------------------------------------
	private bindClickOutside(): void {
		document.addEventListener(
			'pointerdown',
			(e: PointerEvent) => {
				if (!this.isOpen) return;
				const target = e.target as Node;
				if (!this.root.contains(target)) {
					this.closePanel();
				}
			},
			{ capture: true },
		);
	}

	// --------------------------------------------------------------------------
	// Stay off pressable content (the tab is 44 px: it must not cover a radio or a tab)
	// --------------------------------------------------------------------------
	private isBlockedAt(top: number): boolean {
		const rect = this.triggerBtn.getBoundingClientRect();
		const x = rect.left + rect.width / 2;

		return PLACEMENT_PROBES_PX.some((offset) =>
			document
				.elementsFromPoint(x, top + offset)
				.some(
					(el) =>
						!this.root.contains(el) &&
						(el.closest(PRESSABLE) !== null || hasTextAt(el, x, top + offset)),
				),
		);
	}

	private placeClear(): void {
		// A tab the user dragged, or an open panel, is not moved under their hand.
		if (this.dragMoved || this.isOpen || typeof document.elementsFromPoint !== 'function') return;
		const max = window.innerHeight - PLACEMENT_BOTTOM_GAP_PX;
		const top = firstClearTop(
			this.positionTop,
			PLACEMENT_STEP_PX,
			PLACEMENT_TOP_MIN_PX,
			max,
			(candidate) => this.isBlockedAt(candidate),
		);
		if (top === null || top === this.positionTop) return;
		this.positionTop = top;
		this.root.style.top = `${top}px`;
	}

	private schedulePlacement(): void {
		if (this.placementTimer !== null) clearTimeout(this.placementTimer);
		this.placementTimer = setTimeout(() => this.placeClear(), PLACEMENT_DEBOUNCE_MS);
	}

	private watchPlacement(): void {
		this.schedulePlacement();
		this.onResizePlacement = () => {
			// A smaller window must not leave the tab below the fold: clamp now, then look for a clear spot.
			this.positionTop = clampTop(
				this.positionTop,
				window.innerHeight,
				PLACEMENT_TOP_MIN_PX,
				PLACEMENT_BOTTOM_GAP_PX,
			);
			this.root.style.top = `${this.positionTop}px`;
			this.schedulePlacement();
		};
		window.addEventListener('resize', this.onResizePlacement);
		if (typeof MutationObserver === 'undefined') return;
		this.placementObserver = new MutationObserver(() => this.schedulePlacement());
		this.placementObserver.observe(document.body, { childList: true, subtree: true });
	}

	// --------------------------------------------------------------------------
	// Public teardown (optional — useful for tests or SPA unmount)
	// --------------------------------------------------------------------------
	destroy(): void {
		this.clearAutoClose();
		this.placementObserver?.disconnect();
		if (this.onResizePlacement) window.removeEventListener('resize', this.onResizePlacement);
		if (this.placementTimer !== null) clearTimeout(this.placementTimer);
		this.unsubscribeLang?.();
		this.unsubscribeLang = null;
		this.root.remove();
	}
}

/** Mount the widget on the page (idempotent — only mounts once). */
let _instance: AccessibilityWidget | null = null;

export function mountAccessibilityWidget(): void {
	if (_instance) return;
	_instance = new AccessibilityWidget();
}
