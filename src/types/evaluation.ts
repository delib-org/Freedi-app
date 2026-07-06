export interface EnhancedEvaluationThumb {
	id: string;
	evaluation: number;
	svg: string;
	color: string;
	colorSelected: string;
	alt: string;
	/** When set, the button renders this emoji instead of the SVG (reaction mode). */
	emoji?: string;
}
