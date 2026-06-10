import type { ComponentType, SVGProps } from 'react';
import FlagEn from '@/assets/icons/flagEn.svg?react';
import FlagHeb from '@/assets/icons/flagHeb.svg?react';
import FlagEs from '@/assets/icons/flagEs.svg?react';
import FlagNl from '@/assets/icons/flagNl.svg?react';
import FlagAR from '@/assets/icons/flagAR.svg?react';
import FlagDe from '@/assets/icons/flagDe.svg?react';
import FlagFa from '@/assets/icons/flagFa.svg?react';

export interface LanguageOption {
	label: string;
	code: string;
	shortCode: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const LANGUAGES: LanguageOption[] = [
	{ label: 'עברית', code: 'he', shortCode: 'עב', icon: FlagHeb },
	{ label: 'English', code: 'en', shortCode: 'EN', icon: FlagEn },
	{ label: 'Nederlands', code: 'nl', shortCode: 'NL', icon: FlagNl },
	{ label: 'العربية', code: 'ar', shortCode: 'ع', icon: FlagAR },
	{ label: 'Español', code: 'es', shortCode: 'ES', icon: FlagEs },
	{ label: 'Deutsch', code: 'de', shortCode: 'DE', icon: FlagDe },
	{ label: 'فارسی', code: 'fa', shortCode: 'فا', icon: FlagFa },
];
