import { GeneratedStatement } from '@/types/massConsensus/massConsensusTypes';
import { Statement } from '@/types/statement/StatementTypes';
import { FC } from 'react';
import styles from './SimilarCard.module.scss';

interface Props {
	statement: Statement | GeneratedStatement;
	isUserStatement?: boolean;
	selected?: boolean;
	handleSelect?: (index: number) => void;
	index?: number;
}

const SimilarCard: FC<Props> = ({
	statement,
	isUserStatement,
	selected,
	handleSelect,
	index,
}) => {
	return (
		<button
			onClick={() => handleSelect(index)}
			className={`${styles['similar-card']} ${isUserStatement ? styles['similar-card--userStatement'] : ''} ${selected ? styles['similar-card--selected'] : ''}`}
		>
			{statement.statement}
		</button>
	);
};

export default SimilarCard;
