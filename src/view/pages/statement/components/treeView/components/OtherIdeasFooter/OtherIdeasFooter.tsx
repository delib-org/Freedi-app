import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './OtherIdeasFooter.module.scss';

interface OtherIdeasFooterProps {
	count: number;
	onShowAll: () => void;
}

/**
 * Closing line of the tree's Grouped filter: ideas no theme holds are not in the
 * list, so say so and offer the way to see them.
 */
const OtherIdeasFooter: FC<OtherIdeasFooterProps> = ({ count, onShowAll }) => {
	const { t } = useTranslation();

	if (count <= 0) return null;

	return (
		<button type="button" className={styles['other-ideas-footer']} onClick={onShowAll}>
			{t('{n} other ideas are not in a theme').replace('{n}', String(count))}
		</button>
	);
};

export default OtherIdeasFooter;
