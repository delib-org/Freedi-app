import { useNavigate, useParams } from 'react-router';
import styles from './subQuestionNode.module.scss';
import ArrowLeft from '@/assets/icons/backToMenuArrow.svg?react';
import { FC, useState } from 'react';
import { Statement } from 'delib-npm';

interface SubQuestionNodeProps {
	statement: Statement;
	depth: number;
	last?: boolean;
	hasChildren?: boolean;
	height?: number;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
	statement,
	depth = -1,
	height = 0,
	last = false,
	hasChildren = false,
}) => {
	const topStatement = depth <= 1;
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
	const styleMargin = 4.6;
	const marginLeft = `${depth}rem`;
	const styleGraph = () => {
		const classNames = [styles.borderDefault];

		
		if (hasChildren && height < 1) classNames.push(styles.borderBottom);
		classNames.push(styles.borderTop);

		return classNames.join(' ');
	};

	return (
		<div className={styles.SubQuestionNodeContainer}>
			<div
				className={`${styles.node} ${isInStatement ? styles.green : ''} ${depth <= 1 && !isInStatement ? styles.group : ''}`}
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
					style={{ marginLeft: marginLeft }}
				>
					{(topStatement || height > 0) && (
						<div
							className={styles.borderRightTop}
							style={{
								marginLeft: `${depth}rem`,
								height: `${height * styleMargin}rem`,
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
