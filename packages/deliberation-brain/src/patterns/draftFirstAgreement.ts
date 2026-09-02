import type { DeliberationPattern } from '../types';

/**
 * Draft-first agreement (the Hazorea process): a text exists → public comment →
 * one live session per audience segment on the main gaps → revised draft →
 * last corrections → assembly / vote in Main.
 */
export const draftFirstAgreement: DeliberationPattern = {
	patternId: 'draftFirstAgreement',
	name: 'Draft-first agreement',
	summary:
		'A draft already exists: the whole community comments on it paragraph by paragraph, a facilitated room per audience segment resolves the main gaps, the Draft step folds the rooms\' results into a revised text, everyone gets a last round of corrections in their own time, and the assembly votes.',
	applicability: [
		{ field: 'hasDraft', oneOf: ['text'], weight: 5, note: 'a written draft already exists' },
		{
			field: 'decisionBody',
			oneOf: ['assembly', 'council'],
			weight: 2,
			note: 'the deciding body is the whole community or its council',
		},
		{
			field: 'audienceSize',
			oneOf: ['community', 'public'],
			weight: 1,
			note: 'a community-sized audience should see the text before any room does',
		},
		{
			field: 'decisionType',
			oneOf: ['choose', 'draftText'],
			weight: 1,
			note: 'a direction or a text must be settled',
		},
	],
	sequence: [
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'What in the draft on {{topic}} do you agree with, and what needs to change?',
			descriptionTemplate:
				'Read the draft paragraph by paragraph, mark how much you agree with each one, and comment where something is missing or wrong.',
			openNow: true,
			timing: { startAfterDays: 0, durationDays: 14, nudgeDaysBeforeClose: 3 },
		},
		{
			role: 'converge',
			engine: 'liveSession',
			perSegment: true,
			questionTemplate: 'How do we close the main gaps the comments exposed in the draft on {{topic}}?',
			descriptionTemplate:
				'Session for {{segment}}. Facilitator note: open with the paragraphs that split the community, invite proposals that resolve them, and let people join the proposals they can live with.',
			openNow: false,
			timing: { startAfterPrevious: 3 },
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Are there last corrections to the revised agreement on {{topic}} before we vote?',
			descriptionTemplate:
				'The rooms\' proposals were folded into this revised text. Read it in your own time and mark what still needs correcting.',
			openNow: false,
			timing: { durationDays: 7, nudgeDaysBeforeClose: 2 },
			draftFrom: [1],
			draftIntentTemplate:
				'Revise the agreement on {{topic}} with the proposals the live sessions converged on; keep the paragraphs the community already agreed with, and list the gaps that remain open.',
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'Do we adopt the agreement on {{topic}}?',
			descriptionTemplate:
				'A vote in Main / the assembly: the community ratifies the agreement with the comment rounds and the rooms\' results on the record.',
			openNow: false,
			timing: { startAfterPrevious: 1, durationDays: 7 },
		},
	],
	rationale:
		'When a text exists the community should meet it first: comments paragraph by paragraph show exactly where agreement is missing, so the room works on real gaps instead of a blank page. One room per segment (members, youth) lets each group resolve its own stakes, and the Draft step merges them. The second comment round is what gives the room\'s result legitimacy with the people who were not there, and the vote closes the loop.',
	risks: [
		'A room before the comment round argues about everything; keep the order: comment, then converge.',
		'The revised draft must be reviewed by the admin before it opens — the Draft step writes it, a person approves it.',
		'If the assembly is far away, keep the last-corrections round short so momentum is not lost.',
	],
	successSignals: [
		'Most paragraphs of the first draft carry a positive mean agreement; the gaps are few and clear.',
		'Each live session ends with proposals joined by most of the room.',
		'The last-corrections round adds few new gaps, and the vote passes.',
	],
	mainQuestionTemplate: 'What agreement on {{topic}} can {{organization}} stand behind?',
};
