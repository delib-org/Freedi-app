import communityVoice1 from '@/assets/icons/evaluation/communityVoice1.svg';
import communityVoice2 from '@/assets/icons/evaluation/communityVoice2.svg';
import communityVoice3 from '@/assets/icons/evaluation/communityVoice3.svg';
import communityVoice4 from '@/assets/icons/evaluation/communityVoice4.svg';

export interface CommunityVoiceOption {
	id: string;
	evaluation: number;
	svg: string;
	color: string;
	colorSelected: string;
	alt: string;
	labelKey: string;
	/** Answer-card fill: the agree hue, stronger the more it echoes. */
	cardColor: string;
}

export const communityVoiceOptions: CommunityVoiceOption[] = [
	{
		id: 'cv-4',
		evaluation: 1,
		cardColor: 'color-mix(in srgb, var(--agree3) 100%, var(--bg-sunken))',
		svg: communityVoice4,
		color: 'rgba(91, 138, 154, 0.18)',
		colorSelected: 'rgba(91, 138, 154, 0.9)',
		alt: "This echoes my community's voice",
		labelKey: "This echoes my community's voice",
	},
	{
		id: 'cv-3',
		evaluation: 0.75,
		cardColor: 'color-mix(in srgb, var(--agree3) 80%, var(--bg-sunken))',
		svg: communityVoice3,
		color: 'rgba(91, 138, 154, 0.18)',
		colorSelected: 'rgba(91, 138, 154, 0.7)',
		alt: 'I closely relate to this',
		labelKey: 'I closely relate to this',
	},
	{
		id: 'cv-2',
		evaluation: 0.5,
		cardColor: 'color-mix(in srgb, var(--agree3) 62%, var(--bg-sunken))',
		svg: communityVoice2,
		color: 'rgba(91, 138, 154, 0.18)',
		colorSelected: 'rgba(91, 138, 154, 0.55)',
		alt: 'I partly relate',
		labelKey: 'I partly relate',
	},
	{
		id: 'cv-1',
		evaluation: 0.25,
		cardColor: 'color-mix(in srgb, var(--agree3) 45%, var(--bg-sunken))',
		svg: communityVoice1,
		color: 'rgba(91, 138, 154, 0.18)',
		colorSelected: 'rgba(91, 138, 154, 0.4)',
		alt: 'I hear this perspective',
		labelKey: 'I hear this perspective',
	},
];
