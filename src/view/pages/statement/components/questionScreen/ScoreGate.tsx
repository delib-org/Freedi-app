import { FC, ReactNode } from 'react';
import { Statement } from '@freedi/shared-types';
import { useAnswerScoreGate } from './useAnswerScoreGate';

interface ScoreGateProps {
	answer: Statement;
	/** The caller knows this viewer is a host; the results-off rule still applies to them. */
	isHost?: boolean;
	children: ReactNode;
}

/** Renders a score beside an answer only for a viewer the guard lets see it. */
const ScoreGate: FC<ScoreGateProps> = ({ answer, isHost = false, children }) => {
	const { canSee } = useAnswerScoreGate(answer, undefined, { isHost });

	return canSee ? <>{children}</> : null;
};

export default ScoreGate;
