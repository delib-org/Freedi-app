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
import OptionDeleteCard from './components/deleteCard/OptionDeletecard';

const MassConsensusAdmin = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const options = useSelector(statementSubsSelector(statementId)).filter((st) => st.statementType === StatementType.option);
	const topOptions = options?.sort((a, b) => b.consensus - a.consensus).slice(0, 5);
	const bottomOptions = options?.sort((a, b) => a.consensus - b.consensus).slice(0, 5);

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
			<h3>Top Options</h3>
			<ul>
				{topOptions?.map((option) => (
					<li key={option.statementId}>
						{option.statement}
						<div>{option.consensus}%</div>
					</li>
				))}
			</ul>
			<h3>Bottom Options</h3>
			<ul>
				{bottomOptions?.map((option) => (
					<OptionDeleteCard key={option.statementId} statement={option} />
				))}
			</ul>
			</div>
		</div>
	);
};

export default MassConsensusAdmin;
