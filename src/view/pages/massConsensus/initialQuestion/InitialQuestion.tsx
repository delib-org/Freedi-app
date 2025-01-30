import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus"
import { MassConsensusPageUrls } from "../model/massConsensusModel"
import { useParamsLanguage } from "../useParamsLang/UseParamsLanguge"

const InitialQuestion = () => {
	const { dir } = useParamsLanguage()
	return (
		<div style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.Introduction} />
		</div>
	)
}

export default InitialQuestion