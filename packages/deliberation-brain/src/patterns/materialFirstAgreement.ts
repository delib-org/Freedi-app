import type { DeliberationPattern } from '../types';

/**
 * Material-first agreement: results exist (a survey, a session, earlier
 * comments) but no text → enter at the Draft step, comment, optionally
 * converge in a room, revise, decide.
 */
export const materialFirstAgreement: DeliberationPattern = {
	patternId: 'materialFirstAgreement',
	name: 'Material-first agreement',
	summary:
		'Results already exist but nobody has written them up: the Draft step writes a proposal from those results, the community comments on it, a room resolves the gaps if a facilitator is available, a revised draft goes out for corrections, and the decision is taken in a vote.',
	applicability: [
		{
			field: 'hasDraft',
			oneOf: ['material'],
			weight: 5,
			note: 'material exists (survey or session results) but no text yet',
		},
		{
			field: 'desiredOutput',
			oneOf: ['agreedText', 'decision'],
			weight: 1,
			note: 'an agreed text or a decision is expected',
		},
		{
			field: 'facilitationCapacity',
			oneOf: ['canRunRoom'],
			weight: 1,
			note: 'a facilitator can run the convergence room',
		},
	],
	sequence: [
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'What in the proposed agreement on {{topic}} works, and what is missing?',
			descriptionTemplate:
				'This proposal was written from the results we already have. Mark how much you agree with each paragraph and comment where it falls short.',
			openNow: false,
			timing: { durationDays: 10, nudgeDaysBeforeClose: 3 },
			draftFromExisting: true,
			draftIntentTemplate:
				'Write a proposed agreement on {{topic}} from the existing results: cluster the leading suggestions into sections, keep provenance, and list the open gaps.',
		},
		{
			role: 'converge',
			engine: 'liveSession',
			questionTemplate: 'How do we close the main gaps the comments exposed in the proposal on {{topic}}?',
			descriptionTemplate:
				'Facilitator note: open with the paragraphs that split the community, invite proposals that resolve them, and let people join the proposals they can live with.',
			openNow: false,
			timing: { startAfterPrevious: 3 },
			skipWhen: { field: 'facilitationCapacity', oneOf: ['none'] },
		},
		{
			role: 'comment',
			engine: 'document',
			questionTemplate: 'Are there last corrections to the revised agreement on {{topic}}?',
			descriptionTemplate:
				'The comments and the room\'s proposals were folded into this revised text. Read it in your own time and mark what still needs correcting.',
			openNow: false,
			timing: { durationDays: 7, nudgeDaysBeforeClose: 2 },
			draftFrom: [1, 0],
			draftIntentTemplate:
				'Revise the agreement on {{topic}}: fold in the room\'s proposals and the paragraph comments, keep what was agreed, list what remains open.',
		},
		{
			role: 'decide',
			engine: 'discussion',
			questionTemplate: 'Do we adopt the agreement on {{topic}}?',
			descriptionTemplate:
				'A vote in Main / the assembly: the community decides with the comment rounds and the room\'s results on the record.',
			openNow: false,
			timing: { startAfterPrevious: 1, durationDays: 7 },
		},
	],
	rationale:
		'Material without a text is a process that stalled at the joint: the Draft step writes the proposal from the results that already exist, so no round is repeated. From there the spine is the usual one — comment to expose the gaps, converge in a room when someone can facilitate, revise, and decide.',
	risks: [
		'In a new question the sources are not yet known — ask the admin which results (which survey, which session) the draft should be written from, and name them in draftFrom.',
		'Review the first draft before it opens; results from one segment only make a one-sided proposal.',
		'Without a facilitator, skip the room and let the second comment round do the converging.',
	],
	successSignals: [
		'The first draft cites the leading results, and most of its paragraphs carry a positive mean agreement.',
		'The gaps after the first comment round are few enough for one room to resolve.',
		'The vote passes with the revised text.',
	],
	mainQuestionTemplate: 'What agreement on {{topic}} can {{organization}} write from what we already know?',
};
