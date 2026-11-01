// Slot owned by lane C3 (summary). The body is a lazy chunk (c3/bodies.ts).
import { lazyStep } from '../c3/lazyStep';

export const SummaryStep = lazyStep('summary', () =>
	import('../c3/bodies').then((mod) => mod.SummaryBody),
);
