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
};

export function triggerLook(trigger: string, fallback = ''): TriggerLook {
	const look = LOOKS[trigger];
	if (!look) return { icon: 'talk', line: fallback };

	return { icon: look.icon, line: t(look.key) || fallback };
}
