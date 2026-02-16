import type { ChartDimensions, CanvasPoint } from '../types';

// Transform data coordinates to canvas coordinates
export const dataToCanvas = (
	dataX: number,
	dataY: number,
	dimensions: ChartDimensions,
): CanvasPoint => {
	const isMobile = window.innerWidth <= 768;
	const margin = isMobile ? 40 : 60;
	const plotWidth = dimensions.width - 2 * margin;
	const plotHeight = dimensions.height - 2 * margin;

	const canvasX = margin + ((dataX + 1) / 2) * plotWidth;
	const canvasY = dimensions.height - margin - dataY * plotHeight;

	return { x: canvasX, y: canvasY };
};

// Generate triangle boundary points
export const generateTriangleBoundary = (): CanvasPoint[] => {
	const points: CanvasPoint[] = [];
	for (let x = -1; x <= 1; x += 0.02) {
		const maxY = Math.min(1 + x, 1 - x);
		if (maxY >= 0) {
			points.push({ x, y: maxY });
		}
	}

	return points;
};
