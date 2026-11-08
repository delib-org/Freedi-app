// The one judge prompt, identical for method A (full list) and method B
// (retrieved top-k): only the candidate list differs. Derived from the
// 2026-09-04 baseline's l2StepPrompt (llmBaseline.mjs:285-315) and the
// production equivalence rubric (functions/src/services/semantic-equivalence-service.ts:36-55),
// tightened to the protocol's action/direction/scope/intervention rule.
// Labels never enter this module: it sees ids and texts only.

export const PROMPT_VERSION = 'judge.v1';

export const SYSTEM_PROMPT =
	'You compare citizen proposals for a deliberation platform. Output only JSON that matches the required schema.';

export const RULE_TEXT = [
	'Rule: the new proposal is the SAME as an existing proposal only if both agree on the action, its direction, its scope, and the intervention, so that a participant could not reasonably support one while rejecting the other.',
	'Sharing a topic is not enough. A different action, the opposite direction, a different population or place, a different scope, or an added or removed condition means NOT the same. Different wording alone does not matter.',
].join('\n');

export const TASK_TEXT =
	'Task: if at least one existing proposal is the SAME as the new proposal, answer decision "same" and give the id of one such proposal as target_id. Otherwise answer decision "none" with target_id null. When in doubt, answer "none". Keep reason to one short sentence.';

export const RESPONSE_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'equivalence_decision',
		strict: true,
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['decision', 'target_id', 'reason'],
			properties: {
				decision: { type: 'string', enum: ['same', 'none'] },
				target_id: { type: ['string', 'null'] },
				reason: { type: 'string' },
			},
		},
	},
};

export function renderUserPrompt({ question, candidates, query }) {
	const list = candidates.map((c) => `[${c.id}] ${c.text}`).join('\n');

	return `Question asked to residents: "${question}"

${RULE_TEXT}

Existing proposals (id in brackets, then the text verbatim):
${list}

New proposal:
"${query}"

${TASK_TEXT}`;
}

export function buildJudgeBody({ question, candidates, query, judge }) {
	const body = {
		model: judge.model,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: renderUserPrompt({ question, candidates, query }) },
		],
		response_format: RESPONSE_FORMAT,
		max_completion_tokens: judge.maxCompletionTokens,
	};
	if (judge.reasoningEffort) body.reasoning_effort = judge.reasoningEffort;

	return body;
}

/** Human-readable template for frozen/prompts/judge.v1.txt. */
export function templateText() {
	return [
		`# ${PROMPT_VERSION}`,
		'## system',
		SYSTEM_PROMPT,
		'## user',
		renderUserPrompt({ question: '{QUESTION}', candidates: [{ id: '{ID}', text: '{TEXT}' }, { id: '…', text: '…' }], query: '{NEW_PROPOSAL}' }),
		'## response_format',
		JSON.stringify(RESPONSE_FORMAT, null, 2),
		'',
	].join('\n');
}
