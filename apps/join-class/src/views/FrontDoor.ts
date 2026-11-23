import m from 'mithril';
import { t } from '@/lib/i18n';
import { CLASS_CODE_LENGTH, toCodeDigits } from '@/lib/lessonCore';
import { BrandLogo } from '@/components/BrandLogo';
import '@/styles/front-door.scss';

/**
 * `/` - the front door (IA 13.2, UX 13.B). Teacher first: one sentence that
 * says what Class is for, one big "Start a lesson" (to `/t`, which asks for
 * sign-in), and three steps of how a lesson goes. The students' door, the six
 * digits of the class code, sits right under the big button as the smaller
 * second action; most students never see this page (the QR opens `/c/:code`).
 *
 * One input, not six boxes (paste, autofill and screen readers all work).
 * No `maxlength`: a pasted "482 913" or a whole join link must not be cut off;
 * every input event keeps the digits and slices to six. Six digits submit by
 * themselves. A code the resolver sent back (`?code=` + `?error=`) is shown
 * filled in and selected, and is never re-sent until the student changes it.
 * The box takes focus only then: on a plain arrival it would open the phone
 * keyboard over the sentence the page is there to say.
 */

export type DoorError = 'unknown' | 'offline';

const PLACEHOLDER = '·'.repeat(CLASS_CODE_LENGTH);
const STEPS = [1, 2, 3] as const;
/** Matches `--space-3xl`, the logo's height in front-door.scss. */
const LOGO_SIZE = 72;

let value = '';
let error: DoorError | null = null;
let armed = true;
let invalidNoMessage = false;

function paramOf(name: string): string | undefined {
	const raw = m.route.param(name);

	return typeof raw === 'string' ? raw : undefined;
}

function goToCode(code: string): void {
	m.route.set(`/c/${code}`);
}

function onInput(event: Event): void {
	const input = event.target as HTMLInputElement;
	const next = toCodeDigits(input.value);
	input.value = next;
	if (next !== value) armed = true;
	value = next;
	error = null;
	invalidNoMessage = false;
	if (armed && value.length === CLASS_CODE_LENGTH) goToCode(value);
}

function onSubmit(event: Event): void {
	event.preventDefault();
	if (value.length === CLASS_CODE_LENGTH) {
		goToCode(value);

		return;
	}
	// Fewer than six digits: stay here, mark the field, say nothing (the six dots already count).
	invalidNoMessage = true;
	(document.getElementById('door-code') as HTMLInputElement | null)?.focus();
}

function errorBlock(): m.Children {
	if (!error) return null;

	return m('.door__error#door-error', { role: 'alert' }, [
		m(
			'p.door__error-title',
			t(error === 'offline' ? 'lesson.code.offline' : 'lesson.code.unknown.title'),
		),
		error === 'unknown' ? m('p.door__error-body', t('lesson.code.unknown.body')) : null,
	]);
}

function howItWorks(): m.Children {
	return m('section.front-door__how', { 'aria-labelledby': 'front-how-title' }, [
		m('h2.front-door__how-title#front-how-title', t('front.how.title')),
		m(
			'ol.front-door__steps',
			STEPS.map((n) =>
				m('li.front-door__step', { key: n }, [
					m('span.front-door__step-title', t(`front.how.${n}.title`)),
					m('span.front-door__step-text', t(`front.how.${n}.text`)),
				]),
			),
		),
	]);
}

function codeForm(): m.Children {
	const invalid = error !== null || invalidNoMessage;

	return m('form.front-door__join', { novalidate: true, onsubmit: onSubmit }, [
		m('label.front-door__join-label', { for: 'door-code' }, t('front.join.label')),
		m('.front-door__join-row', [
			m('input.door__code.front-door__code#door-code', {
				type: 'text',
				inputmode: 'numeric',
				pattern: '[0-9]*',
				autocomplete: 'one-time-code',
				autocapitalize: 'off',
				spellcheck: false,
				dir: 'ltr',
				placeholder: PLACEHOLDER,
				value,
				'aria-describedby': error ? 'door-error' : undefined,
				'aria-invalid': invalid ? 'true' : undefined,
				oninput: onInput,
				oncreate: (vnode: m.VnodeDOM) => {
					if (!value) return;
					const input = vnode.dom as HTMLInputElement;
					input.focus();
					input.select();
				},
			}),
			m(
				'button.btn.btn--secondary.door__enter.front-door__enter',
				{ type: 'submit' },
				t('door.code.enter'),
			),
		]),
		errorBlock(),
	]);
}

export const FrontDoor: m.Component = {
	oninit() {
		const code = toCodeDigits(paramOf('code') ?? '');
		value = code;
		const flagged = paramOf('error');
		error = flagged === 'offline' ? 'offline' : flagged === 'unknown' ? 'unknown' : null;
		armed = code === '';
		invalidNoMessage = false;
	},

	view() {
		return m('main.door.front-door', [
			m(
				'header.door__header',
				m(BrandLogo, { size: LOGO_SIZE, className: 'door__logo.front-door__logo' }),
			),
			m('.front-door__hero', [
				m('h1.front-door__title', t('front.title')),
				m('p.front-door__lead', t('front.lead')),
			]),
			m(
				m.route.Link,
				{ class: 'btn btn--primary front-door__start', href: '/t' },
				t('front.start'),
			),
			codeForm(),
			howItWorks(),
		]);
	},
};
