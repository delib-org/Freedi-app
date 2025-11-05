import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './TitleMassConsensus.module.scss';

const TitleMassConsensus = ({ title }: { title: string }) => {
	const { dir } = useTranslation();

	return (
		<h1 className={styles.title} style={{ direction: dir }}>
			{title}
		</h1>
	);
};

export default TitleMassConsensus;
