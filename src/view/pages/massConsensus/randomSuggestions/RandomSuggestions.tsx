import { MassConsensusPageUrls } from '@/types/enums'
import React from 'react'
import { useNavigate, useParams } from 'react-router'

const RandomSuggestions = () => {
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	return (
		<>
			<div>RandomSuggestions</div>
			<button className='btn btn--secondary btn--large' onClick={() => navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.topSuggestions}`)}>Back</button>
		</>
	)
}

export default RandomSuggestions