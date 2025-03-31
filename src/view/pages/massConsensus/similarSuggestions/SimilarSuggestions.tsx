import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { selectSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import SimilarCard from './similarCard/SimilarCard';
import {
	Statement,
	MassConsensusPageUrls,
	GeneratedStatement,
} from 'delib-npm';
import styles from './SimilarSuggestions.module.scss';
import { useSimilarSuggestions } from './SimilarSuggestionVM';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import Loader from '@/view/components/loaders/Loader';

const SimilarSuggestions = () => {
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	const { handleSetSuggestionToDB, loading } = useSimilarSuggestions();
	const similarSuggestions = useSelector(selectSimilarStatements);
	const { t } = useUserConfig();

	const [selected, setSelected] = React.useState<number | null>(null);

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('similar suggestions'),
			backTo: MassConsensusPageUrls.initialQuestion,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	function handleSelect(index: number) {
		setSelected(index);
	}
	useEffect(() => {
		if (similarSuggestions.length === 0)
			navigate(`/mass-consensus/${statementId}/introduction`);
	}, [similarSuggestions, navigate, statementId]);

	return (
		<>
			<TitleMassConsensus title={t('Thank you for the suggestion!')} />
			<h3>{t('Here are similar suggestions. which one fits best?')}</h3>
			<div className={styles['similar-suggestions']}>
				{similarSuggestions.map(
					(
						suggestion: Statement | GeneratedStatement,
						index: number
					) => (
						<SimilarCard
							key={index}
							statement={suggestion}
							isUserStatement={index === 0}
							selected={selected !== null && selected === index}
							index={index}
							handleSelect={handleSelect}
						/>
					)
				)}
			</div>
			<FooterMassConsensus
				goTo={MassConsensusPageUrls.topSuggestions}
				isNextActive={selected !== null && !loading}
				onNext={() =>
					handleSetSuggestionToDB(similarSuggestions[selected])
				}
			/>
			{loading && <Loader /> /* TODO: insert designed mass-consensus loader */}
		</>
	);
};

export default SimilarSuggestions;
