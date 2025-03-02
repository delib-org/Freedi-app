import LoaderGlass from '../../components/loaders/LoaderGlass';
import styles from './loadingPage.module.scss';

import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const LoadingPage = () => {
	const { t } = useUserConfig();

	return (
		<div className={styles.loader}>
			<div className={styles.box}>
				<h1>{t('FreeDi: Empowering Agreements')}</h1>
				<LoaderGlass />
				<h2>{t('Please wait while the page loads')}</h2>
			</div>
		</div>
	);
};

export default LoadingPage;
