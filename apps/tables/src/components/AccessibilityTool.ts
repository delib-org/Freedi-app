import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	A11Y_SCALES,
	A11Y_THEMES,
	DEFAULT_A11Y_PREFS,
	getA11yPrefs,
	setA11yPrefs,
	stepScale,
} from '@/lib/a11yPrefs';
import type { A11yPrefs } from '@/lib/a11yPrefs';
import { accessibilityIcon, closeIcon } from '@/components/icons';

const TITLE_ID = 'a11y-title';
const PANEL_ID = 'a11y-panel';
const SIZE_LABEL_ID = 'a11y-size-label';

function update(patch: Partial<A11yPrefs>): void {
	setA11yPrefs({ ...getA11yPrefs(), ...patch });
}

function themeGroup(prefs: Readonly<A11yPrefs>): m.Vnode {
	return m('fieldset.a11y__group', [
		m('legend.a11y__label', t('tableAssignment.a11y.theme')),
		m(
			'.a11y__segments',
			A11Y_THEMES.map((theme) =>
				m(
					'button.a11y__segment',
					{
						type: 'button',
						class: prefs.theme === theme ? 'a11y__segment--active' : '',
						'aria-pressed': prefs.theme === theme ? 'true' : 'false',
						onclick: () => update({ theme }),
					},
					t(`tableAssignment.a11y.theme.${theme}`),
				),
			),
		),
	]);
}

function contrastSwitch(prefs: Readonly<A11yPrefs>): m.Vnode {
	return m(
		'button.a11y__switch-row',
		{
			type: 'button',
			role: 'switch',
			'aria-checked': prefs.contrast ? 'true' : 'false',
			onclick: () => update({ contrast: !prefs.contrast }),
		},
		[
			m('span.a11y__label', t('tableAssignment.a11y.contrast')),
			m(
				'span.a11y__switch',
				{ class: prefs.contrast ? 'a11y__switch--on' : '', 'aria-hidden': 'true' },
				m('span.a11y__knob'),
			),
		],
	);
}

function textSizeStepper(prefs: Readonly<A11yPrefs>): m.Vnode {
	const smallest = A11Y_SCALES[0];
	const largest = A11Y_SCALES[A11Y_SCALES.length - 1];

	return m('.a11y__group', [
		m('span.a11y__label', { id: SIZE_LABEL_ID }, t('tableAssignment.a11y.textSize')),
		m('.a11y__stepper', { role: 'group', 'aria-labelledby': SIZE_LABEL_ID }, [
			m(
				'button.a11y__step',
				{
					type: 'button',
					'aria-label': t('tableAssignment.a11y.smaller'),
					disabled: prefs.scale === smallest,
					onclick: () => update({ scale: stepScale(prefs.scale, -1) }),
				},
				t('tableAssignment.a11y.smallerMark'),
			),
			m('output.a11y__value', { 'aria-live': 'polite' }, `${prefs.scale}%`),
			m(
				'button.a11y__step.a11y__step--larger',
				{
					type: 'button',
					'aria-label': t('tableAssignment.a11y.larger'),
					disabled: prefs.scale === largest,
					onclick: () => update({ scale: stepScale(prefs.scale, 1) }),
				},
				t('tableAssignment.a11y.largerMark'),
			),
		]),
	]);
}

interface PanelAttrs {
	/** Escape or the close button: focus goes back to the trigger. */
	onClose: () => void;
	/** A click outside: focus stays where the person clicked. */
	onDismiss: (target: Node) => void;
}

const Panel: m.ClosureComponent<PanelAttrs> = (initial) => {
	let latest = initial.attrs;

	function handleKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			latest.onClose();
			m.redraw();
		}
	}

	function handlePointer(event: PointerEvent): void {
		latest.onDismiss(event.target as Node);
		m.redraw();
	}

	return {
		oncreate({ dom }) {
			(dom.querySelector('button') as HTMLButtonElement | null)?.focus();
			document.addEventListener('keydown', handleKey);
			document.addEventListener('pointerdown', handlePointer);
		},
		onremove() {
			document.removeEventListener('keydown', handleKey);
			document.removeEventListener('pointerdown', handlePointer);
		},
		view({ attrs }) {
			latest = attrs;
			const prefs = getA11yPrefs();

			return m(
				'.a11y__panel',
				{
					id: PANEL_ID,
					role: 'dialog',
					'aria-labelledby': TITLE_ID,
					// A press inside the panel is not a press outside it.
					onpointerdown: (event: PointerEvent) => event.stopPropagation(),
				},
				[
					m('.a11y__header', [
						m('h2.a11y__title', { id: TITLE_ID }, t('tableAssignment.a11y.title')),
						m(
							'button.a11y__close',
							{
								type: 'button',
								'aria-label': t('tableAssignment.a11y.close'),
								onclick: attrs.onClose,
							},
							closeIcon(),
						),
					]),
					themeGroup(prefs),
					contrastSwitch(prefs),
					textSizeStepper(prefs),
					m(
						'button.a11y__reset',
						{ type: 'button', onclick: () => setA11yPrefs({ ...DEFAULT_A11Y_PREFS }) },
						t('tableAssignment.a11y.reset'),
					),
				],
			);
		},
	};
};

/** The floating display settings: theme, high contrast, text size. On every screen, host included. */
export const AccessibilityTool: m.ClosureComponent = () => {
	let isOpen = false;
	let trigger: HTMLElement | null = null;

	function close(): void {
		isOpen = false;
		trigger?.focus();
	}

	function dismiss(target: Node): void {
		if (!trigger?.contains(target)) isOpen = false;
	}

	return {
		view() {
			return m('.a11y', [
				m(
					'button.a11y__trigger',
					{
						type: 'button',
						'aria-label': t('tableAssignment.a11y.title'),
						'aria-expanded': isOpen ? 'true' : 'false',
						'aria-controls': PANEL_ID,
						oncreate: ({ dom }: m.VnodeDOM) => {
							trigger = dom as HTMLElement;
						},
						onclick: () => {
							if (isOpen) close();
							else isOpen = true;
						},
					},
					accessibilityIcon(),
				),
				isOpen ? m(Panel, { onClose: close, onDismiss: dismiss }) : null,
			]);
		},
	};
};
