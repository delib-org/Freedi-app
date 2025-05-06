import React, { FC, SetStateAction } from 'react';

// Third Party Imports

// Assets
import styles from './Thumb.module.scss';
import FrownIcon from '@/assets/icons/frownIcon.svg?react';
import SmileIcon from '@/assets/icons/smileIcon.svg?react';

// Statement helpers
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { Statement } from 'delib-npm';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

interface ThumbProps {
	evaluation: number;
	upDown: 'up' | 'down';
	statement: Statement;
	setConVote: React.Dispatch<SetStateAction<number>>;
	setProVote: React.Dispatch<SetStateAction<number>>;
}

const Thumb: FC<ThumbProps> = ({
	evaluation,
	upDown,
	statement,
	setConVote,
	setProVote,
}) => {
	const { creator } = useAuthentication();

	const handleVote = (isUp: boolean) => {
		if (isUp) {
			if (evaluation > 0) {
				// Set evaluation in DB
				setEvaluationToDB(statement, creator, 0);

				// if evaluation is 0 user didn't vote yet so don't do anything
				if (evaluation === 0) return;

				// Set local state
				setProVote((prev) => prev - 1);
			} else {
				setEvaluationToDB(statement, creator, 1);
				setProVote((prev) => prev + 1);
				if (evaluation === 0) return;
				setConVote((prev) => prev - 1);
			}
		} else {
			if (evaluation < 0) {
				setEvaluationToDB(statement, creator, 0);

				if (evaluation === 0) return;
				setConVote((prev) => prev - 1);
			} else {
				setEvaluationToDB(statement, creator, -1);
				setConVote((prev) => prev + 1);
				if (evaluation === 0) return;
				setProVote((prev) => prev - 1);
			}
		}
	};

	const isSmileActive = evaluation > 0;
	const isFrownActive = evaluation < 0;
	const isUpVote = upDown === 'up';
	const isActive = isUpVote ? isSmileActive : isFrownActive;

	return (
		<button
			className={`${styles.thumb} ${isActive ? '' : styles.inactive}`}
			onClick={() => handleVote(isUpVote)}
		>
			{isUpVote ? <SmileIcon /> : <FrownIcon />}
		</button>
	);
};

export default Thumb;
