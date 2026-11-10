import {
	Award,
	Lightbulb,
	MessageCircle,
	Palette,
	Star,
	ThumbsUp,
	Trophy,
	Vote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CreditAction } from '@freedi/shared-types';
import type { Badge } from '@freedi/shared-types';

type Translate = (key: string) => string;

interface BadgeTextKeys {
	name: string;
	description: string;
}

/** Translation key for each credit action; null keeps it out of Recent Activity. */
const CREDIT_ACTION_LABEL_KEYS: Record<CreditAction, string | null> = {
	[CreditAction.JOIN_DISCUSSION]: 'engagement.action.joinDiscussion',
	[CreditAction.EVALUATE_OPTION]: 'engagement.action.rateAnswer',
	[CreditAction.CREATE_OPTION]: 'engagement.action.addAnswer',
	[CreditAction.COMMENT]: 'engagement.action.comment',
	[CreditAction.VOTE]: 'engagement.action.vote',
	[CreditAction.SIGN_DOCUMENT]: 'engagement.action.signDocument',
	[CreditAction.DAILY_LOGIN]: null,
	[CreditAction.STREAK_BONUS]: null,
	[CreditAction.CONSENSUS_REACHED]: 'engagement.action.consensusReached',
	[CreditAction.SUGGESTION_ACCEPTED]: 'engagement.action.answerAccepted',
	[CreditAction.MC_PARTICIPATION]: 'engagement.action.survey',
	[CreditAction.INVITE_FRIEND]: 'engagement.action.invite',
	[CreditAction.COMMENT_MARKED_HELPFUL]: 'engagement.action.commentHelpful',
};

const BADGE_TEXT_KEYS: Record<string, BadgeTextKeys> = {
	first_evaluation: {
		name: 'engagement.badge.firstEvaluation.name',
		description: 'engagement.badge.firstEvaluation.description',
	},
	evaluator_10: {
		name: 'engagement.badge.evaluator10.name',
		description: 'engagement.badge.evaluator10.description',
	},
	evaluator_50: {
		name: 'engagement.badge.evaluator50.name',
		description: 'engagement.badge.evaluator50.description',
	},
	first_option: {
		name: 'engagement.badge.firstOption.name',
		description: 'engagement.badge.firstOption.description',
	},
	creator_5: {
		name: 'engagement.badge.creator5.name',
		description: 'engagement.badge.creator5.description',
	},
	first_vote: {
		name: 'engagement.badge.firstVote.name',
		description: 'engagement.badge.firstVote.description',
	},
	commenter_10: {
		name: 'engagement.badge.commenter10.name',
		description: 'engagement.badge.commenter10.description',
	},
};

/** Badge documents store an icon name set by the server's badge definitions. */
const BADGE_ICONS: Record<string, LucideIcon> = {
	star: Star,
	thumbs_up: ThumbsUp,
	trophy: Trophy,
	lightbulb: Lightbulb,
	palette: Palette,
	ballot: Vote,
	chat: MessageCircle,
};

export function isCreditActionListed(action: CreditAction): boolean {
	return CREDIT_ACTION_LABEL_KEYS[action] !== null;
}

export function getCreditActionLabel(t: Translate, action: CreditAction): string {
	return t(CREDIT_ACTION_LABEL_KEYS[action] ?? 'engagement.action.other');
}

export function getBadgeIcon(icon: string): LucideIcon {
	return BADGE_ICONS[icon] ?? Award;
}

/** Translated text for a badge, or the text stored on it when the id is unknown. */
export function getBadgeText(t: Translate, badge: Badge): { name: string; description: string } {
	const keys = BADGE_TEXT_KEYS[badge.badgeId];
	if (!keys) {
		return { name: badge.name, description: badge.description };
	}

	return { name: t(keys.name), description: t(keys.description) };
}
