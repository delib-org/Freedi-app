import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './MassConsensusProcessSettings.module.scss';
import AdminQuestionnairePanel from '../adminQuestionnairePanel/AdminQuestionnairePanel';
import { useEffect, useState } from 'react';
import { LoginType } from 'delib-npm';
import { useParams } from 'react-router';
import { listenToMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus';
import CheckBoxCheckIcon from '@/assets/icons/checkboxCheckedIcon.svg?react';
import CheckBoxIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import { updateMassConsensusLoginTypeProcess } from '@/controllers/db/massConsensus/setMassConsensus';
import { useSelector } from 'react-redux';
import { massConsensusProcessSelector } from '@/redux/massConsensus/massConsensusSlice';

const MassConsensusProcessSettings = () => {
	const { t } = useUserConfig();
	const { statementId } = useParams();
	const [activeLoginType, setActiveLoginType] = useState<LoginType>(LoginType.default);

	const processList = useSelector(massConsensusProcessSelector(statementId));
	
	const showGoogle =
		processList?.loginTypes?.google &&
		processList.loginTypes.google.steps?.length > 0;
	const showAnonymous =
		processList?.loginTypes?.anonymous &&
		processList.loginTypes?.anonymous.steps?.length > 0;

	useEffect(() => {
		const unsubscribe = listenToMassConsensusProcess(statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	function handleSetCheckbox(loginType: LoginType) {
		updateMassConsensusLoginTypeProcess(statementId, loginType);
	}

	return (
		<div className={styles.mcProcess}>
			<h3>{t('Mass Consensus Process Settings')}</h3>

			<div className={styles.loginTypeTabs}>
				<button
					className={`${styles.tab} ${activeLoginType === LoginType.default ? styles.tabActive : ''}`}
					onClick={() => setActiveLoginType(LoginType.default)}
				>
					{t('Default')}
				</button>
				
				<div className={styles.tabWithCheckbox}>
					<button
						className={`${styles.tab} ${activeLoginType === LoginType.google ? styles.tabActive : ''}`}
						onClick={() => setActiveLoginType(LoginType.google)}
						disabled={!showGoogle}
					>
						{t('Google')}
					</button>
					<div
						className={styles.checkboxContainer}
						onClick={() => handleSetCheckbox(LoginType.google)}
					>
						{showGoogle ? (
							<CheckBoxCheckIcon className={styles.checkbox} />
						) : (
							<CheckBoxIcon className={styles.checkbox} />
						)}
					</div>
				</div>

				<div className={styles.tabWithCheckbox}>
					<button
						className={`${styles.tab} ${activeLoginType === LoginType.anonymous ? styles.tabActive : ''}`}
						onClick={() => setActiveLoginType(LoginType.anonymous)}
						disabled={!showAnonymous}
					>
						{t('Anonymous')}
					</button>
					<div
						className={styles.checkboxContainer}
						onClick={() => handleSetCheckbox(LoginType.anonymous)}
					>
						{showAnonymous ? (
							<CheckBoxCheckIcon className={styles.checkbox} />
						) : (
							<CheckBoxIcon className={styles.checkbox} />
						)}
					</div>
				</div>
			</div>

			<AdminQuestionnairePanel loginType={activeLoginType} />
		</div>
	);
};

export default MassConsensusProcessSettings;
