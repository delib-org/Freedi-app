import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	enterFullscreen,
	exitFullscreen,
	fullscreenSupported,
	isFullscreen,
	onFullscreenChange,
} from '@/lib/fullscreen';
import {
	PROJECTOR_CONTROLS_IDLE_MS,
	PROJECTOR_HINT_MS,
	movedFarEnough,
	type ProjectorMode,
} from '@/lib/classroom/projectorScreen';

/**
 * The teacher's own control on the projector (IA 15.4, UX 15.B). It drives
 * nothing in the lesson: full screen, and a way back (here) or a way to close
 * (own window). Hidden until the person at this device uses the mouse, taps or
 * presses Tab; hidden again after PROJECTOR_CONTROLS_IDLE_MS. It stays in the
 * DOM (transparent, not display:none) so a screen reader can always reach it.
 */

/** window.close() is checked this long after the call to see whether the browser refused it. */
const CLOSE_CHECK_MS = 100;

interface Point {
	x: number;
	y: number;
}

interface ControlsAttrs {
	mid: string;
	mode: ProjectorMode;
}

interface NavState {
	fromConsole?: boolean;
}

let mode: ProjectorMode = 'here';
let lessonId = '';
let visible = false;
let hintShown = false;
let fullscreen = false;
let closeRefused = false;
let leaving = false;
let hovering = false;
let lastWake: Point | null = null;
let idleTimer: number | undefined;
let hintTimer: number | undefined;
let controlsEl: HTMLElement | null = null;

/** Called by the projector view when it opens, before the first draw. */
export function resetControls(nextMode: ProjectorMode, mid: string): void {
	mode = nextMode;
	lessonId = mid;
	// the teacher has just clicked: show once, so the way back is seen
	visible = true;
	fullscreen = isFullscreen();
	hintShown = nextMode === 'window' && fullscreenSupported() && !fullscreen;
	closeRefused = false;
	leaving = false;
	hovering = false;
	lastWake = null;
}

export function controlsVisible(): boolean {
	return visible;
}

function setVisible(next: boolean): void {
	if (visible === next) return;
	visible = next;
	m.redraw();
}

function root(): HTMLElement | null {
	return controlsEl?.closest<HTMLElement>('.projector') ?? null;
}

function scheduleIdle(): void {
	window.clearTimeout(idleTimer);
	if (hovering || hintShown) return;
	idleTimer = window.setTimeout(sleep, PROJECTOR_CONTROLS_IDLE_MS);
}

function wake(): void {
	setVisible(true);
	scheduleIdle();
}

function sleep(): void {
	if (hovering || hintShown) return;
	// focus never sits on something invisible
	if (controlsEl?.contains(document.activeElement)) root()?.focus({ preventScroll: true });
	setVisible(false);
}

function endHint(): void {
	if (!hintShown) return;
	window.clearTimeout(hintTimer);
	hintShown = false;
	scheduleIdle();
	m.redraw();
}

function backToConsole(): void {
	const state = history.state as NavState | null;
	if (state?.fromConsole) history.back();
	else m.route.set(`/t/${lessonId}`, {}, { replace: true });
}

/** Leaves the projector for the console, once, from whichever of Esc / button / fullscreen change comes first. */
async function leave(): Promise<void> {
	if (leaving) return;
	leaving = true;
	try {
		await exitFullscreen();
		backToConsole();
	} catch (err) {
		leaving = false;
		console.error('[ProjectorControls] leaving the projector failed:', err);
	}
}

function closeWindow(): void {
	window.close();
	window.setTimeout(() => {
		if (!window.closed) {
			closeRefused = true;
			m.redraw();
		}
	}, CLOSE_CHECK_MS);
}

function toggleFullscreen(): void {
	void (fullscreen ? exitFullscreen() : enterFullscreen());
}

function focusEdge(last: boolean): void {
	const buttons = controlsEl?.querySelectorAll<HTMLElement>('button');
	if (!buttons || buttons.length === 0) return;
	buttons[last ? buttons.length - 1 : 0].focus({ preventScroll: true });
}

function onPointerMove(event: PointerEvent): void {
	const here = { x: event.clientX, y: event.clientY };
	if (!lastWake) {
		// the first event is only a baseline: a re-render under a still pointer sends one
		lastWake = here;

		return;
	}
	if (!movedFarEnough(lastWake, here)) return;
	lastWake = here;
	wake();
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key === 'Tab') {
		if (visible) return;
		event.preventDefault();
		wake();
		focusEdge(event.shiftKey);

		return;
	}
	if (event.key !== 'Escape') return;
	if (mode === 'here') {
		void leave();

		return;
	}
	// own window: Esc only hides the control; the browser leaves full screen by itself
	if (controlsEl?.contains(document.activeElement)) root()?.focus({ preventScroll: true });
	window.clearTimeout(idleTimer);
	setVisible(false);
}

function onFocusIn(event: FocusEvent): void {
	if (controlsEl?.contains(event.target as Node)) wake();
}

function onFullscreenState(): void {
	const was = fullscreen;
	fullscreen = isFullscreen();
	if (fullscreen) endHint();
	// leaving full screen (Esc) goes back, like leaving a slideshow
	if (was && !fullscreen && mode === 'here') void leave();
	m.redraw();
}

function button(key: string, label: string, onclick: () => void, on: boolean, extra?: m.Children) {
	return m(
		'button.projector-controls__btn',
		{
			type: 'button',
			'data-pc': key,
			class: on ? 'projector-controls__btn--on' : undefined,
			onclick,
		},
		[extra ?? null, label],
	);
}

function buttons(): m.Children {
	const supported = fullscreenSupported();
	const back = button(
		'back',
		t('projector.back'),
		() => void leave(),
		mode === 'here',
		m('span.projector-controls__chevron', { 'aria-hidden': 'true' }, '‹'),
	);
	if (mode === 'here') {
		return [back, supported && !fullscreen ? fullscreenButton(false) : null];
	}

	return [
		supported ? fullscreenButton(!fullscreen) : null,
		closeRefused ? back : button('close', t('projector.close'), closeWindow, false),
	];
}

function fullscreenButton(on: boolean): m.Vnode {
	return button(
		'fullscreen',
		t(fullscreen ? 'projector.fullscreen_exit' : 'projector.fullscreen'),
		toggleFullscreen,
		on,
	);
}

export const ProjectorControls: m.Component<ControlsAttrs> = {
	oncreate(vnode) {
		controlsEl = vnode.dom as HTMLElement;
		const offFullscreen = onFullscreenChange(onFullscreenState);
		const enter = (): void => {
			hovering = true;
			window.clearTimeout(idleTimer);
		};
		const leaveHover = (): void => {
			hovering = false;
			scheduleIdle();
		};
		controlsEl.addEventListener('pointerenter', enter);
		controlsEl.addEventListener('pointerleave', leaveHover);
		document.addEventListener('pointermove', onPointerMove, { passive: true });
		document.addEventListener('pointerdown', wake, { passive: true });
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('focusin', onFocusIn);
		if (hintShown) hintTimer = window.setTimeout(endHint, PROJECTOR_HINT_MS);
		scheduleIdle();
		// first draw has happened: put focus where the teacher's next key should land
		window.requestAnimationFrame(() => {
			const target = controlsEl?.querySelector<HTMLElement>(
				mode === 'here' ? '[data-pc="back"]' : 'button',
			);
			target?.focus({ preventScroll: true });
		});
		(vnode.state as { dispose?: () => void }).dispose = () => {
			offFullscreen();
			controlsEl?.removeEventListener('pointerenter', enter);
			controlsEl?.removeEventListener('pointerleave', leaveHover);
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerdown', wake);
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('focusin', onFocusIn);
		};
	},

	onremove(vnode) {
		(vnode.state as { dispose?: () => void }).dispose?.();
		window.clearTimeout(idleTimer);
		window.clearTimeout(hintTimer);
		controlsEl = null;
		// the one-screen teacher going back (browser back too) leaves full screen
		if (mode === 'here' && isFullscreen()) void exitFullscreen();
	},

	view() {
		return m(
			'.projector-controls',
			{ role: 'group', 'aria-label': t('projector.controls'), 'data-testid': 'projector-controls' },
			buttons(),
		);
	},
};

/** The first-open hint of the own window (UX 15.D). */
export const ProjectorHint: m.Component = {
	view() {
		if (!hintShown) return null;

		return m('p.projector-hint', { role: 'status', 'data-testid': 'projector-hint' }, [
			m(
				'svg.projector-hint__glyph',
				{ viewBox: '0 0 64 32', 'aria-hidden': 'true', focusable: 'false' },
				[
					m('rect', { x: 2, y: 14, width: 16, height: 11, rx: 1.5 }),
					m('path', { d: 'M0 28h20M22 20h14M31 15l5 5-5 5' }),
					m('rect', { x: 40, y: 6, width: 22, height: 16, rx: 1.5 }),
					m('path', { d: 'M46 28h10M51 22v6' }),
				],
			),
			m('span', t('projector.window_hint')),
		]);
	},
};
