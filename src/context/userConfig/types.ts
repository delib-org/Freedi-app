// Types and Enums for UserConfig
export enum LanguagesEnum {
	en = 'en',
	ar = 'ar',
	he = 'he',
	de = 'de',
	es = 'es',
	nl = 'nl',
}

// Learning settings interface
export interface LearningSettings {
	evaluation: number;
	addOptions: number;
}

export interface UserConfig {
	chosenLanguage: LanguagesEnum;
	fontSize: number;
	colorContrast: boolean;
	learning: LearningSettings;
}

export type Direction = 'ltr' | 'rtl';
export type RowDirection = 'row' | 'row-reverse';

export type UserConfigContextType = {
	currentLanguage: string;
	changeLanguage: (newLanguage: LanguagesEnum) => void;
	t: (text: string) => string;
	dir: Direction;
	rowDirection: RowDirection;
	fontSize: number;
	changeFontSize: (newSize: number) => void;
	colorContrast: boolean;
	setColorContrast: (value: boolean) => void;
	learning: LearningSettings;
	decrementLearning: (type: 'evaluation' | 'addOptions') => void;
};

// Default values
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_LANGUAGE = LanguagesEnum.he;
export const DEFAULT_COLOR_CONTRAST = false;
export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
	evaluation: 7,
	addOptions: 3,
};

export const DEFAULT_CONFIG: UserConfig = {
	chosenLanguage: DEFAULT_LANGUAGE,
	fontSize: DEFAULT_FONT_SIZE,
	colorContrast: DEFAULT_COLOR_CONTRAST,
	learning: DEFAULT_LEARNING_SETTINGS,
};
