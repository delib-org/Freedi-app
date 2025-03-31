import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import styles from './MassConsensusProcessSettings.module.scss'
import ProcessSetting from './ProcessSetting/ProcessSetting'
import { useEffect } from 'react'
import { LoginType, MassConsensusProcess } from 'delib-npm'
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel'
import { useSelector } from 'react-redux'
import { massConsensusProcessSelector } from '@/redux/massConsensus/massConsensusSlice'
import { useParams } from 'react-router'
import { listenToMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus'
import CheckBoxCheckIcon from '@/assets/icons/checkboxCheckedIcon.svg?react';
import CheckBoxIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import { updateMassConsensusLoginTypeProcess } from '@/controllers/db/massConsensus/setMassConsensus'

const MassConsensusProcessSettings = () => {

	const { t } = useUserConfig()
	const { statementId } = useParams()

	const defaultMassConsensusProcesses: MassConsensusProcess = {
		statementId: '',
		loginTypes: {
			default: {
				steps: defaultMassConsensusProcess,
				processName: t("Default Process for all users")
			}
		}
	}

	const processList = useSelector(massConsensusProcessSelector(statementId)) || defaultMassConsensusProcesses;
	const showGoogle = processList.loginTypes?.google && processList.loginTypes.google.steps?.length > 0;
	const showAnonymous = processList.loginTypes?.anonymous && processList.loginTypes?.anonymous.steps?.length > 0;

	const { steps: stepsDefault, processName: processNameDefault } = processList.loginTypes.default
	const { steps: stepsGoogle, processName: processNameGoogle } = processList.loginTypes?.google || {};
	const { steps: stepsAnonymous, processName: processNameAnonymous } = processList.loginTypes?.anonymous || {};

	useEffect(() => {
		const unsubscribe = listenToMassConsensusProcess(statementId)

		return () => {
			unsubscribe()
		}
	}, [])

	function handleSetCheckbox(loginType: LoginType) {

		updateMassConsensusLoginTypeProcess(statementId, loginType)

	}

	return (
		<div className={styles.mcProcess}>
			<h3>{t("Mass Consensus Process Settings")}</h3>

			<ProcessSetting steps={stepsDefault} processName={processNameDefault} loginType={LoginType.default} />
			<div className={styles.checkboxContainer} onClick={() => handleSetCheckbox(LoginType.google)}>
				{showGoogle && <CheckBoxCheckIcon className={styles.checkbox} />}
				{!showGoogle && <CheckBoxIcon className={styles.checkbox} />}
				<span>{t("Google")}</span>
			</div>
			{processList.loginTypes.google && <ProcessSetting steps={stepsGoogle} processName={processNameGoogle} loginType={LoginType.google} />}
			<div className={styles.checkboxContainer} onClick={() => handleSetCheckbox(LoginType.anonymous)}>
				{showAnonymous && <CheckBoxCheckIcon className={styles.checkbox} />}
				{!showAnonymous && <CheckBoxIcon className={styles.checkbox} />}
				<span>{t("Anonymous")}</span>
			</div>
			{processList.loginTypes.anonymous && <ProcessSetting steps={stepsAnonymous} processName={processNameAnonymous} loginType={LoginType.anonymous} />}
		</div>
	)
}

export default MassConsensusProcessSettings