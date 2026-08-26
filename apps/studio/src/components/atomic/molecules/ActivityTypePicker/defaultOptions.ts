import { ActivityType } from '@freedi/shared-types';
import type { ActivityTypeOption } from './TypeCard';

type Translate = (text: string) => string;

/**
 * The four activity types Studio offers when creating a question, with the
 * facilitator-facing copy. `t` is the app translator (English-string keys).
 */
export function DEFAULT_ACTIVITY_OPTIONS(t: Translate): ActivityTypeOption[] {
	return [
		{
			type: ActivityType.massConsensus,
			description: t("Many people suggest ideas and rate each other's — no facilitation needed."),
			whenToUse: [t('Hundreds of residents, over days or weeks.')],
			recommended: true,
		},
		{
			type: ActivityType.join,
			description: t(
				'People in a room join the proposals they support, while you steer from the front.',
			),
			whenToUse: [t('A town-hall or workshop, 20–300 people, live.')],
		},
		{
			type: ActivityType.question,
			description: t('A focused question with chat, options and voting.'),
			whenToUse: [t('A committee or team, deeper conversation.')],
		},
		{
			type: ActivityType.signDocument,
			description: t('A text people read, comment on and sign.'),
			whenToUse: [],
			disabledReason: t('Coming soon'),
		},
	];
}
