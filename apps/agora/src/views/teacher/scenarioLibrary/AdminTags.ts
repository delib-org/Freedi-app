import m from 'mithril';
import { AgoraLibraryTag, AgoraLibraryTagKind } from '@freedi/shared-types';
import { t } from '../../../lib/i18n';
import { mergeLibraryTags } from '../../../lib/scenarioLibrary/api';
import { liveTagsOf, mergeCandidates, tagDisplay } from '../../../lib/scenarioLibrary/adminView';

export interface AdminTagsAttrs {
	tags: readonly AgoraLibraryTag[];
	lang: string;
	/** A merge finished: the page reads the tags again */
	onMerged: () => void;
}

type Phase = 'idle' | 'confirm' | 'merging' | 'done' | 'failed';

const SUGGESTION_LIMIT = 8;

/**
 * Merge a duplicate tag into the canonical one. Pick the two (or take a
 * suggestion), read the sentence that says what will change, confirm. The
 * server does the re-pointing in batches and is safe to run again.
 */
export function AdminTags(): m.Component<AdminTagsAttrs> {
	let kind: AgoraLibraryTagKind = 'subject';
	let fromId = '';
	let intoId = '';
	let phase: Phase = 'idle';
	let moved = 0;

	async function merge(attrs: AdminTagsAttrs): Promise<void> {
		phase = 'merging';
		m.redraw();
		try {
			const answer = await mergeLibraryTags({ fromId, intoId });
			moved = answer.scenarios;
			phase = 'done';
			fromId = '';
			intoId = '';
			attrs.onMerged();
		} catch (error) {
			console.error('[Library] Merging tags failed:', error);
			phase = 'failed';
		}
		m.redraw();
	}

	function select(
		id: string,
		label: string,
		value: string,
		options: readonly AgoraLibraryTag[],
		lang: string,
		onChange: (next: string) => void,
	): m.Children {
		return m('.scn-field', [
			m('label.scn-field__label', { for: id }, label),
			m(
				'select.text-input',
				{
					id,
					value,
					onchange: (event: Event) => {
						onChange((event.target as HTMLSelectElement).value);
						phase = 'idle';
					},
				},
				[
					m('option', { value: '' }, t('scenlib.adm_tags_pick')),
					...options.map((tag) =>
						m(
							'option',
							{ value: tag.tagId, selected: tag.tagId === value },
							`${tagDisplay(tag, lang)} (${tag.scenarioCount})`,
						),
					),
				],
			),
		]);
	}

	return {
		view({ attrs }) {
			const { tags, lang } = attrs;
			const options = liveTagsOf(tags, kind, lang);
			const byId = new Map(tags.map((tag) => [tag.tagId, tag]));
			const from = byId.get(fromId);
			const into = byId.get(intoId);
			const ready = Boolean(from && into && fromId !== intoId);
			const suggestions = mergeCandidates(tags, SUGGESTION_LIMIT);

			return m('.scn-adm__tags', [
				m('p.scn-note', t('scenlib.adm_tags_hint')),
				tags.length === 0 ? m('p.scn-note', t('scenlib.adm_tags_empty')) : null,
				suggestions.length > 0
					? m('.scn-adm__suggest', [
							m('h3.scn-rate__title', t('scenlib.adm_tags_suggest')),
							m(
								'ul.scn-adm__list',
								{ role: 'list' },
								suggestions.map(({ from: dupTag, into: canonTag }) =>
									m(
										'li.scn-adm__item.scn-adm__item--row',
										{ key: `${dupTag.tagId}>${canonTag.tagId}` },
										[
											m(
												'span',
												`${tagDisplay(dupTag, lang)} (${dupTag.scenarioCount}) → ${tagDisplay(canonTag, lang)} (${canonTag.scenarioCount})`,
											),
											m(
												'button.btn.btn--ghost.btn--sm',
												{
													type: 'button',
													onclick: () => {
														kind = dupTag.kind;
														fromId = dupTag.tagId;
														intoId = canonTag.tagId;
														phase = 'idle';
													},
												},
												t('scenlib.adm_tags_use'),
											),
										],
									),
								),
							),
						])
					: null,
				m('.scn-field', [
					m('label.scn-field__label', { for: 'scn-adm-kind' }, t('scenlib.adm_tags')),
					m(
						'select.text-input',
						{
							id: 'scn-adm-kind',
							value: kind,
							onchange: (event: Event) => {
								kind = (event.target as HTMLSelectElement).value as AgoraLibraryTagKind;
								fromId = '';
								intoId = '';
								phase = 'idle';
							},
						},
						[
							m(
								'option',
								{ value: 'subject', selected: kind === 'subject' },
								t('scenlib.subjects'),
							),
							m(
								'option',
								{ value: 'lessonType', selected: kind === 'lessonType' },
								t('scenlib.lesson_types'),
							),
						],
					),
				]),
				select('scn-adm-from', t('scenlib.adm_tags_dup'), fromId, options, lang, (next) => {
					fromId = next;
				}),
				select('scn-adm-into', t('scenlib.adm_tags_canon'), intoId, options, lang, (next) => {
					intoId = next;
				}),
				phase === 'confirm' && from && into
					? m('.scn-notice.scn-notice--bad', { role: 'alert' }, [
							m(
								'p',
								t('scenlib.adm_tags_confirm', {
									from: tagDisplay(from, lang),
									into: tagDisplay(into, lang),
								}),
							),
							m('.scn-compose__actions', [
								m(
									'button.btn.btn--primary.btn--sm',
									{ type: 'button', onclick: () => void merge(attrs) },
									t('scenlib.adm_tags_merge'),
								),
								m(
									'button.btn.btn--ghost.btn--sm',
									{
										type: 'button',
										onclick: () => {
											phase = 'idle';
										},
									},
									t('common.cancel'),
								),
							]),
						])
					: m(
							'button.btn.btn--secondary.btn--sm',
							{
								type: 'button',
								'aria-disabled': !ready || phase === 'merging' ? 'true' : undefined,
								onclick: () => {
									if (ready && phase !== 'merging') phase = 'confirm';
								},
							},
							phase === 'merging' ? t('scenlib.adm_tags_merging') : t('scenlib.adm_tags_merge'),
						),
				phase === 'done'
					? m('p.scn-notice', { role: 'status' }, t('scenlib.adm_tags_done', { n: moved }))
					: null,
				phase === 'failed'
					? m('p.scn-field__error', { role: 'alert' }, t('scenlib.adm_tags_failed'))
					: null,
			]);
		},
	};
}
