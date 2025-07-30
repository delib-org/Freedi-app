import { useNavigate, useParams } from 'react-router';
import styles from './subQuestionNode.module.scss';
import ArrowLeft from '@/assets/icons/backToMenuArrow.svg?react';
import { FC, useState } from 'react';
import { Statement } from 'delib-npm';

interface SubQuestionNodeProps {
	statement: Statement;
	runTimes: number;
	last?: boolean;
	hasChildren?: boolean;
	height?: number;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
	statement,
	runTimes = -1,
	height = 0,
	last = false,
	hasChildren = false,
}) => {
	const topStatement = runTimes <= 1;
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

	const styleGraph = () => {
		const classNames = [styles.borderDefault];

		if (
			((!last && statement.topParentId !== statement.parentId) ||
				hasChildren) &&
			height < 1
		)
			classNames.push(styles.borderRight);
		if (hasChildren && height < 1) classNames.push(styles.borderBottom);
		if (statement.topParentId === statement.parentId)
			classNames.push(styles.borderTop);

		return classNames.join(' ');
	};

	return (
		<div className={styles.SubQuestionNodeContainer}>
			<div
				className={`${styles.node} ${isInStatement ? styles.green : ''}${runTimes <= 1 ? styles.group : ''}`}
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

			{
				<div
					className={styleGraph()}
					style={{ marginLeft: `${runTimes}rem` }}
				>
					{topStatement && (
						<div
							className={styles.borderRightTop}
							style={{
								marginLeft: `${runTimes}rem`,
								height: `${height * 4.6}rem`,
							}}
						></div>
					)}
					<div className={styles.blueDot}>●</div>
				</div>
			}
		</div>
	);
};

export default SubQuestionNode;
