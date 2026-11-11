import { createContext } from 'react';
import type { CanSeeScoreInput } from './canSeeScore';

export interface SharedAnswerScoreGate {
	answerId: string;
	input: CanSeeScoreInput;
}

/**
 * Set by an answer card. Everything inside it (the evaluation and its scales)
 * reuses the card's score input instead of working it out again.
 */
export const AnswerScoreGateContext = createContext<SharedAnswerScoreGate | null>(null);
