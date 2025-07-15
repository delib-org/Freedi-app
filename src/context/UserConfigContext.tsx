// UserConfigContext.tsx
import React, {
	useState,
	useEffect,
	ReactNode,
} from 'react';
import {
	LanguagesEnum,
	UserConfig,
	Direction,
	RowDirection,
	DEFAULT_CONFIG,
	DEFAULT_LANGUAGE,
	DEFAULT_FONT_SIZE,
	DEFAULT_COLOR_CONTRAST,
	DEFAULT_LEARNING_SETTINGS,
} from './userConfig/types';
import { UserConfigContext } from './userConfig/context';

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
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

const languages: Record<string, string>[] = [en, ar, he, de, es, nl];

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

// Provider component
export const UserConfigProvider: React.FC<UserConfigProviderProps> = ({
	children,
}) => {
	// Initialize state from localStorage or defaults
	const [config, setConfig] = useState<UserConfig>(() => {
		try {
			const savedConfig = localStorage.getItem(
				LocalStorageObjects.UserConfig
			);
			if (savedConfig) {
				const parsedConfig = JSON.parse(savedConfig);

				return {
					chosenLanguage:
						parsedConfig.chosenLanguage ?? DEFAULT_LANGUAGE,
					fontSize: parsedConfig.fontSize ?? DEFAULT_FONT_SIZE,
					colorContrast:
						parsedConfig.colorContrast ?? DEFAULT_COLOR_CONTRAST,
					learning: {
						evaluation:
							parsedConfig.learning?.evaluation ??
							DEFAULT_LEARNING_SETTINGS.evaluation,
						addOptions:
							parsedConfig.learning?.addOptions ??
							DEFAULT_LEARNING_SETTINGS.addOptions,
					},
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
			localStorage.setItem(
				LocalStorageObjects.UserConfig,
				JSON.stringify(config)
			);
		} catch (error) {
			console.error('Error saving to localStorage:', error);
		}
	}, [config]);

	// Update document direction when language changes
	useEffect(() => {
		const { dir } = getDirections(config.chosenLanguage);
		document.body.style.direction = dir;
	}, [config.chosenLanguage]);

	//update font size
	useEffect(() => {
		document.documentElement.style.fontSize = `${config.fontSize}px`;
	}, [config.fontSize]);

	// Language change handler
	const changeLanguage = (newLanguage: LanguagesEnum) => {
		setConfig((prev) => ({
			...prev,
			chosenLanguage: newLanguage,
		}));
	};

	// Font size change handler
	const changeFontSize = (newSize: number) => {
		setConfig((prev) => ({
			...prev,
			fontSize: newSize,
		}));
	};

	// Color contrast handler
	const setColorContrast = (value: boolean) => {
		setConfig((prev) => ({
			...prev,
			colorContrast: value,
		}));
	};

	// Learning decrement handler
	const decrementLearning = (type: 'evaluation' | 'addOptions') => {
		setConfig((prev) => {
			const learning = { ...prev.learning };

			if (learning[type] > 0) {
				learning[type] = learning[type] - 1;
			}

			return { ...prev, learning };
		});
	};

	// Translation function
	const t = (text: string) => {
		return languageData[text] || text;
	};

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

	// Create context value
	const contextValue = {
		currentLanguage: config.chosenLanguage,
		changeLanguage,
		t,
		dir: getDirections(config.chosenLanguage).dir,
		rowDirection: getDirections(config.chosenLanguage).rowDirection,
		fontSize: config.fontSize,
		changeFontSize,
		colorContrast: config.colorContrast,
		setColorContrast,
		learning: config.learning,
		decrementLearning,
	};

	return (
		<UserConfigContext.Provider value={contextValue}>
			{children}
		</UserConfigContext.Provider>
	);
};

// Re-export the context for backward compatibility
export { UserConfigContext } from './userConfig/context';
// Re-export specific constants needed
export {
	LanguagesEnum,
	DEFAULT_FONT_SIZE,
	DEFAULT_LANGUAGE,
	DEFAULT_COLOR_CONTRAST,
	DEFAULT_LEARNING_SETTINGS,
	DEFAULT_CONFIG,
} from './userConfig/types';
// Re-export types
export type {
	UserConfig,
	LearningSettings,
	Direction,
	RowDirection,
	UserConfigContextType
} from './userConfig/types';
