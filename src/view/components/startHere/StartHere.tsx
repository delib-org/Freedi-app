import React, { FC } from 'react';
import styles from './StartHere.module.scss';
import PointDown from '@/assets/images/handPointingDown.png';
import { decreesUserSettingsLearningRemain } from '@/controllers/db/learning/setLearning';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	setShow: React.Dispatch<React.SetStateAction<boolean>>;
}
const StartHere: FC<Props> = ({ setShow }) => {
	const { t, dir } = useUserConfig();
	function handleCloseModal() {
		setShow(false);
		decreesUserSettingsLearningRemain({ addOption: true });
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
