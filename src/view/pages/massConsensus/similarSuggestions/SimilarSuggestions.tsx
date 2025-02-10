import React, { useEffect } from 'react'
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { useNavigate, useParams } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { MassConsensusPageUrls } from '@/types/enums';
import { useSelector } from 'react-redux';
import { selectSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import SimilarCard from './similarCard/SimilarCard';
import { Statement } from '@/types/statement';
import { GeneratedStatement } from '@/types/massConsensus/massConsensusModel';
import styles from './SimilarSuggestions.module.scss';

const SimilarSuggestions = () => {
	const navigate = useNavigate();
	const { dir } = useParamsLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const similarSuggestions = useSelector(selectSimilarStatements);

	const [selected, setSelected] = React.useState<number | null>(null);

	function handleSelect(index: number) {
		setSelected(index);
	}

	useEffect(() => {

		if (similarSuggestions.length === 0) navigate(`/mass-consensus/${statementId}/introduction`)
	}, [similarSuggestions, navigate, statementId])

	return (
		<div style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.initialQuestion} />
			<h3>Similar Suggestions</h3>
			<div className={styles["similar-suggestions__wrapper"]}>
				{similarSuggestions.map((suggestion: Statement | GeneratedStatement, index: number) => (
					<SimilarCard key={index} statement={suggestion} isUserStatement={index === 0} selected={selected !== null && selected === index} index={index} handleSelect={handleSelect} />
				))}
			</div>
			{selected !== null && <div className="btns">
				<button className='btn btn--secondary btn--large' onClick={() => navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.initialQuestion}`)}>Back</button>
				<button className='btn btn--primary btn--large' onClick={() => navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.randomSuggestions}`)}>Next</button>
			</div>}

		</div>
	)
}

export default SimilarSuggestions