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

	it('renders the engine cards without app names', () => {
		expect(prompt).toContain('Crowd survey');
		expect(prompt).toContain('Live session');
		expect(prompt).toContain('Discussion');
		expect(prompt).not.toMatch(/Mass Consensus|Join app|Freedi/);
	});

	it('renders the top-3 patterns with the best match first', () => {
		const bridgeIndex = prompt.indexOf('patternId: "bridgeContestedIssue"');
		expect(bridgeIndex).toBeGreaterThan(0);
		expect(prompt).toContain('Bridge a contested issue');
		expect((prompt.match(/patternId: "/g) ?? []).length).toBe(3);
		expect(prompt).toContain('Prefer one of these unless the situation clearly needs otherwise');
	});

	it('includes the guardrails and the JSON contract', () => {
		expect(prompt).toContain('COMPLETE plan JSON');
		expect(prompt).toContain('"readyToBuild": boolean');
		expect(prompt).toContain('"scheduledActions"');
		expect(prompt).toContain('ISO-8601 with offset');
		expect(prompt).toContain(`${STUDIO_NUDGE_MESSAGE_MAX} characters`);
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

	it('asks at most two fields when clarifying', () => {
		const ctx = makeCtx();
		const text = renderTurnContext(ctx, nextMove(ctx));
		expect(text).toContain('Ask at most 2 short clarifying questions');
		expect(text).toContain('decisionType —');
		expect(text).toContain('audienceSize —');
		expect(text).not.toContain('polarization —');
		expect(text).toContain('[Current plan JSON — keep complete when revising]\nnone yet');
	});
});
