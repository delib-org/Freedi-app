import m from 'mithril';
import { t } from '../lib/i18n';
import { askMaterials, fetchMyMaterialChat, fetchSceneMaterials } from '../lib/materials';
import { askOutcome, messagesForScene, questionsLeft, usedFrom } from '../lib/flows/materialsFlow';
import { getLang } from '../lib/i18n';
import { AGORA_MATERIALS } from '@freedi/shared-types';
import type { AgoraMaterialItem, AgoraMaterialMessage } from '@freedi/shared-types';

export interface MaterialsSheetAttrs {
	topicPackageId: string;
	sessionId: string;
	userId: string;
	sceneId: string;
}

/** Whether a scene has materials, remembered so a re-render never flashes the button */
const known = new Map<string, { items: AgoraMaterialItem[] | null; at: number }>();
/** A scene with no materials is looked at again after this long (a teacher may add some) */
const RECHECK_MS = 60 * 1000;
const loading = new Set<string>();

function peek(attrs: MaterialsSheetAttrs): AgoraMaterialItem[] | null | undefined {
	const key = `${attrs.topicPackageId}--${attrs.sceneId}`;
	const cached = known.get(key);
	if (cached && (cached.items || Date.now() - cached.at < RECHECK_MS)) return cached.items;
	if (!loading.has(key)) {
		loading.add(key);
		fetchSceneMaterials(attrs.topicPackageId, attrs.sceneId)
			.then((found) =>
				known.set(key, {
					items: found && found.items.length > 0 ? found.items : null,
					at: Date.now(),
				}),
			)
			.catch((error: unknown) => {
				console.error('[Materials] Student load failed:', error);
				known.set(key, { items: null, at: Date.now() });
			})
			.finally(() => {
				loading.delete(key);
				m.redraw();
			});
	}

	return cached?.items;
}

/**
 * The library's background materials: a button on the scene that opens a
 * sheet to READ them (text, the PDF, the link) and to ASK an AI helper that
 * answers only from them. The conversation is the student's alone — the
 * server stores it where only they can read it, so it survives a reload.
 */
export function MaterialsSheet(): m.Component<MaterialsSheetAttrs> {
	let open = false;
	let messages: AgoraMaterialMessage[] = [];
	let used = 0;
	let chatLoadedFor = '';
	let draft = '';
	let asking = false;
	let notice = '';
	let noticeIsError = false;
	let opener: HTMLElement | null = null;
	const expanded = new Set<string>();

	function loadChat(attrs: MaterialsSheetAttrs): void {
		const key = `${attrs.sessionId}--${attrs.userId}`;
		if (chatLoadedFor === key) return;
		chatLoadedFor = key;
		fetchMyMaterialChat(attrs.sessionId, attrs.userId)
			.then((chat) => {
				messages = chat?.messages ?? [];
				used = usedFrom(chat);
			})
			.catch((error: unknown) => {
				console.error('[Materials] Chat load failed:', error);
				chatLoadedFor = '';
			})
			.finally(() => m.redraw());
	}

	function close(): void {
		open = false;
		opener?.focus();
	}

	async function send(attrs: MaterialsSheetAttrs): Promise<void> {
		const question = draft.trim();
		if (!question || asking || questionsLeft(used) === 0) return;
		asking = true;
		notice = '';
		m.redraw();
		try {
			const response = await askMaterials({
				sessionId: attrs.sessionId,
				sceneId: attrs.sceneId,
				question,
				language: getLang(),
			});
			const outcome = askOutcome(response);
			used = outcome.used;
			if (response.ok) {
				const now = Date.now();
				messages = [
					...messages,
					{ id: `q-${now}`, sceneId: attrs.sceneId, role: 'student', text: question, at: now },
					{
						id: `a-${now}`,
						sceneId: attrs.sceneId,
						role: 'ai',
						text: response.answer,
						at: now,
						...(response.notInMaterials ? { notInMaterials: true } : {}),
					},
				];
				draft = '';
			} else if (outcome.kind === 'language') {
				notice =
					outcome.deducted > 0
						? t('language.flagged', { n: String(outcome.deducted) })
						: t('language.flagged_no_coins');
				noticeIsError = true;
			} else if (outcome.kind === 'banned_word') {
				notice = t('language.banned_word', { word: outcome.word });
				noticeIsError = true;
			} else if (outcome.kind === 'limit') {
				notice = t('mat.none_left');
				noticeIsError = true;
			} else if (outcome.kind === 'error') {
				notice = t(outcome.key);
				noticeIsError = true;
			}
		} catch (error) {
			console.error('[Materials] Ask failed:', error);
			notice = t('mat.err_ask');
			noticeIsError = true;
		}
		asking = false;
		m.redraw();
	}

	function itemView(item: AgoraMaterialItem): m.Vnode {
		const isOpen = expanded.has(item.materialId);

		return m('li.materials__item', { key: item.materialId }, [
			m('.materials__item-head', [
				m('span.materials__kind', t(`mat.kind_${item.kind}`)),
				m('h4.materials__item-title', { dir: 'auto' }, item.title),
			]),
			m('.materials__item-actions', [
				m(
					'button.btn.btn--secondary.btn--sm',
					{
						type: 'button',
						'aria-expanded': isOpen ? 'true' : 'false',
						onclick: () => {
							if (isOpen) expanded.delete(item.materialId);
							else expanded.add(item.materialId);
						},
					},
					isOpen ? t('mat.preview_hide') : t('mat.read_title'),
				),
				item.kind === 'pdf' && item.fileUrl
					? m(
							'a.btn.btn--ghost.btn--sm',
							{ href: item.fileUrl, target: '_blank', rel: 'noopener noreferrer' },
							t('mat.open_pdf'),
						)
					: null,
				item.kind === 'link' && item.sourceUrl
					? m(
							'a.btn.btn--ghost.btn--sm',
							{ href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' },
							t('mat.open_link'),
						)
					: null,
			]),
			isOpen ? m('p.materials__text', { dir: 'auto' }, item.text) : null,
		]);
	}

	function chatView(attrs: MaterialsSheetAttrs): m.Children {
		const left = questionsLeft(used);
		const thread = messagesForScene(messages, attrs.sceneId);

		return m('section.materials__chat', { 'aria-label': t('mat.ask_title') }, [
			m('h3.materials__heading', t('mat.ask_title')),
			m('p.materials__hint', t('mat.ask_hint')),
			m('ol.materials__thread', { 'aria-live': 'polite' }, [
				...(thread.length === 0
					? [m('li.materials__empty', { key: 'empty' }, t('mat.empty_chat'))]
					: thread.map((message) =>
							m(
								'li.materials__msg',
								{
									key: message.id,
									class: `materials__msg--${message.role}${message.notInMaterials ? ' materials__msg--unknown' : ''}`,
								},
								[
									m(
										'span.materials__who',
										message.role === 'student' ? t('mat.you') : t('mat.helper'),
									),
									m('p.materials__msg-text', { dir: 'auto' }, message.text),
									message.notInMaterials ? m('span.materials__flag', t('mat.not_in')) : null,
								],
							),
						)),
				...(asking
					? [
							m(
								'li.materials__msg.materials__msg--ai.materials__msg--pending',
								{ key: 'pending' },
								t('mat.thinking'),
							),
						]
					: []),
			]),
			notice
				? m(
						'p.materials__notice',
						{
							role: noticeIsError ? 'alert' : 'status',
							class: noticeIsError ? 'materials__notice--error' : '',
						},
						notice,
					)
				: null,
			m(
				'p.materials__left',
				{ role: 'status' },
				left > 0
					? t('mat.left', { left, max: AGORA_MATERIALS.QUESTIONS_PER_SESSION })
					: t('mat.none_left'),
			),
			m(
				'form.materials__form',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						void send(attrs);
					},
				},
				[
					m('textarea.text-input.materials__input', {
						rows: 2,
						maxlength: AGORA_MATERIALS.MAX_QUESTION_CHARS,
						placeholder: t('mat.ask_ph'),
						'aria-label': t('mat.ask_ph'),
						disabled: left === 0 || asking,
						value: draft,
						oninput: (event: InputEvent) => {
							draft = (event.target as HTMLTextAreaElement).value;
						},
						onkeydown: (event: KeyboardEvent) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								void send(attrs);
							}
						},
					}),
					m(
						'button.btn.btn--primary',
						{ type: 'submit', disabled: left === 0 || asking || !draft.trim() },
						t('mat.ask_send'),
					),
				],
			),
		]);
	}

	return {
		view(vnode) {
			const attrs = vnode.attrs;
			const items = peek(attrs);
			if (!items) return null;

			return [
				m(
					'button.materials__open',
					{
						type: 'button',
						onclick: (event: MouseEvent) => {
							event.stopPropagation();
							opener = event.currentTarget as HTMLElement;
							open = true;
							loadChat(attrs);
						},
					},
					t('mat.open'),
				),
				open
					? m(
							'.materials',
							{
								role: 'dialog',
								'aria-modal': 'true',
								'aria-label': t('mat.sheet_title'),
								// Taps in the sheet must not advance the story behind it
								onclick: (event: MouseEvent) => event.stopPropagation(),
								onkeydown: (event: KeyboardEvent) => {
									if (event.key === 'Escape') close();
								},
							},
							m('.materials__panel', [
								m('header.materials__header', [
									m('h2.materials__title', t('mat.sheet_title')),
									m(
										'button.btn.btn--ghost.materials__close',
										{
											type: 'button',
											oncreate: (closeVnode: m.VnodeDOM) => (closeVnode.dom as HTMLElement).focus(),
											onclick: close,
										},
										t('mat.close'),
									),
								]),
								m('.materials__body', [
									m('section.materials__read', { 'aria-label': t('mat.read_title') }, [
										m('h3.materials__heading', t('mat.read_title')),
										m('ul.materials__list', items.map(itemView)),
									]),
									chatView(attrs),
								]),
							]),
						)
					: null,
			];
		},
	};
}
