import React, { useEffect } from 'react'
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { useNavigate, useParams } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { MassConsensusPageUrls } from '@/types/enums';
import { useSelector } from 'react-redux';
import { selectSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';

const SimilarSuggestions = () => {
	const navigate = useNavigate();
	const { dir } = useParamsLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const similarSuggestions = useSelector(selectSimilarStatements);

	useEffect(() => {

		if (similarSuggestions.length === 0) navigate(`/mass-consensus/${statementId}/introduction`)
	}, [similarSuggestions, navigate, statementId])

	return (
		<div style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.initialQuestion} />
			<h3>Similar Suggestions</h3>
			<ul>
				{similarSuggestions.map((suggestion, index) => (
					<li key={index}>{suggestion.statement}</li>
				))}
			</ul>

		</div>
	)
}

export default SimilarSuggestions