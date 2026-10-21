// Slot owned by lane C3 (proposals). The body is a lazy chunk (c3/bodies.ts).
import { lazyStep } from '../c3/lazyStep';

export const ProposalsStep = lazyStep('proposals', () =>
	import('../c3/bodies').then((mod) => mod.ProposalsBody),
);
