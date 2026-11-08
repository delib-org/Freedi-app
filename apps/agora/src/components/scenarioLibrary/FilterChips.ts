import m from 'mithril';
import { AgoraLibraryTag, tagLabelIn } from '@freedi/shared-types';

export interface FilterChipsAttrs {
	/** The group's name: "Subject", "Lesson type" */
	label: string;
	tags: readonly AgoraLibraryTag[];
	selected: readonly string[];
	lang: string;
	onToggle: (tagId: string) => void;
}

/**
 * A group of toggle chips. OR inside the group; the page ANDs the groups.
 * Each chip is a button with `aria-pressed`, so a screen reader hears the
 * state and the group is named by its heading.
 */
export const FilterChips: m.Component<FilterChipsAttrs> = {
	view({ attrs }) {
		const { label, tags, selected, lang, onToggle } = attrs;
		if (tags.length === 0) return null;

		return m('.scn-filter', { role: 'group', 'aria-label': label }, [
			m('p.scn-filter__label', label),
			m(
				'.scn-filter__chips',
				tags.map((tag) => {
					const on = selected.includes(tag.tagId);

					return m(
						'button.scn-chip',
						{
							key: tag.tagId,
							type: 'button',
							'aria-pressed': String(on),
							class: on ? 'scn-chip--on' : undefined,
							onclick: () => onToggle(tag.tagId),
						},
						[
							m('span', tagLabelIn(tag, lang)),
							tag.scenarioCount > 0 ? m('span.scn-chip__count', tag.scenarioCount) : null,
						],
					);
				}),
			),
		]);
	},
};
