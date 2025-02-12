import { useEffect, useState } from 'react'
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import { MassConsensusPageUrls } from '@/types/enums'
import { useParams } from 'react-router'
import { Statement } from '@/types/statement/statementTypes'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'

const RandomSuggestions = () => {
	const { statementId } = useParams<{ statementId: string }>()
	const [statements, setStatements] = useState<Statement[]>([]);
	useEffect(() => {
		if (statementId) {
			fetch(`http://localhost:5001/delib-v3-dev/us-central1/getRandomStatements?parentId=${statementId}&limit=2`)
				.then((response) => {
					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					return response.json();
				})
				.then((data) => {
					// const statementValues = data.options.map(item => item.statement);
					// setStatements(statementValues);
					setStatements(data.randomStatements);
				})
				.catch((error) => {
					console.error('Error:', error);
				});
		} else {
			setStatements([]);
		}
	}, [statementId]);

	return (
		<>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.initialQuestion} />
			<div>RandomSuggestions</div>
			<SuggestionCards randomSubStatements={statements} />
		</>

	)
}

export default RandomSuggestions