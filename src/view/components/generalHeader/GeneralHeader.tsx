import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './GeneralHeader.module.scss';
import Back from '@/view/pages/statement/components/header/Back';

const GeneralHeader = () => {
	const { t } = useUserConfig();

	return (
		<div className={`page__header ${styles.myHeader}`}>
			<h1>{t("My Profile")}</h1>
			<Back />
		</div>
	)
}

export default GeneralHeader