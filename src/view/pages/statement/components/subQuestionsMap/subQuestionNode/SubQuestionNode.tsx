import { useNavigate, useParams } from 'react-router';
import styles from './subQuestionNode.module.scss';
import ArrowLeft from '@/assets/icons/backToMenuArrow.svg?react';
import { FC, useState } from 'react';
import { Statement } from 'delib-npm';

interface SubQuestionNodeProps {
	statement: Statement;
	runTimes: number;
	last?: boolean;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
	statement,
	runTimes = -1,
	last = false,
}) => {
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

	return (
		<div className={styles.SubQuestionNodeContainer}>
			<div
				className={`${styles.node} ${isInStatement ? styles.green : ''}${runTimes < 0 ? styles.group : ''}`}
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
			<div
				className={!last ? styles.borderRight : styles.borderRightEmpty}
				style={{ marginLeft: `${runTimes}rem` }}
			>
				{runTimes > 0 && <div className={styles.borderTop}></div>}
			</div>
		</div>
	);
};

export default SubQuestionNode;
