import React from 'react';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Me.module.scss';

interface AccessibilitySheetProps {
	isOpen: boolean;
	onClose: () => void;
	fontSize: number;
	onFontSizeChange: (size: number) => void;
	highContrast: boolean;
	onHighContrastChange: (value: boolean) => void;
}

/** The same text-size and contrast controls as the floating accessibility widget. */
export default function AccessibilitySheet({
	isOpen,
	onClose,
	fontSize,
	onFontSizeChange,
	highContrast,
	onHighContrastChange,
}: AccessibilitySheetProps) {
	const { t } = useTranslation();

	return (
		<Sheet isOpen={isOpen} onClose={onClose} title={t('Accessibility')} id="me-accessibility-sheet">
			<div className={styles.a11y}>
				<div className={styles.a11y__row}>
					<span id="me-text-size">{t('Text size')}</span>
					<div className={styles.a11y__stepper} role="group" aria-labelledby="me-text-size">
						<button
							type="button"
							onClick={() => onFontSizeChange(fontSize - 1)}
							aria-label={t('Smaller text')}
							data-testid="me-font-smaller"
						>
							A−
						</button>
						<output aria-live="polite">{fontSize}</output>
						<button
							type="button"
							onClick={() => onFontSizeChange(fontSize + 1)}
							aria-label={t('Larger text')}
							data-testid="me-font-larger"
						>
							A+
						</button>
					</div>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={highContrast}
					className={styles.a11y__row}
					onClick={() => onHighContrastChange(!highContrast)}
					data-testid="me-high-contrast"
				>
					<span>{t('High contrast')}</span>
					<span className={styles.a11y__toggle} data-on={highContrast} aria-hidden="true" />
				</button>
			</div>
		</Sheet>
	);
}
