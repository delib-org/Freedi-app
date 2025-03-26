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

	const { steps: stepsDefault, processName: processNameDefault } = processList.loginTypes.default
	const { steps: stepsGoogle, processName: processNameGoogle } = processList.loginTypes.google || {};
	const { steps: stepsAnonymous, processName: processNameAnonymous } = processList.loginTypes.anonymous || {};

	useEffect(() => {
		const unsubscribe = listenToMassConsensusProcess(statementId)

		return () => {
			unsubscribe()
		}
	}, [])

	return (
		<div className={styles.mcProcess}>
			<h3>{t("Mass Consensus Process Settings")}</h3>
			<ProcessSetting steps={stepsDefault} processName={processNameDefault} loginType={LoginType.default} />
			{processList.loginTypes.google && <ProcessSetting steps={stepsGoogle} processName={processNameGoogle} loginType={LoginType.google} />}
			{processList.loginTypes.anonymous && <ProcessSetting steps={stepsAnonymous} processName={processNameAnonymous} loginType={LoginType.anonymous} />}

		</div>
	)
}

export default MassConsensusProcessSettings