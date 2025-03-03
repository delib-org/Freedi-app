import styles from './MassConsensus.module.scss'
import Description from '../../../evaluations/components/description/Description'
import { NavLink, useParams } from 'react-router'
import SuggestionCards from '../../../evaluations/components/suggestionCards/SuggestionCards'
import StatementBottomNav from '../../../nav/bottom/StatementBottomNav'
import { useLanguage } from '@/controllers/hooks/useLanguages'
import { MassConsensusTextTypes } from '@/types/massConsensus/massConsensusTypes'
import { useSelector } from 'react-redux'
import { selectMassConsensusTexts } from '@/redux/massConsensus/massConsensusSlice'
import { useEffect } from 'react'
import { listenToMassConsensusQuestion } from '@/controllers/db/massConsensus/getMassConsensus'
import { setMassConsensusTextsToDB } from '@/controllers/db/massConsensus/setMassConsensus'

const MassConsensus = () => {
	const { t } = useLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const massConsensusTexts = useSelector(selectMassConsensusTexts(statementId));

	useEffect(() => {
		const unsubscribe = listenToMassConsensusQuestion(statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	function handleUpdateMassConsensusTexts({ textType, text }: { textType: MassConsensusTextTypes, text: string }) {
		// Update the mass consensus texts
		setMassConsensusTextsToDB({ textType, text, statementId });
	}

	return (
		<div className={styles.massConsensus}>
			<div className="wrapper">
				<Description />
				<h3>{t("Information for participants about the upcoming stages")}:</h3>
				{Object.values(MassConsensusTextTypes).map((textType) => (
					<div key={textType}>
						<label htmlFor={textType}>{t(textType)}</label>
						<textarea
							id={textType}
							placeholder={`${t(`Explanation for`)} ${t(textType)}`}
							defaultValue={massConsensusTexts?.texts?.[textType]}
							onBlur={(e) =>
								handleUpdateMassConsensusTexts({
									textType,
									text: e.target.value,
								})
							}
						/>
					</div>
				))}
				<NavLink to={`/mass-consensus/${statementId}`}>
					This is the link to the Mass Consensus Question

				</NavLink>
				<SuggestionCards />
				<StatementBottomNav />

			</div>

		</div >
	)
}

export default MassConsensus