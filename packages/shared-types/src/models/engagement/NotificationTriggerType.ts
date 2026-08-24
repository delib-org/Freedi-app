export enum NotificationTriggerType {
	STATEMENT_REPLY = 'statement_reply',
	SOCIAL_PROOF = 'social_proof',
	CONSENSUS_SHIFT = 'consensus_shift',
	VOTING_DEADLINE = 'voting_deadline',
	DAILY_DIGEST = 'daily_digest',
	WEEKLY_DIGEST = 'weekly_digest',
	/** Odyssey voyage-story email digest at the user's chosen hours */
	ODYSSEY_DIGEST = 'odyssey_digest',
	CREDIT_EARNED = 'credit_earned',
	LEVEL_UP = 'level_up',
	BADGE_EARNED = 'badge_earned',
	STREAK_REMINDER = 'streak_reminder',
	WELCOME_BACK = 'welcome_back',
	EVIDENCE_ADDED = 'evidence_added',
	MENTION = 'mention',
	// Agora classroom game
	AGORA_SUGGESTION_RECEIVED = 'agora_suggestion_received',
	AGORA_SUGGESTION_ACCEPTED = 'agora_suggestion_accepted',
	AGORA_SUGGESTION_DECLINED = 'agora_suggestion_declined',
	AGORA_SUGGESTION_THANKED = 'agora_suggestion_thanked',
	AGORA_SUGGESTION_IMPLEMENTED = 'agora_suggestion_implemented',
	AGORA_ROUND_STARTED = 'agora_round_started',
	/** The author's proposal reached across the camps (bridging tier 1 or 2) */
	AGORA_BRIDGING_ACHIEVED = 'agora_bridging_achieved',
	/** The author's first proposal landed — the cold-start credit */
	AGORA_PROPOSAL_CREDITED = 'agora_proposal_credited',
	/** The author revised after new feedback and earned the revision credit */
	AGORA_REVISION_CREDITED = 'agora_revision_credited',
	/** The author wove a distinct helper's idea into the text (weave credit paid) */
	AGORA_WEAVE_CREDITED = 'agora_weave_credited',
}
