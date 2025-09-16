import React, { useState, useEffect } from 'react';
import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId, selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './PolarizationIndex.module.scss';
import { Tooltip } from '../../tooltip/Tooltip';
import { PolarizationIndex, UserDemographicQuestion } from 'delib-npm';
import { listenToUserDemographicQuestions } from '@/controllers/db/userDemographic/getUserDemographic';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

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
	const {t} = useUserConfig();
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));
	const userQuestions: UserDemographicQuestion[] = useSelector(selectUserDemographicQuestionsByStatementId(statementId));

	const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });
	const [showGroups, setShowGroups] = useState<string | null>(null);
	const [currentStatementId, setCurrentStatementId] = useState<string | null>(null);
	const points = calculatePositions(polarizationIndexes, boardDimensions, userQuestions);

	//calculate points on the screen
	useEffect(() => {

		let unsubscribe: () => void;
		let userDataQuestionsUnsubscribe: () => void;

		if (statementId) {
			unsubscribe = listenToPolarizationIndex(statementId);
			userDataQuestionsUnsubscribe = listenToUserDemographicQuestions(statementId);
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
		setCurrentStatementId(statementId);
	}

	function tooltipPosition(mad: number, mean: number): "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" {
		if (mad < 0.5) {
			if (mean <= 0) {
				return "top-right";
			} else if (mean > 0) {
				return "top-left";
			}

			return "top";
		} else if (mad >= 0.5) {
			if (mean <= 0) {
				return "bottom-right";
			} else if (mean > 0) {
				return "bottom-left";
			}

			return "bottom";
		}

	}

	return (
		<div>
			<div className={styles.board}>
				<div className={styles["board-inner"]}>{t("Collaboration Index")}</div>
				{points.map((point: Point) => (
					<div className={styles.pointDiv} key={point.statementId} style={{ left: point.position.x + 'px', top: point.position.y + 'px' }}>
						<Tooltip content={`${point.statement} MAD: ${point.overallMAD.toFixed(2)}, Mean: ${point.overallMean.toFixed(2)}, N: ${point.overallN}`} position={tooltipPosition(point.overallMAD, point.overallMean)}>
							<div
								onClick={() => handleShowGroups(point.statementId)}
								className={styles.point}
								style={{ backgroundColor: currentStatementId === point.statementId ? "blue" : "teal", transform: currentStatementId === point.statementId ? "scale(1.2)" : "scale(1)" }} />
						</Tooltip>

					</div>
				))}
				{points.map((point: Point) => (
					<React.Fragment key={point.statementId}>
						{point.axes.map((axis: Axis) => (
							<React.Fragment key={axis.questionId}>
								{axis.groups.map((group: Group, i: number) => (
									<div
										key={`${point.statementId}-${axis.questionId}-${group.option.option}-${i}`}
										className={styles.axisGroup}
										style={{
											left: showGroups === point.statementId ? group.position.x + 'px' : point.position.x + 10 + 'px',
											top: showGroups === point.statementId ? group.position.y + 'px' : point.position.y + 10 + 'px',
											opacity: showGroups === point.statementId ? 1 : 0
										}}>
										<Tooltip content={`${group.option.option} MAD: ${group.mad.toFixed(2)}, Mean: ${group.mean.toFixed(2)}, N: ${group.n}`} position={tooltipPosition(group.mad, group.mean)}>
											<div className={styles.axisGroupPoint} style={{ backgroundColor: group.option.color }} />
										</Tooltip>
									</div>
								))}
							</React.Fragment>
						))}
					</React.Fragment>
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

function calculatePositions(points: PolarizationIndex[], boardDimensions: { width: number; height: number }, userQuestions: UserDemographicQuestion[]): Point[] {
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
