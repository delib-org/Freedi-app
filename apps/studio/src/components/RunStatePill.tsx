import type { ActivityRunState } from '@freedi/event-core';
import { StatusPill } from '@/components/atomic/atoms/Tag';

/**
 * Compatibility shim — the run-state pill now lives in the atomic system as
 * `StatusPill` (components/atomic/atoms/Tag). Existing call sites keep the
 * `state` prop; new code should import `StatusPill` directly.
 */
export { StatusPill };

export default function RunStatePill({ state }: { state: ActivityRunState }) {
	return <StatusPill status={state} />;
}
