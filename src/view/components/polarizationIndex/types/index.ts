// Type definitions for Polarization Index components

export interface PolarizationGroup {
	groupId?: string;
	groupName?: string;
	average: number;
	mad: number;
	numberOfMembers: number;
	color?: string;
}

export interface PolarizationAxis {
	groupingQuestionId?: string;
	groupingQuestionText?: string;
	axisAverageAgreement: number;
	axisMAD: number;
	groups?: PolarizationGroup[];
}

export interface PolarizationStatement {
	parentId?: string;
	statementId?: string;
	statement?: string;
	totalEvaluators: number;
	overallMAD: number;
	averageAgreement: number;
	lastUpdated?: number;
	color?: string;
	axes?: PolarizationAxis[];
}

export interface ChartDimensions {
	width: number;
	height: number;
}

export interface CanvasPoint {
	x: number;
	y: number;
}
