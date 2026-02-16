import React, { useRef, useEffect } from 'react';
import { dataToCanvas, generateTriangleBoundary } from '../utils/canvasUtils';
import type { PolarizationStatement, ChartDimensions } from '../types';
import styles from '../PolarizationIndex.module.scss';

interface PolarizationChartProps {
	dimensions: ChartDimensions;
	polarizationIndexes: PolarizationStatement[];
	selectedStatementIndex: number;
	selectedAxis: number;
	selectedGroup: number | null;
	currentStatementData: PolarizationStatement | undefined;
	onCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}

export const PolarizationChart: React.FC<PolarizationChartProps> = ({
	dimensions,
	polarizationIndexes,
	selectedStatementIndex,
	selectedAxis,
	selectedGroup,
	currentStatementData,
	onCanvasClick,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Draw the chart
	useEffect(() => {
		if (!dimensions.width || !dimensions.height || !polarizationIndexes.length) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;

		// Set up high DPI canvas
		canvas.width = dimensions.width * dpr;
		canvas.height = dimensions.height * dpr;
		canvas.style.width = dimensions.width + 'px';
		canvas.style.height = dimensions.height + 'px';
		ctx.scale(dpr, dpr);

		// Clear canvas
		ctx.clearRect(0, 0, dimensions.width, dimensions.height);

		const isMobile = window.innerWidth <= 768;
		const margin = isMobile ? 40 : 60;
		const plotWidth = dimensions.width - 2 * margin;
		const plotHeight = dimensions.height - 2 * margin;

		// Draw background grid
		ctx.strokeStyle = '#e0e0e0';
		ctx.lineWidth = 1;

		// Vertical grid lines
		for (let i = 0; i <= 10; i++) {
			const x = margin + (i / 10) * plotWidth;
			ctx.beginPath();
			ctx.moveTo(x, margin);
			ctx.lineTo(x, dimensions.height - margin);
			ctx.stroke();
		}

		// Horizontal grid lines
		for (let i = 0; i <= 10; i++) {
			const y = margin + (i / 10) * plotHeight;
			ctx.beginPath();
			ctx.moveTo(margin, y);
			ctx.lineTo(dimensions.width - margin, y);
			ctx.stroke();
		}

		// Draw triangle boundary
		const boundaryPoints = generateTriangleBoundary();
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 2;
		ctx.beginPath();

		boundaryPoints.forEach((point, index) => {
			const canvasPoint = dataToCanvas(point.x, point.y, dimensions);
			if (index === 0) {
				ctx.moveTo(canvasPoint.x, canvasPoint.y);
			} else {
				ctx.lineTo(canvasPoint.x, canvasPoint.y);
			}
		});
		ctx.stroke();

		// Draw axis labels
		ctx.fillStyle = '#333';
		ctx.font = isMobile ? '12px Arial' : '14px Arial';
		ctx.textAlign = 'center';

		// X-axis label
		ctx.fillText(
			'Average Agreement',
			dimensions.width / 2,
			dimensions.height - (isMobile ? 15 : 20),
		);

		// Y-axis label
		ctx.save();
		ctx.translate(isMobile ? 15 : 20, dimensions.height / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText('Polarization (MAD)', 0, 0);
		ctx.restore();

		// Draw axis ticks and labels
		ctx.font = isMobile ? '8px Arial' : '10px Arial';
		ctx.fillStyle = '#666';

		// X-axis ticks
		const xTicks = [-1, -0.5, 0, 0.5, 1];
		xTicks.forEach((tick) => {
			const canvasPoint = dataToCanvas(tick, 0, dimensions);
			ctx.textAlign = 'center';
			ctx.fillText(
				tick.toString(),
				canvasPoint.x,
				dimensions.height - margin + (isMobile ? 12 : 15),
			);
		});

		// Y-axis ticks
		const yTicks = [0, 0.25, 0.5, 0.75, 1];
		yTicks.forEach((tick) => {
			const canvasPoint = dataToCanvas(-1, tick, dimensions);
			ctx.textAlign = 'right';
			ctx.fillText(tick.toString(), margin - (isMobile ? 5 : 10), canvasPoint.y + 3);
		});

		// Draw ALL main statement points
		polarizationIndexes.forEach((statement, index) => {
			const statementPoint = dataToCanvas(
				statement.averageAgreement,
				statement.overallMAD,
				dimensions,
			);
			const isSelected = index === selectedStatementIndex;

			ctx.fillStyle = statement.color || '#666'; // Fallback color
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = isSelected ? (isMobile ? 3 : 4) : 2;

			const radius = isSelected ? (isMobile ? 10 : 14) : isMobile ? 7 : 10;
			ctx.beginPath();
			ctx.arc(statementPoint.x, statementPoint.y, radius, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();

			// Add statement label
			ctx.fillStyle = '#333';
			ctx.font = isSelected
				? isMobile
					? 'bold 9px Arial'
					: 'bold 11px Arial'
				: isMobile
					? '8px Arial'
					: '10px Arial';
			ctx.textAlign = 'center';
			const labelY = statementPoint.y - radius - (isMobile ? 12 : 16);
			const labelText = isMobile
				? (statement.statementId || 'Statement').split('_')[0]
				: (statement.statementId || 'Statement').replace('_', ' ');
			ctx.fillText(labelText, statementPoint.x, labelY);
		});
		// Draw groups for SELECTED statement only
		if (currentStatementData?.axes && currentStatementData.axes[selectedAxis]) {
			const currentAxis = currentStatementData.axes[selectedAxis];

			currentAxis.groups?.forEach((group, index: number) => {
				const groupPoint = dataToCanvas(group.average, group.mad, dimensions);

				const baseRadius = Math.max(
					isMobile ? 4 : 6,
					Math.min(isMobile ? 10 : 15, Math.sqrt(group.numberOfMembers / (isMobile ? 15 : 10))),
				);

				ctx.fillStyle = group.color || '#666'; // Fallback color
				ctx.strokeStyle = selectedGroup === index ? '#000' : '#fff';
				ctx.lineWidth = selectedGroup === index ? (isMobile ? 2 : 3) : 2;

				ctx.beginPath();
				ctx.arc(groupPoint.x, groupPoint.y, baseRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();

				// Group label
				if (!isMobile || baseRadius > 6) {
					ctx.fillStyle = '#333';
					ctx.font = isMobile ? '9px Arial' : '11px Arial';
					ctx.textAlign = 'center';
					const labelText = isMobile
						? (group.groupName || 'Group').split(' ')[0]
						: group.groupName || 'Group';
					ctx.fillText(labelText, groupPoint.x, groupPoint.y - baseRadius - (isMobile ? 6 : 8));
				}
			});
		}

		// Draw vertices labels (desktop only)
		if (!isMobile) {
			ctx.fillStyle = '#333';
			ctx.font = 'bold 12px Arial';

			// Complete Rejection vertex
			const vertex1 = dataToCanvas(-1, 0, dimensions);
			ctx.textAlign = 'center';
			ctx.fillText('Complete Rejection', vertex1.x, vertex1.y - 20);
			ctx.fillText('(-1, 0)', vertex1.x, vertex1.y - 8);

			// Complete Consensus vertex
			const vertex2 = dataToCanvas(1, 0, dimensions);
			ctx.textAlign = 'center';
			ctx.fillText('Complete Consensus', vertex2.x, vertex2.y - 20);
			ctx.fillText('(+1, 0)', vertex2.x, vertex2.y - 8);

			// Maximum Polarization vertex
			const vertex3 = dataToCanvas(0, 1, dimensions);
			ctx.textAlign = 'center';
			ctx.fillText('Maximum Polarization', vertex3.x, vertex3.y - 20);
			ctx.fillText('(0, 1)', vertex3.x, vertex3.y - 8);
		}
	}, [
		dimensions,
		selectedAxis,
		selectedGroup,
		selectedStatementIndex,
		polarizationIndexes,
		currentStatementData,
	]);

	return <canvas ref={canvasRef} onClick={onCanvasClick} className={styles.canvas} />;
};
