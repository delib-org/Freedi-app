import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import styles from './MassConsensusProcessSettings.module.scss'
import ProcessSetting from './ProcessSetting/ProcessSetting'

const MassConsensusProcessSettings = () => {
	const { t } = useUserConfig()

	return (
		<div className={styles.mcProcess}>
			<h3>{t("Mass Consensus Process Settings")}</h3>
			<ProcessSetting />
		</div>
	)
}

export default MassConsensusProcessSettings