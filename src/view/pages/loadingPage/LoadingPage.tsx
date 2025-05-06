import LoaderGlass from '../../components/loaders/LoaderGlass';
import styles from './loadingPage.module.scss';

const LoadingPage = () => {

	return (
		<div className={styles.loader}>
			<div className={styles.box}>
				<h1>FreeDi: Empowering Agreements</h1>
				<LoaderGlass />
				<h2>Please wait while the page loads</h2>
			</div>
		</div>
	);
};

export default LoadingPage;
