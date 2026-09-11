// Output validation. An invalid response is a FAILED decision, never a
// semantic "none".

export const FAILURES = ['truncated', 'refusal', 'empty', 'unparseable', 'schema', 'inconsistent', 'target-not-supplied'];

export function validateDecision({ content, finishReason, refusal }, suppliedIds) {
	const fail = (failure, extra = {}) => ({ valid: false, failure, decision: null, targetId: null, reason: null, ...extra });
	if (finishReason === 'length') return fail('truncated');
	if (refusal) return fail('refusal', { detail: String(refusal).slice(0, 300) });
	if (typeof content !== 'string' || !content.trim()) return fail('empty');
	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch {
		return fail('unparseable');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('schema');
	const keys = Object.keys(parsed).sort().join(',');
	if (keys !== 'decision,reason,target_id') return fail('schema', { detail: keys });
	const { decision, target_id: targetId, reason } = parsed;
	if (decision !== 'same' && decision !== 'none') return fail('schema', { detail: `decision=${decision}` });
	if (typeof reason !== 'string') return fail('schema', { detail: 'reason' });
	if (decision === 'none' && targetId !== null) return fail('inconsistent', { detail: 'none with target', rawTarget: targetId });
	if (decision === 'same' && (typeof targetId !== 'string' || !targetId)) return fail('inconsistent', { detail: 'same without target' });
	// Strict membership: the id must be exactly one of the supplied ids.
	if (decision === 'same' && !suppliedIds.has(targetId)) return fail('target-not-supplied', { rawTarget: targetId });

	return { valid: true, failure: null, decision, targetId: decision === 'same' ? targetId : null, reason };
}
