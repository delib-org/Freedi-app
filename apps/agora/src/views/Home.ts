import { isVillageMode } from '../lib/flows/sessionLinks';
import m from 'mithril';
import { t } from '../lib/i18n';
import { LanguagePicker } from '../components/LanguagePicker';
import { AGORA_SESSION } from '@freedi/shared-types';

/** Codes are digits only — drop anything else the keyboard or a paste sends. */
function digitsOnly(value: string): string {
	return value.replace(/\D/g, '').slice(0, AGORA_SESSION.JOIN_CODE_LENGTH);
}

export function Home(): m.Component {
	const village = isVillageMode(window.location.search);
	let codeInput = '';

	function handleJoin(): void {
		const code = digitsOnly(codeInput);
		if (code.length === AGORA_SESSION.JOIN_CODE_LENGTH) {
			m.route.set(`/join/${code}`);
		}
	}

	return {
		view() {
			const codeReady = codeInput.length === AGORA_SESSION.JOIN_CODE_LENGTH;

			return m('.shell', [
				m('.home-header', [
					m(LanguagePicker),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('home.teacher')),
				]),

				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('.home-hero', [
						m('img.home-hero__image', {
							src: '/time-machine.webp',
							alt: t('home.hero_alt'),
						}),
						m('h1.home-hero__title', village ? 'כפר החכמים' : 'Agora'),
						m(
							'p.home-hero__tagline',
							village ? 'חושבים יחד. מקשיבים. מחליטים.' : t('home.tagline'),
						),
					]),

					m(
						'p.home-explanation',
						village
							? 'המנחה בוחר את האתגר ואת התחנות. התלמידים מצטרפים בקוד, משתפים רעיונות ומגיעים יחד למועצת הכפר.'
							: t('home.explanation'),
					),
					village
						? m('.card.home-card', [
								m('h2', 'אני המנחה'),
								m(
									'p',
									'יוצרים מפגש, עורכים את המסלול ומזמינים תלמידים. הכניסה למנחה היא באמצעות Google.',
								),
								m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{ onclick: () => m.route.set('/teach') },
									'כניסה למנחה',
								),
							])
						: null,

					m('.card.home-card', [
						m('p.home-card__text', village ? 'אני תלמיד/ה — יש לי קוד מפגש' : t('home.have_code')),
						m('input.text-input.code-input', {
							// type=text, not number: a number input strips leading zeros,
							// and 04213 is a valid code. inputmode raises the numeric keypad.
							type: 'text',
							inputmode: 'numeric',
							pattern: '[0-9]*',
							value: codeInput,
							maxlength: AGORA_SESSION.JOIN_CODE_LENGTH,
							placeholder: t('home.code_placeholder'),
							autocomplete: 'one-time-code',
							spellcheck: false,
							'aria-label': t('home.code_placeholder'),
							oninput: (event: InputEvent) => {
								const field = event.target as HTMLInputElement;
								codeInput = digitsOnly(field.value);
								// Write back synchronously. Waiting for the redraw lets a
								// rejected character sit in the field long enough to burn a
								// maxlength slot, which silently eats the next real digit.
								field.value = codeInput;
							},
							onkeydown: (event: KeyboardEvent) => {
								if (event.key === 'Enter') handleJoin();
							},
						}),
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{ disabled: !codeReady, onclick: handleJoin },
							t('home.join'),
						),
					]),
				]),
			]);
		},
	};
}
