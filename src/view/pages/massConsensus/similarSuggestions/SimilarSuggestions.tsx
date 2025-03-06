import React, { useEffect } from 'react';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { useNavigate, useParams } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useSelector } from 'react-redux';
import { selectSimilarStatements } from '@/redux/massConsensus/massConsensusSlice';
import SimilarCard from './similarCard/SimilarCard';
import { Statement, MassConsensusPageUrls, GeneratedStatement } from 'delib-npm';
import styles from './SimilarSuggestions.module.scss';
import { useSimilarSuggestions } from './SimilarSuggestionVM';
import { userSelector } from '@/redux/users/userSlice';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';

const SimilarSuggestions = () => {
	const navigate = useNavigate();
	const user = useSelector(userSelector);
	const { dir } = useParamsLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const { handleSetSuggestionToDB } = useSimilarSuggestions();
	const similarSuggestions = useSelector(selectSimilarStatements);
	const { t } = useLanguage();

	const [selected, setSelected] = React.useState<number | null>(null);

	function handleSelect(index: number) {
		setSelected(index);
	}

	useEffect(() => {
		if (!user) navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`);
	}, [user]);

	useEffect(() => {
		if (similarSuggestions.length === 0)
			navigate(`/mass-consensus/${statementId}/introduction`);
	}, [similarSuggestions, navigate, statementId]);

	return (
		<div className={styles['similar-suggestions']} style={{ direction: dir }}>
			<HeaderMassConsensus title={t('similar suggestions')} backTo={MassConsensusPageUrls.randomSuggestions} />
			<TitleMassConsensus title={t("Thank you for the suggestion!")} />
			<h3>{t("Here are similar suggestions. which one fits best?")}</h3>
			<div className={styles['similar-suggestions__wrapper']}>
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
				goTo={MassConsensusPageUrls.randomSuggestions}
				isNextActive={selected !== null}
				onNext={() => handleSetSuggestionToDB(similarSuggestions[selected])}
			/>
		</div>
	);
};

export default SimilarSuggestions;
