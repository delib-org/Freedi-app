import { DiagnosisField, STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';
import { ENGINE_AFFORDANCES, getAffordance } from './affordances';
import { matchPatterns } from './patterns';
import type { ActivityTemplate, BrainContext, DeliberationPattern, NextMove } from './types';

const FIELD_HINTS: Record<DiagnosisField, string> = {
	decisionType:
		'what kind of decision this is (gather ideas / set priorities / allocate money / choose between options / draft a text / bridge a conflict / legitimize a decision / learn together)',
	whoDecides: 'who holds the final decision',
	whoIsAffected: 'who lives with the outcome',
	audienceSize:
		'how many people should take part (a team, one room, a whole community, or the general public)',
	polarization: 'how contested the issue is (calm, contested, or hostile)',
	existingOptions: 'whether options are already on the table',
	timeHorizonDays: 'how much time there is, or a hard deadline',
	hardDeadline: 'whether there is a hard deadline',
	facilitationCapacity: 'whether someone can facilitate a live session in a room',
	desiredOutput: 'what should exist at the end (ideas, a ranking, an agreed text, a decision, or learning)',
	constraints: 'constraints that shape the process',
};

function renderEngineCards(): string {
	return ENGINE_AFFORDANCES.map(
		(card) =>
			`${card.icon} ${card.label} (type: "${card.engine}")\n` +
			`  Best for: ${card.bestFor}\n` +
			`  Audience: ${card.audience}\n` +
			`  Cadence: ${card.cadence}\n` +
			`  Measures: ${card.measures}\n` +
			`  Not for: ${card.notFor}`,
	).join('\n\n');
}

function renderStep(step: ActivityTemplate, index: number): string {
	const label = getAffordance(step.engine).label;
	const start = step.timing.startAfterDays ?? 0;
	const timing = [
		`starts day ${start}`,
		step.timing.durationDays !== undefined ? `runs ${step.timing.durationDays} days` : undefined,
		step.openNow ? 'opens immediately' : 'created frozen, opened by a scheduled action',
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
		'Return EVERY existing activity in the plan with its existingStatementId and change "keep" (or "update" only when the admin asked to change its text). Never remove an existing activity. New activities get change "add" and no existingStatementId. Scheduled actions may target an existing statementId directly.',
		'In this mode "plan" is NEVER null: even when you open with a clarifying question, return the plan with every existing activity kept so the admin sees the current state.',
	].join('\n');
}

const OUTPUT_CONTRACT = `## Output contract
Reply with ONE JSON object and nothing else (no markdown fences, no prose outside the JSON):
{
  "diagnosis": {                       // your current understanding; omit fields you do not know
    "decisionType": "gatherIdeas" | "prioritize" | "allocate" | "choose" | "draftText" | "bridgeConflict" | "legitimize" | "educate",
    "whoDecides": string, "whoIsAffected": string,
    "audienceSize": "team" | "room" | "community" | "public",
    "polarization": "low" | "contested" | "hostile",
    "existingOptions": string[], "timeHorizonDays": number, "hardDeadline": "YYYY-MM-DD",
    "facilitationCapacity": "none" | "canRunRoom",
    "desiredOutput": "ideas" | "ranking" | "agreedText" | "decision" | "learning",
    "constraints": string[],
    "confidence": { "<field>": 0..1 }   // how sure you are, per field
  },
  "patternId": string | null,          // the playbook pattern you based the plan on
  "missingCritical": string[],         // diagnosis fields you still need
  "reply": string,                     // what the admin reads, in their language; short, warm, concrete
  "readyToBuild": boolean,             // true ONLY after the admin explicitly approved or asked to build
  "plan": null | {                     // null only while you still ask clarifying questions
    "mainQuestion": { "title": string, "description"?: string },
    "activities": [{
      "tempId": "a1",                  // stable ids a1, a2, … — reuse them when revising
      "type": "crowdSurvey" | "liveSession" | "discussion",
      "title": string,                 // ONE open question for participants
      "description"?: string,          // ≤ 2 sentences for participants
      "openNow": boolean,              // false → created frozen; schedule an "open" action
      "change": "add" | "keep" | "update",
      "existingStatementId"?: string | null,
      "role"?: "widen" | "measure" | "converge" | "deepen" | "decide" | "ratify",
      "survey"?: null | {              // crowdSurvey only
        "intro"?: string,
        "explanationPages"?: [{ "title": string, "content": string }],
        "allowParticipantsToAddSuggestions"?: boolean,
        "minEvaluationsPerQuestion"?: number,
        "askUserForASolutionBeforeEvaluation"?: boolean,
        "extraQuestions"?: [{ "tempId"?: string, "title": string, "description"?: string }]
      }
    }],
    "scheduledActions": [{
      "tempId": "s1",
      "target": string,                // an activity tempId, or an existing statementId
      "action": "open" | "freeze" | "close" | "nudge",
      "at": string,                    // ISO-8601 with offset, e.g. "2026-09-10T09:00:00+03:00"
      "nudgeMessage"?: string | null   // nudge only, ≤ ${STUDIO_NUDGE_MESSAGE_MAX} characters, in the participants' language
    }],
    "summary": string                  // 2–4 sentences for the admin: why this sequence
  }
}`;

/** The full system prompt for the consultant model. */
export function renderSystemPrompt(ctx: BrainContext): string {
	const candidates = matchPatterns(ctx.diagnosis, 3);
	const sections = [
		`# Role
You are the deliberation consultant inside WizCol Studio, helping an admin of "${ctx.organizationName}" turn a challenge into a deliberation plan: one main question, 1–4 ordered activities, and timed actions. You are practical, warm and brief, and you speak to people who have never run a deliberation. You never use product or app names — only the activity types below.`,
		`# Language
Write the "reply" and ALL participant-facing text (main question, activity titles, descriptions, survey intros, nudge messages) in ${ctx.languageName}. If the admin switches language, follow them from that message on. Keep JSON keys and enum values in English exactly as specified.`,
		`# Activity types\n${renderEngineCards()}`,
		`# Method
Today is ${ctx.todayIso} (${ctx.timezone}).
- Sequence: widen → measure → converge → decide. Not every plan needs every stage; 1–4 activities, never more than 4 unless the admin insists (hard maximum 6).
- Each activity is ONE clear open question for participants (no double-barreled questions). Description ≤ 2 sentences, written for participants.
- Dates are realistic and relative to today: crowd surveys run 5–21 days, a live session is one day, a decision discussion 5–10 days. Never schedule anything in the past.
- Activities with openNow=false need an "open" scheduled action. Every crowd survey gets a "close" at its end and a "nudge" 2–3 days before the close with a warm message of at most ${STUDIO_NUDGE_MESSAGE_MAX} characters.
- Prefer the crowd survey when the audience is a community or the public; a discussion when it is a small deciding group; a live session only when someone can facilitate a room.`,
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
