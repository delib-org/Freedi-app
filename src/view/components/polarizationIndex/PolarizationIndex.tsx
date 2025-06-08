import React, { useState, useEffect } from 'react';
import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId, selectUserQuestionsByStatementId } from '@/redux/userData/userDataSlice';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './PolarizationIndex.module.scss';
import { Tooltip } from '../tooltip/Tooltip';
import { PolarizationIndex, UserQuestion } from 'delib-npm';
import { listenToUserQuestions } from '@/controllers/db/userData/getUserData';

interface Group {
	option: {
		option: string;
		color?: string; // Optional color property for group options
	};
	mean: number;
	n: number;
	mad: number;
	position?: {
		x: number;
		y: number;
	}
}
interface Axis {
	questionId: string;
	question: string;
	groupsMAD: number;
	groups: Group[];
}

interface Point {
	statementId: string;
	statement: string;
	overallMAD: number;
	overallMean: number;
	overallN: number;
	axes: Axis[];
	color: string;
	position?: {
		x: number;
		y: number;
	}
}

const PolarizationIndexComp = () => {
	const { statementId } = useParams();
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));
	const userQuestions: UserQuestion[] = useSelector(selectUserQuestionsByStatementId(statementId));

	const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });
	const [showGroups, setShowGroups] = useState<string | null>(null);
	const points = calculatePositions(polarizationIndexes, boardDimensions, userQuestions);
	console.log(points)

	//calculate points on the screen
	useEffect(() => {

		let unsubscribe: () => void;
		let userDataQuestionsUnsubscribe: () => void;

		if (statementId) {
			unsubscribe = listenToPolarizationIndex(statementId);
			userDataQuestionsUnsubscribe = listenToUserQuestions(statementId);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
			if (userDataQuestionsUnsubscribe) {
				userDataQuestionsUnsubscribe();
			}
		};
	}, [statementId]);

	useEffect(() => {
		const boardElement = document.querySelector(`.${styles.board}`);
		if (boardElement) {
			const updateDimensions = () => {
				setBoardDimensions({
					width: boardElement.clientWidth,
					height: boardElement.clientHeight
				});
			};

			updateDimensions();
			window.addEventListener('resize', updateDimensions);

			return () => {
				window.removeEventListener('resize', updateDimensions);
			};
		}
	}, []);

	function handleShowGroups(statementId: string) {
		setShowGroups(statementId);
	}

	return (
		<div>
			<div className={styles.board}>
				{points.map((point: Point) => (
					<div className={styles.pointDiv} key={point.statementId} style={{ left: point.position.x + 'px', top: point.position.y + 'px' }}>
						<Tooltip content={`${point.statement} MAD: ${point.overallMAD.toFixed(2)}, Mean: ${point.overallMean.toFixed(2)}, N: ${point.overallN}`} position="top">
							<div onClick={() => handleShowGroups(point.statementId)} className={styles.point} style={{ backgroundColor: "blue" }} />
						</Tooltip>

					</div>
				))}
				{points.map((point: Point) => (
					<>
						{point.axes.map((axis: Axis) => (
							<>
								{axis.groups.map((group: Group, i: number) => (
									<div
										key={group.option.option + i}
										className={styles.axisGroup}
										style={{
											left: showGroups === point.statementId ? group.position.x + 'px' : point.position.x + 10 + 'px',
											top: showGroups === point.statementId ? group.position.y + 'px' : point.position.y + 10 + 'px',
											opacity: showGroups === point.statementId ? 1 : 0
										}}>
										<Tooltip content={`${group.option.option} MAD: ${group.mad.toFixed(2)}, Mean: ${group.mean.toFixed(2)}, N: ${group.n}`} position="top">
											<div className={styles.axisGroupPoint} style={{ backgroundColor: group.option.color }} />
										</Tooltip>
									</div>
								))}
							</>
						))}
					</>
				))}
			</div>
		</div >
	);
}

export default PolarizationIndexComp;

function calculatePosition(mad: number, mean: number, boardDimensions: { width: number; height: number }): { x: number; y: number } {
	try {
		if (mad === undefined || mean === undefined || mad === null || mean === null) {
			throw new Error("MAD and Mean must be defined");
		}
		if (mad < 0 || mad > 1) {
			throw new Error("MAD must be between 0 and 1");
		}
		if (mean < -1 || mean > 1) {
			throw new Error("Mean must be between -1 and 1");
		}
		const y = (1 - mad) * boardDimensions.height;
		const x = (mean + 1) * boardDimensions.width / 2;

		return { x, y };
	} catch (error) {
		console.error("Error calculating points:", error);

		return { x: 0, y: 0 };
	}
}

function calculatePositions(points: PolarizationIndex[], boardDimensions: { width: number; height: number }, userQuestions: UserQuestion[]): Point[] {
	try {

		return points.map(point => {
			try {
				const { statementId, statement, overallMAD, overallMean, overallN, axes, color } = point;
				if (!statementId) throw new Error(`Statement ID is required in the point "${point.statement}"`);
				if (!statement) throw new Error(`Statement is required in the point "${point.statement}"`);
				if (overallMAD == undefined || overallMAD === null) throw new Error(`Overall MAD is required in the point "${point.statement}"`);
				if (overallMean == undefined || overallMean === null) throw new Error(`Overall Mean is required in the point "${point.statement}"`);
				if (!axes || !Array.isArray(axes)) throw new Error(`Axes must be an array in the point "${point.statement}"`);
				if (axes.length === 0) throw new Error(`Axes cannot be empty in the point "${point.statement}"`);
				if (overallN === undefined || overallN < 0) throw new Error(`Overall N must be a non-negative number in the point "${point.statement}"`);

				if (!color || typeof color !== 'string') throw new Error(`Color must be a valid string in the point "${point.statement}"`);

				const position = calculatePosition(overallMAD, overallMean, boardDimensions);

				return {
					statementId,
					statement,
					overallMAD,
					overallMean,
					overallN,
					position,
					color: color,
					axes: axes.map(axis => ({
						questionId: axis.axId,
						question: axis.question,
						groupsMAD: axis.groupsMAD,
						groups: axis.groups.map((group: Group) => {
							const { options } = userQuestions.find(q => q.userQuestionId === axis.axId) || { options: [] };
							const color = options.find(opt => opt.option === group.option.option)?.color || 'red'; // Default to red if no color is found

							return {
								option: {
									option: group.option.option,
									color: color, // Use the color from user questions or default to red
								},
								mean: group.mean,
								n: group.n,
								mad: group.mad,
								position: calculatePosition(group.mad, group.mean, boardDimensions),
							};
						}),
					})),

				};
			} catch (error) {
				console.error("Error calculating point:", error);
			}
		});
	} catch (error) {
		console.error("Error calculating positions:", error);

		return [];

	}

}
