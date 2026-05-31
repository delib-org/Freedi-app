import { FC, useEffect, useRef, KeyboardEvent, RefObject } from 'react';
import { LanguagesEnum } from '@/context/UserConfigContext';
import styles from './ChangeLanguage.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { LANGUAGES } from '@/constants/Languages';

interface ChangeLanguageProps {
	/** Close the popover (typically toggles its parent state) */
	onClose: () => void;
	/** Optional element to return focus to when the popover closes */
	returnFocusRef?: RefObject<HTMLElement>;
	/** Pin the popover to the inline-end edge (default: end). Use 'center' on the splash. */
	align?: 'end' | 'center';
}

const ChangeLanguage: FC<ChangeLanguageProps> = ({ onClose, returnFocusRef, align = 'end' }) => {
	const { t, changeLanguage, currentLanguage } = useTranslation();
	const popoverRef = useRef<HTMLDivElement>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

	function handleLanguageChange(code: string) {
		const lang = code as LanguagesEnum;
		changeLanguage(lang);

		if (lang === 'he' || lang === 'ar' || lang === 'fa') {
			document.body.style.direction = 'rtl';
		} else {
			document.body.style.direction = 'ltr';
		}
		localStorage.setItem('lang', lang);

		closePopover();
	}

	function closePopover() {
		onClose();
		if (returnFocusRef?.current) {
			returnFocusRef.current.focus();
		}
	}

	// Focus the currently selected option when opening
	useEffect(() => {
		const selectedIndex = LANGUAGES.findIndex((l) => l.code === currentLanguage);
		const target = optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0];
		target?.focus();
	}, [currentLanguage]);

	// Outside-click and ESC dismiss
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (popoverRef.current && !popoverRef.current.contains(target)) {
				// Don't close if click was on the trigger itself
				if (returnFocusRef?.current && returnFocusRef.current.contains(target)) {
					return;
				}
				onClose();
			}
		}

		function handleKeyDown(event: globalThis.KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closePopover();
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, []);

	function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const currentIndex = optionRefs.current.findIndex((el) => el === document.activeElement);

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next = currentIndex < 0 ? 0 : (currentIndex + 1) % LANGUAGES.length;
			optionRefs.current[next]?.focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			const prev = currentIndex <= 0 ? LANGUAGES.length - 1 : currentIndex - 1;
			optionRefs.current[prev]?.focus();
		} else if (event.key === 'Home') {
			event.preventDefault();
			optionRefs.current[0]?.focus();
		} else if (event.key === 'End') {
			event.preventDefault();
			optionRefs.current[LANGUAGES.length - 1]?.focus();
		}
	}

	return (
		<div
			ref={popoverRef}
			className={`${styles.popover} ${align === 'center' ? styles.alignCenter : styles.alignEnd}`}
			role="listbox"
			aria-label={t('Language selection')}
			onKeyDown={handleListKeyDown}
		>
			{LANGUAGES.map(({ code, label, icon: Icon }, index) => {
				const isSelected = code === currentLanguage;

				return (
					<button
						key={code}
						ref={(el) => {
							optionRefs.current[index] = el;
						}}
						type="button"
						role="option"
						aria-selected={isSelected}
						className={`${styles.option} ${isSelected ? styles.selected : ''}`}
						onClick={() => handleLanguageChange(code)}
					>
						<Icon className={styles.flag} aria-hidden="true" />
						<span className={styles.label}>{label}</span>
						{isSelected && (
							<span className={styles.check} aria-hidden="true">
								✓
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
};

export default ChangeLanguage;
