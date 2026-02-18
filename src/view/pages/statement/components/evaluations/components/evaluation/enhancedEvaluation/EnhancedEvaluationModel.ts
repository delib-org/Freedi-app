import evaluation1 from '@/assets/icons/evaluation/evaluation1.svg';
import evaluation2 from '@/assets/icons/evaluation/evaluation2.svg';
import evaluation3 from '@/assets/icons/evaluation/evaluation3.svg';
import evaluation4 from '@/assets/icons/evaluation/evaluation4.svg';
import evaluation5 from '@/assets/icons/evaluation/evaluation5.svg';

export interface EnhancedEvaluationThumb {
	id: string;
	evaluation: number;
	svg: string;
	color: string;
	colorSelected: string;
	alt: string;
}

export const enhancedEvaluationsThumbs: EnhancedEvaluationThumb[] = [
	{
		id: 'a',
		evaluation: 1,
		svg: evaluation1,
		color: 'rgba(0,0,0, 0.18)',
		colorSelected: 'var(--emoji-smiley)',
		alt: 'like',
	},
	{
		id: 'b',
		evaluation: 0.5,
		svg: evaluation2,
		color: 'rgba(0,0,0, 0.18)',
		colorSelected: 'var(--emoji-happy)',
		alt: 'half like',
	},
	{
		id: 'c',
		evaluation: 0,
		svg: evaluation3,
		color: 'rgba(0,0,0, 0.18)',
		colorSelected: 'var(--emoji-neutral)',
		alt: 'neutral',
	},
	{
		id: 'd',
		evaluation: -0.5,
		svg: evaluation4,
		color: 'rgba(0,0,0, 0.18)',
		colorSelected: 'var(--emoji-thinking)',
		alt: 'half dislike',
	},
	{
		id: 'e',
		evaluation: -1,
		svg: evaluation5,
		color: 'rgba(0,0,0, 0.18)',
		colorSelected: 'var(--emoji-sad)',
		alt: 'dislike',
	},
];
