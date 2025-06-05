import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId } from '@/redux/userData/userDataSlice';
import { polarizationIndex } from 'delib-npm';
import { stat } from 'node:fs';
import { p } from 'node_modules/react-router/dist/development/lib-B8x_tOvL.d.mts';
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';

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
	position: {
		x: number;
		y: number;
	}
}

const PolarizationIndex = () => {
	const { statementId } = useParams();
	const canvasRef = useRef(null);
	const [selectedStatementIndex, setSelectedStatementIndex] = useState(null);
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const containerRef = useRef(null);
	const [showOverallMAD, setShowOverallMAD] = useState(false); // Toggle between groupsMAD and overallMAD
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));

	console.log(polarizationIndexes)
	//calculate points on the screen

	console.log("Polarization Index points:", calculatePositions(polarizationIndexes));

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
		<div>Polarization Index</div>
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
		const x = (1 - mad) * 100;
		const y = (mean + 1) * 50;

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
				const { statementId, statement, overallMAD, overallMean, overallN, axes } = point;
				if (!statementId) throw new Error(`Statement ID is required in the point "${point.statement}"`);
				if (!statement) throw new Error(`Statement is required in the point "${point.statement}"`);
				if (overallMAD == undefined || overallMAD === null) throw new Error(`Overall MAD is required in the point "${point.statement}"`);
				if (overallMean == undefined || overallMean === null) throw new Error(`Overall Mean is required in the point "${point.statement}"`);
				if (!axes || !Array.isArray(axes)) throw new Error(`Axes must be an array in the point "${point.statement}"`);
				if (axes.length === 0) throw new Error(`Axes cannot be empty in the point "${point.statement}"`);
				if (overallN === undefined || overallN < 0) throw new Error(`Overall N must be a non-negative number in the point "${point.statement}"`);

				const position = calculatePosition(overallMAD, overallMean);

				return {
					statementId,
					statement,
					overallMAD,
					overallMean,
					overallN,
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
					position
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
