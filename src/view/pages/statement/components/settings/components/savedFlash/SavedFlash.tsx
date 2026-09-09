import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SavedFlash.module.scss';

interface SavedFlashProps {
	/** Whether this flash is the one currently lit. */
	active: boolean;
}

/**
 * The per-control "Saved ✓" confirmation. The live region is always in the
 * DOM (an `aria-live` node that appears with its text is not announced), so
 * screen-reader users hear the save the same moment sighted users see it.
 */
const SavedFlash: FC<SavedFlashProps> = ({ active }) => {
	const { t } = useTranslation();

	return (
		<span
			className={styles.savedFlash}
			data-active={active ? 'true' : 'false'}
			aria-live="polite"
			aria-atomic="true"
		>
			{active ? `${t('Saved')} ✓` : ''}
		</span>
	);
};

export default SavedFlash;
