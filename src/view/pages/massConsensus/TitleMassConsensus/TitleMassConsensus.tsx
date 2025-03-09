import { useLanguageParams } from '../useParamsLang/useLanguageParams';
import styles from './TitleMassConsensus.module.scss';

const TitleMassConsensus = ({ title }: { title: string }) => {
	const { dir } = useLanguageParams();

	return (
		<h1 className={styles.title} style={{ direction: dir }}>
			{title}
		</h1>
	);
};

export default TitleMassConsensus;
