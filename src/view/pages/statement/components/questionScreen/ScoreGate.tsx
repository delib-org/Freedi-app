import { FC, ReactNode } from 'react';
import { Statement } from '@freedi/shared-types';
import { useAnswerScoreGate } from './useAnswerScoreGate';

interface ScoreGateProps {
	answer: Statement;
	children: ReactNode;
}

/** Renders a score beside an answer only for a viewer the guard lets see it. */
const ScoreGate: FC<ScoreGateProps> = ({ answer, children }) => {
	const { canSee } = useAnswerScoreGate(answer);

	return canSee ? <>{children}</> : null;
};

export default ScoreGate;
