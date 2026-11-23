// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));
const showHere = vi.hoisted(() => vi.fn());
vi.mock('../ProjectorMenu', () => ({ showHere, ProjectorItems: {} }));

import { t } from '@/lib/i18n';
import { QRShare } from '@/components/QRShare';
import { mountSmoke } from '@/views/__tests__/mountSmoke';
import { ChallengeDialog, openChallengeDialog } from '../ChallengeDialog';
import { header } from '../ConsoleBar';
import { JoiningCard } from '../JoiningCard';
import { QuestionLine } from '../QuestionLine';
import { StepLine } from '../StepLine';

/**
 * Step 1 of the lesson (Trello Rkrtmmx8): the join card leads, the question is chosen in a
 * dialog, and the clock and pause wait for the first real step.
 */

const STEPS = ['waiting', 'opening', 'side'] as const;

function joining(): m.Children {
	return m(JoiningCard, {
		mid: 'm1',
		code: '912094',
		url: 'https://join.example/m/m1',
		title: 'Lesson',
		address: 'join.example',
	});
}

describe('JoiningCard', () => {
	beforeEach(() => showHere.mockClear());

	it('says what to do with the address, shows the big code and the projector button', () => {
		const mounted = mountSmoke(joining);
		const { root } = mounted;
		expect(root.querySelector('.joining-card__title')?.textContent).toBe(t('console.join.title'));
		expect(root.querySelector('.qr-share__label')?.textContent).toBe(
			t('console.join.how', { address: 'join.example' }),
		);
		expect(root.querySelector('[data-testid="joining-code"]')?.textContent).toBe('912094');
		const button = root.querySelector<HTMLButtonElement>('[data-testid="joining-projector"]');
		expect(button?.textContent).toBe(t('console.join.projector'));
		button?.click();
		expect(showHere).toHaveBeenCalledWith('m1', expect.any(Function));
		mounted.unmount();
	});

	it('draws without a code (the lesson has none yet)', () => {
		const mounted = mountSmoke(() =>
			m(JoiningCard, { mid: 'm1', code: undefined, url: 'u', title: 'T', address: 'a' }),
		);
		expect(mounted.root.querySelector('[data-testid="joining-code"]')).toBeNull();
		mounted.unmount();
	});
});

describe('QRShare label', () => {
	it('keeps the student wording for other callers', () => {
		const mounted = mountSmoke(() => m(QRShare, { url: 'https://x/m/1' }));
		expect(mounted.root.querySelector('.qr-share__label')?.textContent).toBe(t('qrShare.label'));
		mounted.unmount();
	});

	it('takes a label from the caller', () => {
		const mounted = mountSmoke(() => m(QRShare, { url: 'https://x/m/1', label: 'Custom words' }));
		expect(mounted.root.querySelector('.qr-share__label')?.textContent).toBe('Custom words');
		mounted.unmount();
	});
});

describe('QuestionLine', () => {
	it('shows the question and a "Change" link to the plan', () => {
		const mounted = mountSmoke(() => m(QuestionLine, { mid: 'm1', question: 'How do we fix it?' }));
		const line = mounted.root.querySelector('[data-testid="question-line"]');
		expect(line?.textContent).toContain(t('console.question_line'));
		expect(line?.textContent).toContain('How do we fix it?');
		const change = mounted.root.querySelector('[data-testid="question-change"]');
		expect(change?.textContent).toBe(t('console.question_change'));
		expect(change?.getAttribute('href')).toContain('/t/m1/plan?focus=challenge');
		mounted.unmount();
	});
});

describe('StepLine clock', () => {
	const line = (showClock: boolean | undefined) => (): m.Children =>
		m(StepLine, {
			keys: STEPS,
			currentIndex: 0,
			elapsedMs: 60_000,
			showClock,
			onBack: vi.fn(),
		});

	it('is hidden at step 1 and back at the next step', () => {
		const hidden = mountSmoke(line(false));
		expect(hidden.root.querySelector('.step-line__clock')).toBeNull();
		hidden.unmount();
		const shown = mountSmoke(line(true));
		expect(shown.root.querySelector('.step-line__clock')).not.toBeNull();
		shown.unmount();
		const normal = mountSmoke(line(undefined));
		expect(normal.root.querySelector('.step-line__clock')).not.toBeNull();
		normal.unmount();
	});
});

describe('the top bar pause', () => {
	const bar = (stepKey: 'waiting' | 'opening') => (): m.Children =>
		header('m1', 'Lesson', '912094', 'live', {
			stepKey,
			connected: false,
			qr: { shown: false, toggle: vi.fn() },
		});

	it('is not drawn at step 1 (waiting) and is drawn from the next step', () => {
		const waiting = mountSmoke(bar('waiting'));
		expect(waiting.root.querySelector('[data-testid="console-pause"]')).toBeNull();
		waiting.unmount();
		const next = mountSmoke(bar('opening'));
		expect(next.root.querySelector('[data-testid="console-pause"]')).not.toBeNull();
		next.unmount();
	});
});

describe('ChallengeDialog', () => {
	const candidates = [{ statementId: 'q1', statement: 'First question' }] as unknown as Statement[];

	beforeAll(() => {
		const dialog = HTMLDialogElement.prototype as {
			showModal?: () => void;
			close?: () => void;
		};
		dialog.showModal = function (this: HTMLDialogElement) {
			this.setAttribute('open', '');
		};
		dialog.close = function (this: HTMLDialogElement) {
			this.removeAttribute('open');
		};
	});

	afterEach(() => m.redraw.sync());

	it('is empty until the big button opens it, then holds the three choices', () => {
		let has = false;
		const mounted = mountSmoke(() =>
			m(ChallengeDialog, { mainId: 'm1', candidates, hasChallenge: has }),
		);
		const dialog = mounted.root.querySelector('dialog');
		expect(dialog?.getAttribute('aria-labelledby')).toBe('question-dialog-title');
		expect(mounted.root.querySelector('#question-dialog-title')).toBeNull();

		openChallengeDialog();
		mounted.redraw();
		expect(mounted.root.querySelector('#question-dialog-title')?.textContent).toBe(
			t('console.challenge.pick_label'),
		);
		expect(mounted.root.querySelector('[data-testid="challenge-use"]')).not.toBeNull();
		expect(mounted.root.querySelector('[data-testid="challenge-add"]')).not.toBeNull();
		expect(mounted.root.querySelector('.challenge-warning__plan-link')).not.toBeNull();
		expect(dialog?.hasAttribute('open')).toBe(true);

		// the question is set: the dialog closes by itself
		has = true;
		mounted.redraw();
		expect(mounted.root.querySelector('#question-dialog-title')).toBeNull();
		expect(dialog?.hasAttribute('open')).toBe(false);
		mounted.unmount();
	});

	it('closes with its Close button', () => {
		const mounted = mountSmoke(() =>
			m(ChallengeDialog, { mainId: 'm1', candidates, hasChallenge: false }),
		);
		openChallengeDialog();
		mounted.redraw();
		mounted.root.querySelector<HTMLButtonElement>('[data-testid="question-dialog-close"]')?.click();
		mounted.redraw();
		expect(mounted.root.querySelector('#question-dialog-title')).toBeNull();
		mounted.unmount();
	});
});
