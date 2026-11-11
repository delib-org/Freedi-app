import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './CardActionButtons.module.scss';

interface DiveInIconButtonProps {
	/** Button class from the host card's module, so it matches that card's action buttons. */
	className: string;
	onClick: () => void;
	/** Translation key for the accessible name and tooltip. Defaults to "Dive in". */
	label?: 'Dive in' | 'Drill down';
}

/** Icon-only "go into this card" button shared by option, question and message cards. */
export const DiveInIconButton: FC<DiveInIconButtonProps> = ({
	className,
	onClick,
	label = 'Dive in',
}) => {
	const { t } = useTranslation();

	return (
		<button
			type="button"
			className={className}
			onClick={onClick}
			aria-label={t(label)}
			title={t(label)}
		>
			<span className={`material-symbols-outlined ${styles['card-action-icon']}`} aria-hidden>
				jump_to_element
			</span>
		</button>
	);
};

interface BookmarkIconButtonProps {
	/** Base action-button and bookmark class names of the host card. */
	className: string;
	activeClassName: string;
	isBookmarked: boolean;
	onClick: () => void;
}

/** Bookmark toggle shared by option and message cards. */
export const BookmarkIconButton: FC<BookmarkIconButtonProps> = ({
	className,
	activeClassName,
	isBookmarked,
	onClick,
}) => {
	const { t } = useTranslation();

	return (
		<button
			type="button"
			className={`${className} ${isBookmarked ? activeClassName : ''}`}
			onClick={onClick}
			aria-label={isBookmarked ? t('Remove bookmark') : t('Bookmark')}
		>
			<span
				className={`material-symbols-outlined ${styles['card-action-icon']} ${
					styles[isBookmarked ? 'card-action-icon--filled' : 'card-action-icon--outline']
				}`}
				aria-hidden
			>
				bookmark
			</span>
		</button>
	);
};
