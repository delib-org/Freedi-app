import React, { useState, useEffect } from 'react';
import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId, selectEffectiveQuestions } from '@/redux/userDemographic/userDemographicSlice';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './PolarizationIndex.module.scss';
import { Tooltip } from '../../tooltip/Tooltip';
import { PolarizationIndex, UserDemographicQuestion } from '@freedi/shared-types';
import { listenToUserDemographicQuestions, listenToGroupDemographicQuestions } from '@/controllers/db/userDemographic/getUserDemographic';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * Converts agreement level (-1 to +1) to a color on red-yellow-green gradient
 * -1 = red (disagree), 0 = yellow (neutral), +1 = green (agree)
 */
function getAgreementColor(mean: number): string {
	// Clamp mean to [-1, 1]
	const clampedMean = Math.max(-1, Math.min(1, mean));

	// Red: rgb(220, 53, 69) - #dc3545
	// Yellow: rgb(255, 193, 7) - #ffc107
	// Green: rgb(40, 167, 69) - #28a745

	if (clampedMean <= 0) {
		// Interpolate from red (-1) to yellow (0)
		const t = (clampedMean + 1); // 0 to 1
		const r = Math.round(220 + (255 - 220) * t);
		const g = Math.round(53 + (193 - 53) * t);
		const b = Math.round(69 + (7 - 69) * t);

		return `rgb(${r}, ${g}, ${b})`;
	} else {
		// Interpolate from yellow (0) to green (1)
		const t = clampedMean; // 0 to 1
		const r = Math.round(255 + (40 - 255) * t);
		const g = Math.round(193 + (167 - 193) * t);
		const b = Math.round(7 + (69 - 7) * t);

		return `rgb(${r}, ${g}, ${b})`;
	}
}

interface Group {
	option: {
		option: string;
		color?: string;
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
	const { t } = useTranslation();
	const statement = useSelector(statementSelector(statementId));
	const topParentId = statement?.topParentId || statementId;
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));
	const userQuestions: UserDemographicQuestion[] = useSelector(selectEffectiveQuestions(statementId || '', topParentId || ''));

	const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });
	const [showGroups, setShowGroups] = useState<string | null>(null);
	const [currentStatementId, setCurrentStatementId] = useState<string | null>(null);
	const points = calculatePositions(polarizationIndexes, boardDimensions, userQuestions);

	useEffect(() => {
		let unsubscribe: () => void;
		let userDataQuestionsUnsubscribe: () => void;
		let groupDemographicsUnsubscribe: () => void;

		if (statementId) {
			unsubscribe = listenToPolarizationIndex(statementId);
			userDataQuestionsUnsubscribe = listenToUserDemographicQuestions(statementId);
		}

		if (topParentId) {
			groupDemographicsUnsubscribe = listenToGroupDemographicQuestions(topParentId);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
			if (userDataQuestionsUnsubscribe) {
				userDataQuestionsUnsubscribe();
			}
			if (groupDemographicsUnsubscribe) {
				groupDemographicsUnsubscribe();
			}
		};
	}, [statementId, topParentId]);

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

		return "top";
	}

	return (
		<div className={styles.collaborationIndex}>
			{/* Header */}
			<div className={styles.header}>
				<h2 className={styles.header__title}>{t("Collaboration Index")}</h2>
				<p className={styles.header__subtitle}>{t("How people feel about each topic")}</p>
			</div>

			{/* Chart Container with Axes */}
			<div className={styles.chartContainer}>
				{/* Y-Axis */}
				<div className={styles.yAxis}>
					<span className={styles.yAxis__label}>{t("Polarization")}</span>
					<div className={styles.yAxis__markers}>
						<span className={`${styles.yAxis__marker} ${styles['yAxis__marker--high']}`}>
							{t("Divided")}
						</span>
						<span className={styles.yAxis__marker}>|</span>
						<span className={`${styles.yAxis__marker} ${styles['yAxis__marker--low']}`}>
							{t("United")}
						</span>
					</div>
				</div>

				{/* Main Board */}
				<div className={styles.boardWrapper}>
					<div className={styles.board}>
						{/* Background with gradient zones */}
						<div className={styles.boardBackground} />

						{/* Center line */}
						<div className={styles.centerLine} />

						{/* Zone indicators */}
						<div className={styles.zones}>
							{/* Consensus zone - bottom right */}
							<div className={`${styles.zone} ${styles['zone--consensus']}`}>
								<span className={styles.zone__icon} role="img" aria-label="consensus">&#10004;</span>
								<span className={styles.zone__label}>{t("Consensus")}</span>
							</div>

							{/* Rejection zone - bottom left */}
							<div className={`${styles.zone} ${styles['zone--rejection']}`}>
								<span className={styles.zone__icon} role="img" aria-label="rejection">&#10006;</span>
								<span className={styles.zone__label}>{t("Rejection")}</span>
							</div>

							{/* Polarized zone - top center */}
							<div className={`${styles.zone} ${styles['zone--polarized']}`}>
								<span className={styles.zone__icon} role="img" aria-label="polarized">&#8646;</span>
								<span className={styles.zone__label}>{t("Polarized")}</span>
							</div>

							{/* Neutral zone - bottom center */}
							<div className={`${styles.zone} ${styles['zone--neutral']}`}>
								<span className={styles.zone__icon} role="img" aria-label="neutral">&#8596;</span>
								<span className={styles.zone__label}>{t("Neutral")}</span>
							</div>
						</div>

						{/* Data points */}
						{points.filter(point => point.position).map((point: Point) => {
							const isSelected = currentStatementId === point.statementId;

							return (
								<div
									className={styles.pointDiv}
									key={point.statementId}
									style={{
										left: point.position?.x ? point.position.x + 'px' : '0px',
										top: point.position?.y ? point.position.y + 'px' : '0px'
									}}
								>
									<Tooltip
										content={`${point.statement} MAD: ${point.overallMAD.toFixed(2)}, Mean: ${point.overallMean.toFixed(2)}, N: ${point.overallN}`}
										position={tooltipPosition(point.overallMAD, point.overallMean)}
									>
										<div
											onClick={() => handleShowGroups(point.statementId)}
											className={`${styles.point} ${isSelected ? styles['point--selected'] : ''}`}
											style={{
												backgroundColor: getAgreementColor(point.overallMean),
											}}
										/>
									</Tooltip>
								</div>
							);
						})}

						{/* Demographic group points */}
						{points.map((point: Point) => (
							<React.Fragment key={point.statementId}>
								{point.axes.map((axis: Axis) => (
									<React.Fragment key={axis.questionId}>
										{axis.groups.map((group: Group, i: number) => (
											<div
												key={`${point.statementId}-${axis.questionId}-${group.option.option}-${i}`}
												className={styles.axisGroup}
												style={{
													left: showGroups === point.statementId && group.position ? group.position.x + 'px' : point.position ? point.position.x + 10 + 'px' : '10px',
													top: showGroups === point.statementId && group.position ? group.position.y + 'px' : point.position ? point.position.y + 10 + 'px' : '10px',
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

					{/* X-Axis */}
					<div className={styles.xAxis}>
						<div className={styles.xAxis__markers}>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--left']}`}>
								{t("Disagree")}
							</span>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--center']}`}>
								{t("Neutral")}
							</span>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--right']}`}>
								{t("Agree")}
							</span>
						</div>
						<span className={styles.xAxis__label}>{t("Agreement")}</span>
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className={styles.legend}>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--consensus']}`} />
					<span className={styles.legend__text}>{t("Consensus")}: {t("Everyone agrees")}</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--rejection']}`} />
					<span className={styles.legend__text}>{t("Rejection")}: {t("Everyone disagrees")}</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--polarized']}`} />
					<span className={styles.legend__text}>{t("Polarized")}: {t("People are divided")}</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--neutral']}`} />
					<span className={styles.legend__text}>{t("Neutral")}: {t("Indifferent")}</span>
				</div>
			</div>
		</div>
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
							let color = group.option.color;
							if (!color) {
								const { options } = userQuestions.find(q => q.userQuestionId === axis.axId) || { options: [] };
								color = options.find(opt => opt.option === group.option.option)?.color || '#808080';
							}

							return {
								option: {
									option: group.option.option,
									color: color,
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
