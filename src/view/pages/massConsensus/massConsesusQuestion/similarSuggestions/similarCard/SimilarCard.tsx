import { GeneratedStatement, Statement } from 'delib-npm';

import { FC } from 'react';
import styles from './SimilarCard.module.scss';

interface Props {
	statement: Statement | GeneratedStatement;
	isUserStatement?: boolean;
	selected?: boolean;
	handleSelect?: (id: string) => void;
}

const SimilarCard: FC<Props> = ({
	statement,
	isUserStatement,
	selected,
	handleSelect
}) => {
	return (
		<button
			onClick={() => handleSelect(statement.statementId || statement.statement)}
			className={`${styles['similar-card']} ${isUserStatement ? styles['similar-card--userStatement'] : ''} ${selected ? styles['similar-card--selected'] : ''}`}
		>
			{statement.statement}
		</button>
	);
};

export default SimilarCard;
