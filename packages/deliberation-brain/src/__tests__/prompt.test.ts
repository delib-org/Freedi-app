import { describe, expect, it } from 'vitest';
import { STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';
import { nextMove } from '../policy';
import { renderSystemPrompt, renderTurnContext } from '../prompt';
import { makeCtx, plan } from './helpers';

describe('renderSystemPrompt', () => {
	const ctx = makeCtx({
		languageName: 'Hebrew',
		todayIso: '2026-08-26',
		diagnosis: { polarization: 'contested', decisionType: 'bridgeConflict' },
	});
	const prompt = renderSystemPrompt(ctx);

	it('carries the language, date, timezone and organization', () => {
		expect(prompt).toContain('in Hebrew');
		expect(prompt).toContain('Today is 2026-08-26 (Asia/Jerusalem)');
		expect(prompt).toContain('Northern District Council');
	});

	it('renders the engine cards and the Draft step without app names', () => {
		expect(prompt).toContain('Document');
		expect(prompt).toContain('(type: "document")');
		expect(prompt).toContain('Crowd survey');
		expect(prompt).toContain('Live session');
		expect(prompt).toContain('Discussion');
		expect(prompt).toContain('The Draft step');
		expect(prompt).toContain('Nothing reaches the public un-reviewed');
		expect(prompt).toContain('never propose it');
		expect(prompt).not.toMatch(/Mass Consensus|Join app|Freedi|Agora|Sign app/);
	});

	it('states the grammar, the entry rule and the eight rules', () => {
		expect(prompt).toContain('GENERATE (crowd survey) → DRAFT (draft action) → COMMENT (document) → CONVERGE');
		expect(prompt).toContain('1. ENTRY RULE');
		expect(prompt).toContain('"is there something written already?"');
		expect(prompt).toContain('3. Comment before converging');
		expect(prompt).toContain('6. Close with ratification');
		expect(prompt).toContain('8. Iterate, don\'t lengthen');
		expect(prompt).toContain('a vote in Main / the assembly');
	});

	it('renders the top-3 patterns with the best match first, including draft sources', () => {
		const bridgeIndex = prompt.indexOf('patternId: "bridgeContestedIssue"');
		expect(bridgeIndex).toBeGreaterThan(0);
		expect(prompt).toContain('Bridge a contested issue');
		expect((prompt.match(/patternId: "/g) ?? []).length).toBe(3);
		expect(prompt).toContain('Prefer one of these unless the situation clearly needs otherwise');
		expect(prompt).toContain('[comment] Document:');
		expect(prompt).toContain('drafted from step 1');
	});

	it('includes the guardrails and the JSON contract with the draft additions', () => {
		expect(prompt).toContain('COMPLETE plan JSON');
		expect(prompt).toContain('"readyToBuild": boolean');
		expect(prompt).toContain('"scheduledActions"');
		expect(prompt).toContain('ISO-8601 with offset');
		expect(prompt).toContain(`${STUDIO_NUDGE_MESSAGE_MAX} characters`);
		expect(prompt).toContain('"hasDraft": "text" | "material" | "nothing"');
		expect(prompt).toContain('"draftFrom": string[] | null');
		expect(prompt).toContain('"draftCutoff": null | {');
		expect(prompt).toContain('"draftIntent": string | null');
		expect(prompt).toContain('| "draft"');
		expect(prompt).toContain('"comment" | "write"');
		expect(prompt).not.toContain('## Existing question');
	});

	it('adds the existing-question block in existing mode', () => {
		const existing = renderSystemPrompt(
			makeCtx({
				mode: 'existing',
				existingActivities: [{ statementId: 'st1', type: 'discussion', title: 'What is our goal?', order: 0 }],
			}),
		);
		expect(existing).toContain('## Existing question');
		expect(existing).toContain('statementId "st1"');
		expect(existing).toContain('change "keep"');
		expect(existing).toContain('Existing documents keep their id');
		expect(existing).toContain('draftFrom lists the existing statementIds');
	});
});

describe('renderTurnContext', () => {
	it('renders instruction, diagnosis, plan and problems sections', () => {
		const ctx = makeCtx({ userTurns: 4, currentPlan: plan(), problems: ['Nudge without message'], diagnosis: { decisionType: 'choose' } });
		const text = renderTurnContext(ctx, nextMove(ctx));
		expect(text).toContain('[Dialogue instruction]');
		expect(text).toContain('fix every listed problem');
		expect(text).toContain('[Current diagnosis JSON]\n{"decisionType":"choose"}');
		expect(text).toContain('[Current plan JSON — keep complete when revising]\n{"mainQuestion"');
		expect(text).toContain('[Problems to fix]\n- Nudge without message');
	});

	it('asks hasDraft first, at most two fields, when clarifying', () => {
		const ctx = makeCtx();
		const text = renderTurnContext(ctx, nextMove(ctx));
		expect(text).toContain('Ask at most 2 short clarifying questions');
		expect(text).toContain('hasDraft — whether something is written already');
		expect(text).toContain('decisionType —');
		expect(text).not.toContain('audienceSize —');
		expect(text).toContain('[Current plan JSON — keep complete when revising]\nnone yet');
	});
});
