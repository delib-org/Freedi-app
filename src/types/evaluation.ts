/**
 * The five face shapes of the rating scale, lowest to highest. Only the mouth
 * differs between them (see FaceIcon).
 */
export type FaceKind = 'strong-dislike' | 'dislike' | 'neutral' | 'like' | 'strong-like';

export interface EnhancedEvaluationThumb {
	id: string;
	evaluation: number;
	svg: string;
	color: string;
	colorSelected: string;
	alt: string;
	/** When set, the button renders this emoji instead of the SVG (reaction mode). */
	emoji?: string;
	/** Face shape rendered by the face scale (agree/disagree mode). */
	face?: FaceKind;
	/** Short visible label under the face (translation key). Falls back to `alt`. */
	label?: string;
}
