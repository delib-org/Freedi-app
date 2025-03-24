import styles from './MassConsensusAdmin.module.scss';
import Description from '../../../evaluations/components/description/Description';
import { useParams } from 'react-router';
import HandsImage from '@/assets/images/hands.png';
import BulbImage from '@/assets/images/bulb.png';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';

const MassConsensusAdmin = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const {t} = useUserConfig();

	return (
		<div className={styles.simpleQuestion}>
			<div className={styles.wrapper}>
				<Description />
				<div className={`btns ${styles.share}` }>
					<ShareButton title="Share this statement" text="Share" url={`/mass-consensus/${statementId}`} />
				</div>
				<h3>{t("Results Summary")}</h3>
				<div className={styles.summary}>
					<div>
						<img src={HandsImage} alt="Total participants" />
						<div>{t("Total participants")}: {statement.massMembers || 0}</div>
					</div>
					<div>
						<img src={BulbImage} alt="Total Suggestions" />
						<div>{t("Total suggestions")}: {statement.suggestions ||0}</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default MassConsensusAdmin;
