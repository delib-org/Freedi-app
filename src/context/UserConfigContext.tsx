import React, {
	createContext,
	useState,
	useCallback,
	useEffect,
	ReactNode,
} from 'react';

// Types and Enums
export enum LanguagesEnum {
	en = 'en',
	ar = 'ar',
	he = 'he',
	de = 'de',
	es = 'es',
	nl = 'nl',
}

export interface UserConfig {
	chosenLanguage: LanguagesEnum;
	fontSize: number;
	colorContrast: boolean;
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
};

type UserConfigProviderProps = {
	children: ReactNode;
};

// Import language files
import ar from '../assets/Languages/ar.json';
import de from '../assets/Languages/de.json';
import en from '../assets/Languages/en.json';
import es from '../assets/Languages/es.json';
import he from '../assets/Languages/he.json';
import nl from '../assets/Languages/nl.json';

const languages: Record<string, string>[] = [en, ar, he, de, es, nl];

// Default values
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_LANGUAGE = LanguagesEnum.he;
export const DEFAULT_COLOR_CONTRAST = false;

export const DEFAULT_CONFIG: UserConfig = {
	chosenLanguage: DEFAULT_LANGUAGE,
	fontSize: DEFAULT_FONT_SIZE,
	colorContrast: DEFAULT_COLOR_CONTRAST,
};

// Create context
export const UserConfigContext = createContext<
	UserConfigContextType | undefined
>(undefined);

// Helper to determine directions based on language
const getDirections = (
	language: string
): { dir: Direction; rowDirection: RowDirection } => {
	const isRTL = language === 'ar' || language === 'he';

	return {
		dir: isRTL ? 'rtl' : 'ltr',
		rowDirection: isRTL ? 'row-reverse' : 'row',
	};
};

// Create context value helper
const createContextValue = (
	currentLanguage: string,
	changeLanguage: (newLanguage: LanguagesEnum) => void,
	t: (text: string) => string,
	fontSize: number,
	changeFontSize: (newSize: number) => void,
	colorContrast: boolean,
	setColorContrast: (value: boolean) => void
): UserConfigContextType => {
	const { dir, rowDirection } = getDirections(currentLanguage);

	return {
		currentLanguage,
		changeLanguage,
		t,
		dir,
		rowDirection,
		fontSize,
		changeFontSize,
		colorContrast,
		setColorContrast,
	};
};

// Provider component
export const UserConfigProvider: React.FC<UserConfigProviderProps> = ({
	children,
}) => {
	// Initialize state from localStorage or defaults
	const [config, setConfig] = useState<UserConfig>(() => {
		try {
			const savedConfig = localStorage.getItem('userConfig');
			if (savedConfig) {
				const parsedConfig = JSON.parse(savedConfig);

				return {
					chosenLanguage:
						parsedConfig.chosenLanguage || DEFAULT_LANGUAGE,
					fontSize: parsedConfig.fontSize || DEFAULT_FONT_SIZE,
					colorContrast:
						parsedConfig.colorContrast ?? DEFAULT_COLOR_CONTRAST,
				};
			}
		} catch (error) {
			console.error('Error reading from localStorage:', error);
		}

		return DEFAULT_CONFIG;
	});

	const [languageData, setLanguageData] = useState<Record<string, string>>(
		{}
	);

	// Save to localStorage whenever config changes
	useEffect(() => {
		try {
			localStorage.setItem('userConfig', JSON.stringify(config));
		} catch (error) {
			console.error('Error saving to localStorage:', error);
		}
	}, [config]);

	// Update document direction when language changes
	useEffect(() => {
		const { dir } = getDirections(config.chosenLanguage);
		document.body.style.direction = dir;
	}, [config.chosenLanguage]);

	// Language change handler
	const changeLanguage = useCallback((newLanguage: LanguagesEnum) => {
		setConfig((prev) => ({
			...prev,
			chosenLanguage: newLanguage,
		}));
	}, []);

	// Font size change handler
	const changeFontSize = useCallback((newSize: number) => {
		setConfig((prev) => ({
			...prev,
			fontSize: newSize,
		}));
	}, []);

	// Color contrast handler
	const setColorContrast = useCallback((value: boolean) => {
		setConfig((prev) => ({
			...prev,
			colorContrast: value,
		}));
	}, []);

	// Translation function
	const t = useCallback(
		(text: string) => {
			return languageData[text] || text;
		},
		[languageData]
	);

	// Load language data when language changes
	useEffect(() => {
		const languageIndex = Object.values(LanguagesEnum).indexOf(
			config.chosenLanguage
		);
		if (languageIndex !== -1) {
			setLanguageData(languages[languageIndex]);
		} else {
			console.error(
				`Language data not found for ${config.chosenLanguage}`
			);
		}
	}, [config.chosenLanguage]);

	// Apply color contrast effect
	useEffect(() => {
		const colorMappings: Record<string, string> = {
			'--primary-color': '--high-contrast-primary',
			'--secondary-color': '--high-contrast-secondary',
			// Add other color mappings as needed
		};

		Object.entries(colorMappings).forEach(([key, contrastKey]) => {
			document.documentElement.style.setProperty(
				key,
				config.colorContrast ? `var(${contrastKey})` : ''
			);
		});
	}, [config.colorContrast]);

	// Memoize context value
	const contextValue = React.useMemo(
		() =>
			createContextValue(
				config.chosenLanguage,
				changeLanguage,
				t,
				config.fontSize,
				changeFontSize,
				config.colorContrast,
				setColorContrast
			),
		[
			config.chosenLanguage,
			config.fontSize,
			config.colorContrast,
			changeLanguage,
			changeFontSize,
			setColorContrast,
			t,
		]
	);

	return (
		<UserConfigContext.Provider value={contextValue}>
			{children}
		</UserConfigContext.Provider>
	);
};
