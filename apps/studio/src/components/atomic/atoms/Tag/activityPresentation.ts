import { ActivityType } from '@freedi/shared-types';
import type { TagTypeModifier } from './Tag';

/**
 * How Studio presents an activity type to a facilitator: a plain-language
 * label (English i18n key), an emoji glyph, the BEM modifier that picks the
 * engine accent (`--activity-*`) and the engine's product name.
 *
 * Shared by ActivityTypeChip, ActivityRow, QuestionCard and the type picker
 * so every surface names the same thing the same way.
 */
export interface ActivityPresentation {
	/** English i18n key — pass through `t()`. */
	label: string;
	icon: string;
	modifier: TagTypeModifier;
	/** Product name shown after "Powered by" (proper noun, not translated). */
	engine: string;
}

const PRESENTATIONS: Record<TagTypeModifier, ActivityPresentation> = {
	join: { label: 'Live session', icon: '🤝', modifier: 'join', engine: 'Join' },
	mc: { label: 'Crowd survey', icon: '⚡', modifier: 'mc', engine: 'Mass Consensus' },
	sign: { label: 'Document', icon: '✍', modifier: 'sign', engine: 'Sign' },
	deliberation: { label: 'Discussion', icon: '❓', modifier: 'deliberation', engine: 'Freedi' },
};

export function getActivityPresentation(type: ActivityType): ActivityPresentation {
	switch (type) {
		case ActivityType.join:
			return PRESENTATIONS.join;
		case ActivityType.massConsensus:
			return PRESENTATIONS.mc;
		case ActivityType.signDocument:
			return PRESENTATIONS.sign;
		default:
			return PRESENTATIONS.deliberation;
	}
}
