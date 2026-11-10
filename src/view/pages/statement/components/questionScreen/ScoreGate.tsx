import { FC, ReactNode } from 'react';
import { Statement } from '@freedi/shared-types';
import { useAnswerScoreGate } from './useAnswerScoreGate';

interface ScoreGateProps {
	answer: Statement;
	/** The caller knows this viewer is a host, even before the question is in the store. */
	isHost?: boolean;
	children: ReactNode;
}

/** Renders a score beside an answer only for a viewer the guard lets see it. */
const ScoreGate: FC<ScoreGateProps> = ({ answer, isHost = false, children }) => {
	const { canSee } = useAnswerScoreGate(answer);

	return canSee || isHost ? <>{children}</> : null;
};

export default ScoreGate;
