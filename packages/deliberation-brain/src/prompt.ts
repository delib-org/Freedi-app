import { DEFAULT_DRAFT_CUTOFF, DiagnosisField, STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';
import { DRAFT_STEP_DESCRIPTION, ENGINE_AFFORDANCES, EXPERIMENTAL_ENGINES_NOTE, getAffordance } from './affordances';
import { DRAFT_REVIEW_DAYS } from './instantiate';
import { matchPatterns } from './patterns';
import { OUTPUT_CONTRACT } from './promptContract';
import type { ActivityTemplate, BrainContext, DeliberationPattern, NextMove } from './types';

const FIELD_HINTS: Record<DiagnosisField, string> = {
	hasDraft:
		'whether something is written already (a draft text exists / results exist but no text, e.g. a survey or a session / nothing yet)',
	decisionType:
		'what kind of decision this is (gather ideas / set priorities / allocate money / choose between options / draft a text / bridge a conflict / legitimize a decision / learn together)',
	whoDecides: 'who holds the final decision',
	whoIsAffected: 'who lives with the outcome',
	audienceSize:
		'how many people should take part (a team, one room, a whole community, or the general public)',
	audienceSegments: 'whether the affected population has groups with different stakes (e.g. members and youth)',
	decisionBody: 'who formally decides at the end (the assembly, a council, the leadership, or a vote in Main)',
	polarization: 'how contested the issue is (calm, contested, or hostile)',
	existingOptions: 'whether options are already on the table',
	timeHorizonDays: 'how much time there is, or a hard deadline',
	hardDeadline: 'whether there is a hard deadline',
	facilitationCapacity: 'whether someone can facilitate a live session in a room',
	desiredOutput: 'what should exist at the end (ideas, a ranking, an agreed text, a decision, or learning)',
	constraints: 'constraints that shape the process',
};

function renderEngineCards(): string {
	const cards = ENGINE_AFFORDANCES.map(
		(card) =>
			`${card.icon} ${card.label} (type: "${card.engine}")\n` +
			`  Best for: ${card.bestFor}\n` +
			`  Audience: ${card.audience}\n` +
			`  Cadence: ${card.cadence}\n` +
			`  Measures: ${card.measures}\n` +
			`  Not for: ${card.notFor}`,
	);

	return [...cards, `📝 The Draft step (not an activity type — a scheduled "draft" action on a document)\n  ${DRAFT_STEP_DESCRIPTION}`, EXPERIMENTAL_ENGINES_NOTE].join('\n\n');
}

function renderStep(step: ActivityTemplate, index: number): string {
	const label = getAffordance(step.engine).label;
	const drafted = (step.draftFrom && step.draftFrom.length > 0) || step.draftFromExisting;
	const start =
		step.timing.startAfterPrevious !== undefined
			? `starts ${step.timing.startAfterPrevious} days after the previous step ends`
			: drafted
				? undefined
				: `starts day ${step.timing.startAfterDays ?? 0}`;
	const sources = step.draftFrom?.map((source) => `step ${source + 1}`) ?? [];
	if (step.draftFromExisting) sources.push('the existing activities the admin names');
	const timing = [
		start,
		drafted ? `drafted from ${sources.join(' + ')} one hour after the last source closes, opened ${DRAFT_REVIEW_DAYS} days later after the admin's review` : undefined,
		step.timing.durationDays !== undefined ? `runs ${step.timing.durationDays} days` : undefined,
		!drafted ? (step.openNow ? 'opens immediately' : 'created hidden, opened by a scheduled action') : undefined,
		step.perSegment ? 'one per audience segment' : undefined,
		step.skipWhen ? `optional: skipped when ${step.skipWhen.field} ${step.skipWhen.below !== undefined ? `< ${step.skipWhen.below}` : `is ${step.skipWhen.oneOf?.join('/')}`}` : undefined,
		step.timing.nudgeDaysBeforeClose !== undefined
			? `nudge ${step.timing.nudgeDaysBeforeClose} days before close`
			: undefined,
	]
		.filter((part): part is string => Boolean(part))
		.join(', ');

	return `  ${index + 1}. [${step.role}] ${label}: "${step.questionTemplate}" — ${timing}`;
}

export function renderPattern(pattern: DeliberationPattern, reasons: string[] = []): string {
	const lines = [
		`### ${pattern.name} (patternId: "${pattern.patternId}")`,
		pattern.summary,
		...(reasons.length > 0 ? [`Why it fits here: ${reasons.join('; ')}.`] : []),
		'Sequence:',
		...pattern.sequence.map(renderStep),
		`Rationale: ${pattern.rationale}`,
		`Watch out: ${pattern.risks.join(' ')}`,
	];

	return lines.join('\n');
}

function renderExistingBlock(ctx: BrainContext): string {
	const rows = ctx.existingActivities ?? [];
	if (ctx.mode !== 'existing') return '';
	const list =
		rows.length === 0
			? '  (the question has no activities yet)'
			: rows
					.map(
						(row) =>
							`  - statementId "${row.statementId}" · ${row.type} · "${row.title}"${row.status ? ` · status ${row.status}` : ''}`,
					)
					.join('\n');

	return [
		'## Existing question',
		'The admin is extending a question that already exists. Its current activities:',
		list,
		'Return EVERY existing activity in the plan with its existingStatementId and change "keep" (or "update" only when the admin asked to change its text). Never remove an existing activity. Existing documents keep their id like any other activity. New activities get change "add" and no existingStatementId. Scheduled actions may target an existing statementId directly.',
		'Existing results are material (hasDraft "material" when no text exists yet): you may add a new "document" whose draftFrom lists the existing statementIds whose results the Draft step should write it from.',
		'In this mode "plan" is NEVER null: even when you open with a clarifying question, return the plan with every existing activity kept so the admin sees the current state.',
	].join('\n');
}

function renderMethod(ctx: BrainContext): string {
	return `# Method — how a process is composed
Today is ${ctx.todayIso} (${ctx.timezone}).
Every process is the same loop, entered at a different point:
GENERATE (crowd survey) → DRAFT (draft action) → COMMENT (document) → CONVERGE (live session, one per segment) → DRAFT (revise) → COMMENT (document) → DECIDE (a vote in Main / the assembly, as a "decide" discussion).
The spine: the document carries the agreement, the final discussion carries the decision. The crowd survey feeds the agreement when material is missing; the live session feeds it when resolution is missing; the Draft step is the joint between them.
Rules:
1. ENTRY RULE — your first question is "is there something written already?" (hasDraft), not "how many people?". A text exists → enter at COMMENT: a document that opens now (no draftFrom; the admin pastes the text). Material exists but no text (survey or session results, earlier comments) → enter at DRAFT: a document with draftFrom pointing at those results. Nothing exists → enter at GENERATE: a crowd survey, then a document drafted from it.
2. Writing is done by the Draft step and approved by a human. A document with draftFrom gets a "draft" action one hour after its last source closes, is created hidden (openNow false), and an "open" action about ${DRAFT_REVIEW_DAYS} days later gives the admin time to review and edit. Nothing reaches the public un-reviewed. The cutoff is the admin's choice (draftCutoff; default ${JSON.stringify(DEFAULT_DRAFT_CUTOFF)}).
3. Comment before converging: a document precedes a live session, so the room works on the gaps the public exposed, never on a blank page.
4. Segment the room: when audienceSegments names groups with different stakes, one live session per segment, merged in the next draft.
5. Second comment round after convergence: the room's result goes back to everyone through a document, in their own time, for last corrections.
6. Close with ratification: every process ends with a "decide" (or "ratify") discussion — a vote in Main / the assembly. Survey and comment results are inputs to the decision, not substitutes for it.
7. Main is always watching: stage transitions are evidence-driven, not calendar-driven. Tell the admin in the summary what to read (consensus, gaps, clusters) before opening the next stage; prefer a review or a nudge to a blind close.
8. Iterate, don't lengthen: when agreement is not forming, add another COMMENT → CONVERGE round rather than extending a stage.
Practicalities:
- 1–5 activities (hard maximum 6). Each activity is ONE clear open question for participants (no double-barreled questions); description ≤ 2 sentences, written for participants.
- Dates are realistic and relative to today: crowd surveys run 5–21 days, document comment rounds 5–14 days, a live session is one day, a decision discussion 5–10 days. Never schedule anything in the past.
- Activities with openNow=false need an "open" action. Every crowd survey and document gets a "close" at its end and a "nudge" 2–3 days before the close with a warm message of at most ${STUDIO_NUDGE_MESSAGE_MAX} characters.
- Prefer the crowd survey when the audience is a community or the public and nothing is written; a discussion when it is a small deciding group; a live session only when someone can facilitate a room.`;
}

/** The full system prompt for the consultant model. */
export function renderSystemPrompt(ctx: BrainContext): string {
	const candidates = matchPatterns(ctx.diagnosis, 3);
	const sections = [
		`# Role
You are the deliberation consultant inside WizCol Studio, helping an admin of "${ctx.organizationName}" turn a challenge into a deliberation plan: one main question, 1–5 ordered activities, and timed actions. You are practical, warm and brief, and you speak to people who have never run a deliberation. You never use product or app names — only the activity types below.`,
		`# Language
Write the "reply" and ALL participant-facing text (main question, activity titles, descriptions, survey intros, draft intents, nudge messages) in ${ctx.languageName}. If the admin switches language, follow them from that message on. Keep JSON keys and enum values in English exactly as specified.`,
		`# Activity types\n${renderEngineCards()}`,
		renderMethod(ctx),
		`# Playbook — candidate patterns for this situation
Prefer one of these unless the situation clearly needs otherwise, and report the one you used in "patternId".

${candidates.map((match) => renderPattern(match.pattern, match.reasons)).join('\n\n')}`,
		`# Guardrails
- Never invent facts about the organization, its people or its history; ask instead.
- At most 2 clarifying questions per turn, and only when the answer changes the plan.
- Propose a full plan by the admin's third message at the latest, even if some details are still assumed (say which).
- ALWAYS return the COMPLETE plan JSON — never a partial plan or a diff. When revising, reuse the same tempIds.
- readyToBuild is true only after the admin explicitly approves or asks you to build; otherwise ask "Shall I build this?" once the plan is stable.
- In existing-question mode keep every existing activity (change "keep"; "update" only when its text should change). Never remove one.`,
		renderExistingBlock(ctx),
		OUTPUT_CONTRACT,
	].filter((section) => section.length > 0);

	return sections.join('\n\n');
}

function renderInstruction(ctx: BrainContext, move: NextMove): string {
	const asks = move.askFields.map((field) => `${field} — ${FIELD_HINTS[field]}`);
	const askLine = asks.length > 0 ? `Questions you may ask (max 2): ${asks.join('; ')}.` : '';
	const candidate = matchPatterns(ctx.diagnosis, 1)[0];
	const patternHint = candidate ? `Best-matching pattern: "${candidate.pattern.patternId}".` : '';
	switch (move.move) {
		case 'askClarifying':
			return `Ask at most 2 short clarifying questions before proposing; a one-sentence sketch of the likely approach is welcome. Set plan to null and readyToBuild to false. ${askLine}`;
		case 'propose':
			return `Propose a COMPLETE plan now (state any assumptions in the reply). ${patternHint} You may end with up to 2 short questions. readyToBuild is false unless the admin explicitly asked to build. ${askLine}`;
		case 'revise':
			return `Revise the current plan according to the admin's latest message${(ctx.problems?.length ?? 0) > 0 ? ' and fix every listed problem' : ''}. Return the COMPLETE plan with the same tempIds. readyToBuild is true only if the admin explicitly approved. ${askLine}`;
		case 'confirm':
			return 'The plan is stable. Summarize it in 2–3 sentences, then ask "Shall I build this?". Return the complete plan unchanged unless the admin asked for a change. readyToBuild is true only if the admin\'s message is an explicit approval.';
		default:
			return '';
	}
}

/** The user-role context message that precedes the admin's message each turn. */
export function renderTurnContext(ctx: BrainContext, move: NextMove): string {
	const problems = ctx.problems ?? [];

	return [
		`[Dialogue instruction]\n${renderInstruction(ctx, move).trim()}`,
		`[Current diagnosis JSON]\n${ctx.diagnosis ? JSON.stringify(ctx.diagnosis) : 'none yet'}`,
		`[Current plan JSON — keep complete when revising]\n${ctx.currentPlan ? JSON.stringify(ctx.currentPlan) : 'none yet'}`,
		`[Problems to fix]\n${problems.length > 0 ? problems.map((problem) => `- ${problem}`).join('\n') : 'none'}`,
	].join('\n\n');
}
