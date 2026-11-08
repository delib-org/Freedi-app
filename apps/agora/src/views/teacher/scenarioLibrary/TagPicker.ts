import m from 'mithril';
import {
	AGORA_LIBRARY,
	AgoraLibraryTag,
	AgoraLibraryTagKind,
	findNearDuplicateTags,
	normalizeLibraryText,
	normalizeTagKey,
	tagLabelIn,
} from '@freedi/shared-types';
import { t } from '../../../lib/i18n';

export interface TagPickerAttrs {
	id: string;
	kind: AgoraLibraryTagKind;
	label: string;
	max: number;
	tags: readonly AgoraLibraryTag[];
	selected: readonly string[];
	lang: string;
	onChange: (tagIds: string[]) => void;
	/** Mint a tag from these words; resolves with its id, or null when it failed */
	onCreate: (label: string) => Promise<string | null>;
}

const SUGGESTIONS = 8;

/**
 * Pick tags for a scenario, and add a new one only after seeing what already
 * exists. The "create" row is the quietest thing in the list, and it is shown
 * under the near matches — the duplicate defence starts here, before the
 * server's id-by-meaning does the final say.
 */
export function TagPicker(): m.Component<TagPickerAttrs> {
	let text = '';
	let focused = false;
	let creating = false;
	let createFailed = false;
	let blurTimer: number | undefined;

	function suggestions(attrs: TagPickerAttrs): AgoraLibraryTag[] {
		const pool = attrs.tags.filter(
			(tag) => tag.kind === attrs.kind && !tag.aliasOf && !attrs.selected.includes(tag.tagId),
		);
		const needle = normalizeLibraryText(text);
		if (!needle) {
			return pool.sort((a, b) => b.scenarioCount - a.scenarioCount).slice(0, SUGGESTIONS);
		}
		const matches = pool.filter((tag) =>
			Object.values(tag.labels).some((label) => normalizeLibraryText(label).includes(needle)),
		);
		const near = findNearDuplicateTags(text, attrs.kind, pool).map((entry) => entry.tag);

		return [...new Set([...matches, ...near])].slice(0, SUGGESTIONS);
	}

	function add(attrs: TagPickerAttrs, tagId: string): void {
		if (attrs.selected.length >= attrs.max || attrs.selected.includes(tagId)) return;
		attrs.onChange([...attrs.selected, tagId]);
		text = '';
	}

	async function create(attrs: TagPickerAttrs): Promise<void> {
		const label = text.trim();
		if (label.length < AGORA_LIBRARY.TAG_LABEL_MIN || creating) return;
		creating = true;
		createFailed = false;
		m.redraw();
		const tagId = await attrs.onCreate(label);
		creating = false;
		if (tagId) add(attrs, tagId);
		else createFailed = true;
		m.redraw();
	}

	return {
		view({ attrs }) {
			const { id, kind, label, max, tags, selected, lang, onChange } = attrs;
			const byId = new Map(tags.map((tag) => [tag.tagId, tag]));
			const full = selected.length >= max;
			const found = suggestions(attrs);
			const key = normalizeTagKey(text);
			const exact = tags.some((tag) => tag.kind === kind && tag.normalizedKey === key && key);
			const open = focused && !full;
			const listId = `${id}-list`;

			return m('.scn-picker-field', [
				m('label.scn-field__label', { for: `${id}-input` }, label),
				m(
					'ul.scn-selected',
					{ 'aria-label': label },
					selected.map((tagId) => {
						const tag = byId.get(tagId);
						const name = tag ? tagLabelIn(tag, lang) : tagId;

						return m('li', { key: tagId }, [
							m('span.scn-tag.scn-tag--picked', [
								m('span', name),
								m(
									'button.scn-tag__remove',
									{
										type: 'button',
										'aria-label': t('scenlib.tag_remove', { label: name }),
										onclick: () => onChange(selected.filter((entry) => entry !== tagId)),
									},
									'✕',
								),
							]),
						]);
					}),
				),
				m('input.text-input', {
					id: `${id}-input`,
					type: 'text',
					role: 'combobox',
					'aria-expanded': String(open),
					'aria-controls': listId,
					'aria-autocomplete': 'list',
					autocomplete: 'off',
					value: text,
					disabled: full,
					maxlength: AGORA_LIBRARY.TAG_LABEL_MAX,
					placeholder: full ? t('scenlib.tag_full', { n: max }) : t('scenlib.tag_search'),
					oninput: (event: InputEvent) => {
						text = (event.target as HTMLInputElement).value;
						createFailed = false;
					},
					onfocus: () => {
						window.clearTimeout(blurTimer);
						focused = true;
					},
					onblur: () => {
						// Let a click on a suggestion land before the list closes
						blurTimer = window.setTimeout(() => {
							focused = false;
							m.redraw();
						}, 150);
					},
					onkeydown: (event: KeyboardEvent) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							if (found[0] && normalizeTagKey(tagLabelIn(found[0], lang)) === key) {
								add(attrs, found[0].tagId);
							}
						}
					},
				}),
				open
					? m('ul.scn-suggest', { id: listId, role: 'listbox', 'aria-label': label }, [
							// A keyed list takes no holes (Mithril): optional rows are spread in or out
							...(text.trim() !== '' && found.length > 0
								? [
										m(
											'li.scn-suggest__head',
											{ key: 'head', role: 'presentation' },
											t('scenlib.tag_similar'),
										),
									]
								: []),
							...found.map((tag) =>
								m('li', { key: tag.tagId, role: 'option' }, [
									m(
										'button.scn-suggest__row',
										{ type: 'button', onclick: () => add(attrs, tag.tagId) },
										[
											m('span', tagLabelIn(tag, lang)),
											tag.scenarioCount > 0 ? m('span.scn-chip__count', tag.scenarioCount) : null,
										],
									),
								]),
							),
							...(text.trim().length >= AGORA_LIBRARY.TAG_LABEL_MIN && !exact
								? [
										m('li', { key: 'create', role: 'option' }, [
											m(
												'button.scn-suggest__create',
												{ type: 'button', disabled: creating, onclick: () => void create(attrs) },
												t('scenlib.tag_create', { label: text.trim() }),
											),
										]),
									]
								: []),
						])
					: null,
				createFailed ? m('p.scn-field__error', { role: 'alert' }, t('scenlib.tag_failed')) : null,
			]);
		},
	};
}
