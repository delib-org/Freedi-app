import m from 'mithril';
import { AGORA_BANNED_WORDS } from '@freedi/shared-types';
import { t } from '../../lib/i18n';
import { ensureUser, getUserState } from '../../lib/user';
import { entriesToAdd, fetchBannedWords, saveBannedWords } from '../../lib/bannedWords';
import { TeacherNav } from '../../components/TeacherNav';

/**
 * /teach/words — the teacher's list of words their students may not use.
 *
 * One list per teacher, shared by every class they run. Each change (an add,
 * a removal) is saved at once and replaces the list as a whole; the server
 * answers with the cleaned list, which is what the screen then shows. The
 * students never read this list: their gate names only the word they wrote.
 */
export function TeacherBannedWords(): m.Component {
	let words: string[] = [];
	let loaded = false;
	let loadFailed = false;
	let saving = false;
	let saveFailed = false;
	let draft = '';

	async function load(): Promise<void> {
		loadFailed = false;
		try {
			const user = await ensureUser();
			if (user.isAnonymous) {
				// Auth's first beat: the Google account lands a moment later and redraws
				return;
			}
			words = await fetchBannedWords(user.uid);
			loaded = true;
		} catch (error) {
			console.error('[Teacher] Loading the banned words failed:', error);
			loadFailed = true;
		}
		m.redraw();
	}

	async function replaceList(next: string[]): Promise<boolean> {
		if (saving) return false;
		saving = true;
		saveFailed = false;
		m.redraw();
		try {
			words = await saveBannedWords(next);
			saving = false;
			m.redraw();

			return true;
		} catch (error) {
			console.error('[Teacher] Saving the banned words failed:', error);
			saveFailed = true;
			saving = false;
			m.redraw();

			return false;
		}
	}

	async function addDraft(): Promise<void> {
		const added = entriesToAdd(draft, words);
		if (added.length === 0) {
			draft = '';

			return;
		}
		if (await replaceList([...words, ...added])) draft = '';
	}

	function chip(word: string): m.Children {
		return m('li.banned-words__item', { key: word }, [
			m('span.banned-words__word', { dir: 'auto' }, word),
			m(
				'button.banned-words__remove',
				{
					type: 'button',
					disabled: saving,
					'aria-label': t('bannedWords.remove', { word }),
					title: t('bannedWords.remove', { word }),
					onclick: () => void replaceList(words.filter((entry) => entry !== word)),
				},
				m('span', { 'aria-hidden': 'true' }, '×'),
			),
		]);
	}

	function editor(): m.Children {
		const full = words.length >= AGORA_BANNED_WORDS.MAX_WORDS;

		return [
			m(
				'form.banned-words__form',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						void addDraft();
					},
				},
				[
					m('label.banned-words__field', [
						m('span.teacher__section-title', t('bannedWords.input_label')),
						m('input.plan-editor__text[type=text]', {
							value: draft,
							dir: 'auto',
							maxlength: AGORA_BANNED_WORDS.MAX_WORD_LENGTH * 4,
							placeholder: t('bannedWords.placeholder'),
							disabled: saving || full,
							oninput: (event: InputEvent) => {
								draft = (event.target as HTMLInputElement).value;
							},
						}),
					]),
					m(
						'button.btn.btn--primary',
						{ type: 'submit', disabled: saving || full || draft.trim().length === 0 },
						t('bannedWords.add'),
					),
				],
			),
			m('p.banned-words__hint', t('bannedWords.hint')),
			saveFailed ? m('p.join__error', { role: 'alert' }, t('bannedWords.save_failed')) : null,
			words.length === 0
				? m('p.banned-words__empty', t('bannedWords.empty'))
				: [
						m(
							'p.banned-words__count',
							t('bannedWords.count', { n: words.length, max: AGORA_BANNED_WORDS.MAX_WORDS }),
						),
						m(
							'ul.banned-words__list',
							{ 'aria-label': t('bannedWords.list_label') },
							words.map(chip),
						),
					],
		];
	}

	function body(): m.Children {
		if (loadFailed) {
			return m('.teach-empty', [
				m('p.join__error', t('bannedWords.load_failed')),
				m(
					'button.btn.btn--secondary',
					{ type: 'button', onclick: () => void load() },
					t('bannedWords.retry'),
				),
			]);
		}
		if (!loaded) return m('.spinner');

		return editor();
	}

	void load();

	return {
		view() {
			const { tier } = getUserState();
			if (tier !== 2 && !loaded) {
				// Not a signed-in teacher: the home screen owns the sign-in
				return m('.shell', [
					m(TeacherNav, { title: t('bannedWords.title'), onBack: () => m.route.set('/teach') }),
					m('.shell__content.teach-page', m('p.home-explanation', t('teacher.sign_in_required'))),
				]);
			}

			return m('.shell', [
				m(TeacherNav, { title: t('bannedWords.title'), onBack: () => m.route.set('/teach') }),
				m('.shell__content.teach-page', [
					m('section.teach-section.banned-words', [
						m('p.banned-words__intro', t('bannedWords.intro')),
						body(),
					]),
				]),
			]);
		},
	};
}
