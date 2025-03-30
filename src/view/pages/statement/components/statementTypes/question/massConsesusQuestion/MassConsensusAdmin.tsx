import styles from './MassConsensusAdmin.module.scss';
import Description from '../../../evaluations/components/description/Description';
import { useParams } from 'react-router';
import HandsImage from '@/assets/images/hands.png';
import BulbImage from '@/assets/images/bulb.png';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useSelector } from 'react-redux';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';
import { useEffect } from 'react';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { StatementType } from 'delib-npm';
import OptionMCCard from './components/deleteCard/OptionMCCard';
import DeletionLadyImage from "@/assets/images/rejectLady.png";

const MassConsensusAdmin = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const options = useSelector(statementSubsSelector(statementId)).filter((st) => st.statementType === StatementType.option);
	const sortedOptions = options ? [...options].sort((a, b) => b.consensus - a.consensus) : [];
	const topOptions = sortedOptions?.slice(0, 5);
	const sortedBottomOptions = options ? [...options].sort((a, b) => a.consensus - b.consensus) : [];
	const bottomOptions = sortedBottomOptions.slice(0, 5);

	const { t } = useUserConfig();

	useEffect(() => {
		if (!statement) return;
		const unsubscribe = listenToSubStatements(statementId, "bottom", 10);

		return () => unsubscribe();
	}, [statementId]);

	return (
		<div className={styles.massConsensusAdmin}>
			<div className="wrapper">
				<Description />
				<div className={`btns ${styles.share}`}>
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
						<div>{t("Total suggestions")}: {statement.suggestions || 0}</div>
					</div>
				</div>
				<h3>{t("Top options")}</h3>

				{topOptions?.map((option) => (
					<OptionMCCard key={option.statementId} statement={option} isDelete={false} />
				))}

				<h3>{t("Options for deletion")}</h3>
				<img className={styles.deletionImage} src={DeletionLadyImage} alt="Options for deletion" />
				{bottomOptions?.map((option) => (
					<OptionMCCard key={option.statementId} statement={option} isDelete={true} />
				))}

			</div>
		</div>
	);
};

export default MassConsensusAdmin;
