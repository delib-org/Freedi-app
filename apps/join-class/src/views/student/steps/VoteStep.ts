// Slot owned by lane C3 (vote). The body is a lazy chunk (c3/bodies.ts).
import { lazyStep } from '../c3/lazyStep';

export const VoteStep = lazyStep('vote', () => import('../c3/bodies').then((mod) => mod.VoteBody));
