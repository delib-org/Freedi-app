import { FC } from 'react';
import LightCogIcon from '@/assets/icons/lightCogIcon.svg?react';
import styles from './SectionTitle.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface SectionTitleProps {
	title: string;
}

const SectionTitle: FC<SectionTitleProps> = ({ title }) => {
	const { dir } = useTranslation();

	return (
		<h2 className={`${styles.sectionTitle} ${styles[dir]}`}>
			{title} <LightCogIcon />
		</h2>
	);
};

export default SectionTitle;
