import { FC } from 'react';
import LightCogIcon from '@/assets/icons/lightCogIcon.svg?react';
import styles from './SectionTitle.module.scss';

interface SectionTitleProps {
	title: string;
}

const SectionTitle: FC<SectionTitleProps> = ({ title }) => {
	return (
		<h3 className={styles.sectionTitle}>
			<LightCogIcon />
			{title}
		</h3>
	);
};

export default SectionTitle;
