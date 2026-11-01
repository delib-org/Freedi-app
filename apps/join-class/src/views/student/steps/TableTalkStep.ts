// Slot owned by lane C3 (table talk). The body is a lazy chunk (c3/bodies.ts).
import { lazyStep } from '../c3/lazyStep';

export const TableTalkStep = lazyStep('tableTalk', () =>
	import('../c3/bodies').then((mod) => mod.TableTalkBody),
);
