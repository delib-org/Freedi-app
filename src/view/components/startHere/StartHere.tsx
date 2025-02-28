import React, { FC } from 'react';
import styles from './StartHere.module.scss';
import PointDown from '@/assets/images/handPointingDown.png';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';

interface Props {
	setShow: React.Dispatch<React.SetStateAction<boolean>>;
}

const StartHere: FC<Props> = ({ setShow }) => {
	const { t, dir } = useUserConfig();
	const decreaseLearning = useDecreaseLearningRemain();

	function handleCloseModal() {
		setShow(false);
		decreaseLearning({
			addOption: true,
		});
	}

	return (
		<button
			onClick={handleCloseModal}
			className={`${styles['start-here']} ${dir === 'ltr' ? styles['start-here--ltr'] : ''}`}
		>
			<div className={styles.text}>{t('Add new option here')}</div>
			<img
				className={styles.img}
				src={PointDown}
				alt='start here pointer'
			/>
		</button>
	);
};

export default StartHere;
