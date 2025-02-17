import styles from './TitleMassConsensus.module.scss';

const TitleMassConsensus = ({ title }: { title: string} ) => {

	return (
			<h1 className={styles.title}>{title}</h1>
	)
}

export default TitleMassConsensus