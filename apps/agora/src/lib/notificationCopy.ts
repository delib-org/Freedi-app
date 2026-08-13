import type { IconName } from '../components/Icon';
import { t } from './i18n';

/**
 * One line and one glyph per kind of news, shared by the toast that announces
 * it and the inbox that keeps it. Two copies of this map would drift within a
 * lesson — the toast and the inbox row are the same sentence, said twice.
 */
export interface TriggerLook {
	icon: IconName;
	line: string;
}

const LOOKS: Readonly<Record<string, { icon: IconName; key: string }>> = {
	agora_suggestion_received: { icon: 'idea', key: 'toast.suggestion_received' },
	agora_suggestion_accepted: { icon: 'thanks', key: 'toast.suggestion_accepted' },
	agora_suggestion_declined: { icon: 'again', key: 'toast.suggestion_declined' },
	agora_suggestion_thanked: { icon: 'thanks', key: 'toast.suggestion_thanked' },
	agora_suggestion_implemented: { icon: 'weave', key: 'toast.suggestion_accepted' },
	agora_round_started: { icon: 'flag', key: 'toast.round_started' },
	agora_helped_improved: { icon: 'spark', key: 'toast.helped_improved' },
	agora_thread_message: { icon: 'talk', key: 'toast.thread_message' },
	agora_class_record: { icon: 'bridge', key: 'toast.class_record' },
	agora_revision_credited: { icon: 'edit', key: 'toast.revision_credited' },
	agora_weave_credited: { icon: 'weave', key: 'toast.weave_credited' },
	agora_bridging_achieved: { icon: 'bridge', key: 'toast.bridging_achieved' },
	agora_proposal_credited: { icon: 'proposal', key: 'toast.proposal_credited' },
	agora_bridge_zone: { icon: 'trophy', key: 'toast.bridge_zone' },
	agora_climbed: { icon: 'trend', key: 'toast.climbed' },
};

/**
 * Is this one of the game's own moments?
 *
 * The shared Freedi notification pipeline also writes `statement_reply` docs
 * for agora's child statements, tagged `sourceApp: agora` — every thread
 * message arrives twice, once as the game's own sentence and once as a
 * generic reply carrying the raw text. The generic one has no copy here, so
 * it filed a blank line in the post box and toasted the same message a second
 * time. The game's detectors already describe every one of those events, and
 * better, so the generic twin is ignored.
 */
export function isAgoraTrigger(trigger: string | undefined): boolean {
	return trigger !== undefined && trigger in LOOKS;
}

export function triggerLook(trigger: string, fallback = ''): TriggerLook {
	const look = LOOKS[trigger];
	if (!look) return { icon: 'talk', line: fallback };

	return { icon: look.icon, line: t(look.key) || fallback };
}
