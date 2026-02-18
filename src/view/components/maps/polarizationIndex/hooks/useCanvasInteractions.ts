import React from 'react';
import { dataToCanvas } from '../utils/canvasUtils';
import type { PolarizationStatement, ChartDimensions } from '../types';

export const useCanvasInteractions = (
	hasData: boolean,
	polarizationIndexes: PolarizationStatement[],
	selectedStatementIndex: number,
	setSelectedStatementIndex: (index: number) => void,
	setSelectedAxis: (axis: number) => void,
	setSelectedGroup: (group: number | null) => void,
	currentStatementData: PolarizationStatement | undefined,
	selectedAxis: number,
	selectedGroup: number | null,
	dimensions: ChartDimensions,
) => {
	// Handle canvas clicks
	const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
		if (!hasData) return;

		const canvas = event.currentTarget;
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;
		const isMobile = window.innerWidth <= 768;

		// Check for main statement point clicks FIRST
		let clickedStatement: number | null = null;
		polarizationIndexes.forEach((statement, index) => {
			const statementPoint = dataToCanvas(
				statement.averageAgreement,
				statement.overallMAD,
				dimensions,
			);
			const distance = Math.sqrt(
				Math.pow(canvasX - statementPoint.x, 2) + Math.pow(canvasY - statementPoint.y, 2),
			);
			const radius = index === selectedStatementIndex ? (isMobile ? 10 : 14) : isMobile ? 7 : 10;

			if (distance <= radius + (isMobile ? 8 : 5)) {
				clickedStatement = index;
			}
		});

		if (clickedStatement !== null) {
			setSelectedStatementIndex(clickedStatement);
			setSelectedAxis(0);
			setSelectedGroup(null);

			return;
		}

		// Check for group clicks (only for current statement)
		if (currentStatementData?.axes && currentStatementData.axes[selectedAxis]) {
			const currentAxis = currentStatementData.axes[selectedAxis];
			let clickedGroup: number | null = null;

			currentAxis.groups?.forEach((group, index: number) => {
				const groupPoint = dataToCanvas(group.average, group.mad, dimensions);
				const groupDistance = Math.sqrt(
					Math.pow(canvasX - groupPoint.x, 2) + Math.pow(canvasY - groupPoint.y, 2),
				);

				const radius = Math.max(
					isMobile ? 4 : 6,
					Math.min(isMobile ? 10 : 15, Math.sqrt(group.numberOfMembers / (isMobile ? 15 : 10))),
				);

				if (groupDistance <= radius + (isMobile ? 8 : 5)) {
					clickedGroup = index;
				}
			});

			if (clickedGroup !== null) {
				setSelectedGroup(selectedGroup === clickedGroup ? null : clickedGroup);
			} else {
				setSelectedGroup(null);
			}
		}
	};

	return { handleCanvasClick };
};
