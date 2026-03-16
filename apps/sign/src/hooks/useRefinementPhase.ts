/**
 * useRefinementPhase Hook
 *
 * Real-time Firestore listener for a paragraph's refinement state.
 * Updates instantly when admin changes phase.
 */

'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

export interface RefinementPhaseState {
	phase: 'open' | 'refinement';
	transitionedAt?: number;
	transitionedBy?: string;
	consensusThreshold?: number;
}

const DEFAULT_STATE: RefinementPhaseState = { phase: 'open' };

/**
 * Hook to listen to a paragraph's refinement phase in real-time
 *
 * @param paragraphId - The official paragraph ID
 * @param enabled - Whether to enable the listener (default: true)
 * @returns Refinement phase state
 */
export function useRefinementPhase(
	paragraphId: string | null,
	enabled: boolean = true
): { refinement: RefinementPhaseState; isLoading: boolean } {
	const [refinement, setRefinement] = useState<RefinementPhaseState>(DEFAULT_STATE);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!enabled || !paragraphId) {
			setRefinement(DEFAULT_STATE);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);

		const firestore = getFirebaseFirestore();
		const statementRef = doc(firestore, Collections.statements, paragraphId);

		const unsubscribe = onSnapshot(
			statementRef,
			(docSnap) => {
				if (docSnap.exists()) {
					const data = docSnap.data() as Statement;
					const docRefinement = (data.doc as Record<string, unknown>)?.refinement as RefinementPhaseState | undefined;
					setRefinement(docRefinement || DEFAULT_STATE);
				} else {
					setRefinement(DEFAULT_STATE);
				}
				setIsLoading(false);
			},
			(error) => {
				logError(error, {
					operation: 'hooks.useRefinementPhase',
					paragraphId,
				});
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [paragraphId, enabled]);

	return { refinement, isLoading };
}
