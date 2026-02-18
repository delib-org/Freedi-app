import styles from './BookmarkBar.module.scss';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';
import Smile from '@/assets/icons/smile.svg?react';
import { useState } from 'react';

const BookmarkBar = () => {
	const [selected, setSelected] = useState('introduction');

	const bookmarks = [
		{ id: 'introduction', icon: <InfoIcon color="white" />, className: styles.introductionMark },
		{
			id: 'questions',
			icon: <div className={styles.magGlass}>⌕</div>,
			className: styles.questionsMark,
		},
		{ id: 'solution', icon: <Smile color="white" />, className: styles.solutionMark },
	];

	const scrollToSection = (sectionId) => {
		setSelected(sectionId);
		const element = document.getElementById(sectionId);
		if (element) {
			element.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
			});
		}
	};

	return (
		<div className={styles.bookmarksWrapper}>
			{bookmarks.map(({ id, icon, className }) => (
				<button
					key={id}
					className={`${className} ${styles.buttonMark} ${selected === id ? styles.selected : ''}`}
					onClick={() => scrollToSection(id)}
				>
					{icon}
				</button>
			))}
		</div>
	);
};
export default BookmarkBar;
