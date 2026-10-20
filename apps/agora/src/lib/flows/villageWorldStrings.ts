import { getLang, isRTL, t } from '../i18n';

/**
 * Every word the 3D world shows, resolved in the student's language.
 *
 * The world is an iframe and cannot call t(): the shell sends this record on
 * every `agora-village-state` (`strings`), and the world's own list
 * (`prototypes/olive-hill/world-strings.js`) keeps only the standalone tour's
 * Hebrew fallback. A test pins that both sides name the same keys.
 */
export const VILLAGE_WORLD_KEYS = [
	'bubble_written',
	'bubble_pending',
	'bubble_closed_written',
	'bubble_closed_empty',
	'btn_write',
	'btn_edit',
	'btn_read',
	'note_mine',
	'note_n',
	'paper_waiting',
	'paper_idle',
	'board_title',
	'board_locked',
	'board_locked_hint',
	'board_empty',
	'board_more',
	'board_more_one',
	'sign_later',
	'kind_story_name',
	'kind_story_prompt',
	'kind_needs_name',
	'kind_needs_prompt',
	'kind_vision_name',
	'kind_vision_prompt',
	'kind_open_name',
	'kind_open_prompt',
	'kind_proposal_name',
	'kind_proposal_prompt',
	'place_library_name',
	'place_library_short',
	'place_library_question',
	'place_challenge_name',
	'place_challenge_short',
	'place_challenge_question',
	'place_council_name',
	'place_council_short',
	'place_council_question',
	'map_toggle',
	'map_lead',
	'map_free',
	'class_at',
	'badge_locked',
	'badge_here',
	'badge_results',
	'badge_open',
	'enter_desk',
	'enter_results',
	'enter_booth',
	'enter_place',
	'enter_place_far',
	'walk_to',
	'stop',
	'hint',
] as const;

export type VillageWorldKey = (typeof VILLAGE_WORLD_KEYS)[number];

/** The app's own key for a world word: the note's two names are the board's, the rest `village.world.*` */
export function villageWorldI18nKey(key: VillageWorldKey): string {
	if (key === 'note_mine') return 'village.note.mine';
	if (key === 'note_n') return 'village.note.n';

	return `village.world.${key}`;
}

/**
 * The record the world receives. Placeholders (`{{n}}`, `{{place}}`) stay in
 * the text: the world fills them, because only it knows the number or name.
 */
export function villageWorldStrings(): Record<VillageWorldKey | 'dir' | 'lang', string> {
	const words = Object.fromEntries(
		VILLAGE_WORLD_KEYS.map((key) => [key, t(villageWorldI18nKey(key))]),
	) as Record<VillageWorldKey, string>;

	return { ...words, dir: isRTL() ? 'rtl' : 'ltr', lang: getLang() };
}
