// Slot of "כל ההצעות" (IA 19). The body is its own lazy chunk.
import { lazyStep } from '../c3/lazyStep';

export const AllProposalsStep = lazyStep('allProposals', () =>
	import('../c3/AllProposalsScreen').then((mod) => mod.AllProposalsScreen),
);
