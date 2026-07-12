import m from 'mithril';
import { t } from '../lib/i18n';
import { LanguagePicker } from '../components/LanguagePicker';
import { AGORA_SESSION } from '@freedi/shared-types';

export function Home(): m.Component {
	let codeInput = '';

	function handleJoin(): void {
		const code = codeInput.trim().toUpperCase();
		if (code.length === AGORA_SESSION.JOIN_CODE_LENGTH) {
			m.route.set(`/join/${code}`);
		}
	}

	return {
		view() {
			const codeReady = codeInput.trim().length === AGORA_SESSION.JOIN_CODE_LENGTH;

			return m('.shell', [
				m('.home-header', [
					m(LanguagePicker),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('home.teacher')),
				]),

				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('.home-hero', [
						m('h1.home-hero__title', 'Agora'),
						m('p.home-hero__tagline', t('home.tagline')),
					]),

					m('p.home-explanation', t('home.explanation')),

					m('.card.home-card', [
						m('p.home-card__text', t('home.have_code')),
						m('input.text-input.code-input', {
							type: 'text',
							value: codeInput,
							maxlength: AGORA_SESSION.JOIN_CODE_LENGTH,
							placeholder: t('home.code_placeholder'),
							autocapitalize: 'characters',
							autocomplete: 'off',
							spellcheck: false,
							'aria-label': t('home.code_placeholder'),
							oninput: (event: InputEvent) => {
								codeInput = (event.target as HTMLInputElement).value.toUpperCase();
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
