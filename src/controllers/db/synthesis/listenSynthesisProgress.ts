import { doc, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import { logError } from '@/utils/errorHandling';
import type { SynthesisProgress } from './types';

const QUEUE_COLLECTION = 'synthesisQueue';

export type ProgressListener = (progress: SynthesisProgress | null) => void;

/**
 * Subscribe to the synthesisQueue progress doc for a question.
 *
 * The callback fires once with `null` when no run has ever happened on this
 * question (doc absent), then again on each progress update.
 */
export function listenSynthesisProgress(
	questionId: string,
	listener: ProgressListener,
): () => void {
	try {
		const ref = doc(FireStore, QUEUE_COLLECTION, questionId);

		return onSnapshot(
			ref,
			(snap) => {
				if (!snap.exists()) {
					listener(null);

					return;
				}
				listener(snap.data() as SynthesisProgress);
			},
			(error) => {
				logError(error, {
					operation: 'synthesis.listenSynthesisProgress',
					statementId: questionId,
				});
				listener(null);
			},
		);
	} catch (error) {
		logError(error, {
			operation: 'synthesis.listenSynthesisProgress.setup',
			statementId: questionId,
		});

		return () => undefined;
	}
}
