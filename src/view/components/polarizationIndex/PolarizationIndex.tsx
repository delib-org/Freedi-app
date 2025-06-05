import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId } from '@/redux/userData/userDataSlice';
import { polarizationIndex } from 'delib-npm';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './PolarizationIndex.module.scss';
import { generateRandomLightColor } from '@/controllers/general/helpers';
import { Tooltip } from '../tooltip/Tooltip';

interface Group {
	option: string;
	mean: number;
	n: number;
	mad: number;
	position: {
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
	axes: Axis[];
	color: string;
	position: {
		x: number;
		y: number;
	}
}

const PolarizationIndex = () => {
	const { statementId } = useParams();
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));
	const points = calculatePositions(polarizationIndexes);

	//calculate points on the screen

	points.forEach((point: Point) => {
		console.log(point);
	});

	useEffect(() => {

		let unsubscribe: () => void;

		if (statementId) {
			unsubscribe = listenToPolarizationIndex(statementId);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [statementId]);

	return (
		<div>
			<div className={styles.board}>
				{points.map((point: Point) => (
					<div className={styles.pointDiv} key={point.statementId} style={{ left: point.position.x + '%', top: point.position.y + '%' }}>
						<Tooltip content={`${point.statement} MAD: ${point.overallMAD.toFixed(2)}, Mean: ${point.overallMean.toFixed(2)}, N: ${point.overallN}`} position="top">
							<div className={styles.point} style={{ backgroundColor: point.color }}>
							</div>
						</Tooltip>
					</div>
				))}
			</div>
		</div>
	);
}

export default PolarizationIndex;

function calculatePosition(mad: number, mean: number): { x: number; y: number } {
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
		const y = (1 - mad) * 100;
		const x = (mean + 1) * 50;

		return { x, y };
	} catch (error) {
		console.error("Error calculating points:", error);

		return { x: 0, y: 0 };
	}
}

function calculatePositions(points: polarizationIndex[]): Point[] {
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

				const position = calculatePosition(overallMAD, overallMean);

				return {
					statementId,
					statement,
					overallMAD,
					overallMean,
					overallN,
					color: color,
					axes: axes.map(axis => ({
						questionId: axis.axId,
						question: axis.question,
						groupsMAD: axis.groupsMAD,
						groups: axis.groups.map(group => ({
							option: group.option,
							mean: group.mean,
							n: group.n,
							mad: group.mad,
							position: calculatePosition(group.mad, group.mean)
						})),
					})),
					position,
					color: generateRandomLightColor(statementId),
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
