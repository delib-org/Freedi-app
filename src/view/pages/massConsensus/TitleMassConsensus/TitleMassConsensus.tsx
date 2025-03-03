import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import styles from './TitleMassConsensus.module.scss';

const TitleMassConsensus = ({ title }: { title: string} ) => {
	const { dir } = useParamsLanguage();

	return (
			<h1 className={styles.title} style={{ direction: dir }}>{title}</h1>
	)
}

export default TitleMassConsensus