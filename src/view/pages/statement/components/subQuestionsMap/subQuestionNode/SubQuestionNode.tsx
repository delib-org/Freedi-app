import { useNavigate, useParams } from 'react-router';
import styles from './subQuestionNode.module.scss';
import ArrowLeft from '@/assets/icons/backToMenuArrow.svg?react';
import { FC, useState } from 'react';
import { Statement } from 'delib-npm';

interface SubQuestionNodeProps {
	statement: Statement;
	runTimes: number;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({ statement, runTimes }) => {
	const navigate = useNavigate();
	const { statementId } = useParams();
	const [clicked, setClicked] = useState(false);
	const handleClick = () => {
		setClicked(true);
		setTimeout(() => {
			setClicked(false);
			navigate(`/statement/${statement.statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}, 302);
	};
	const isInStatement = statement.statementId === statementId;
	const getStyle = () => {
		if (runTimes === 0) return '';
		if (runTimes === 1) return styles.size1;
		if (runTimes === 2) return styles.size2;

		return styles.size3;
	};

	return (
		<div className={styles.SubQuestionNodeContainer}>
			<div className={getStyle()}></div>
			<div
				className={`${styles.node} ${isInStatement ? styles.green : ''}`}
			>
				<h3>{statement.statement}</h3>
				{!isInStatement && (
					<button
						className={clicked ? styles.animate : ''}
						onClick={handleClick}
					>
						<ArrowLeft></ArrowLeft>
					</button>
				)}
			</div>
		</div>
	);
};

export default SubQuestionNode;
