import React, { FC } from 'react';
import styles from './StartHere.module.scss';
import PointDown from '@/assets/images/handPointingDown.png';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useDecreaseLearningRemain } from '@/controllers/hooks/useDecreaseLearningRemain';

interface Props {
	setShow: React.Dispatch<React.SetStateAction<boolean>>;
}

const StartHere: FC<Props> = ({ setShow }) => {
	const { t, dir } = useTranslation();
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
			className={`${styles['start-here']} ${dir === 'ltr' ? styles['start-here--ltr'] : styles['start-here--rtl']}`}
		>
			<div className={styles.text}>{t('Add new option here')}</div>
			<img className={styles.img} src={PointDown} alt="start here pointer" />
		</button>
	);
};

export default StartHere;
