import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './GeneralHeader.module.scss';
import Back from '@/view/pages/statement/components/header/Back';

const GeneralHeader = () => {
	const { t, dir } = useTranslation();

	return (
		<div className={`page__header app-header app-header--sticky ${styles.myHeader}`}>
			<div className="app-header-wrapper">
				{dir === 'rtl' ? (
					<>
						<div className="app-header-spacer" />
						<h1 className="app-header-title">{t('My Profile')}</h1>
						<Back />
					</>
				) : (
					<>
						<Back />
						<h1 className="app-header-title">{t('My Profile')}</h1>
						<div className="app-header-spacer" />
					</>
				)}
			</div>
		</div>
	);
};

export default GeneralHeader;
