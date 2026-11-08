import m from 'mithril';
import { t } from '@/lib/i18n';
import { CLASS_CODE_LENGTH, toCodeDigits } from '@/lib/lessonCore';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * `/` - the front door (IA 13.2, UX 13.B). One job: type the six digits of the
 * class code. The second door, "I'm a teacher", sits under it in plain view.
 *
 * One input, not six boxes (paste, autofill and screen readers all work).
 * No `maxlength`: a pasted "482 913" or a whole join link must not be cut off;
 * every input event keeps the digits and slices to six. Six digits submit by
 * themselves. A code the resolver sent back (`?code=` + `?error=`) is shown
 * filled in and selected, and is never re-sent until the student changes it.
 */

export type DoorError = 'unknown' | 'offline';

const PLACEHOLDER = '·'.repeat(CLASS_CODE_LENGTH);

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
		const invalid = error !== null || invalidNoMessage;

		return m('main.door', [
			m('header.door__header', m(BrandLogo, { size: 48, className: 'door__logo' })),
			m('form.door__form', { novalidate: true, onsubmit: onSubmit }, [
				m('h1.door__title#door-title', t('door.code.title')),
				m('input.door__code#door-code', {
					type: 'text',
					inputmode: 'numeric',
					pattern: '[0-9]*',
					autocomplete: 'one-time-code',
					autocapitalize: 'off',
					spellcheck: false,
					dir: 'ltr',
					placeholder: PLACEHOLDER,
					value,
					'aria-labelledby': 'door-title',
					'aria-describedby': error ? 'door-error' : undefined,
					'aria-invalid': invalid ? 'true' : undefined,
					oninput: onInput,
					oncreate: (vnode: m.VnodeDOM) => {
						const input = vnode.dom as HTMLInputElement;
						input.focus();
						if (value) input.select();
					},
				}),
				errorBlock(),
				m('button.btn.btn--primary.door__enter', { type: 'submit' }, t('door.code.enter')),
			]),
			m(
				'.door__alt',
				m(m.route.Link, { class: 'btn btn--tertiary', href: '/t' }, t('door.teacher')),
			),
		]);
	},
};
