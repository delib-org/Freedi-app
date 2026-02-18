import React, { FC } from 'react';
import { Link } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SuggestionCard from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';
import manWithIdeaLamp from '@/assets/images/manWithIdeaLamp.png';
import Smile from '@/assets/icons/smile.svg?react';
import styles from '../MultiStageQuestion.module.scss';

interface SolutionsSectionProps {
	statement: Statement;
	topSuggestions: Statement[];
	hasTopSuggestions: boolean;
}

export const SolutionsSection: FC<SolutionsSectionProps> = ({
	statement,
	topSuggestions,
	hasTopSuggestions,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles.stageCard} id="solution">
			<div className={styles.imgContainer}>
				<img className={styles.graphic} src={manWithIdeaLamp} alt="man With Idea Lamp Graphic" />
			</div>
			<div className={styles.topicDescription}>
				<Smile />
				<h4>{t('Top solutions')}</h4>
			</div>
			<div className={styles.subDescription}>
				<h5>{t('Solutions for discussed issue')}</h5>
			</div>
			<div className={styles.suggestionsWrapper}>
				{hasTopSuggestions &&
					topSuggestions.map((suggestion) => (
						<SuggestionCard
							key={suggestion.statementId}
							statement={suggestion}
							parentStatement={statement}
						/>
					))}
				<div className={`btns ${styles['add-stage']}`}>
					<Link to={`/stage/${statement.statementId}`} state={{ from: window.location.pathname }}>
						<button className="btn btn--primary">
							{t(hasTopSuggestions ? 'See all suggestions' : 'Add new suggestion')}
						</button>
					</Link>
					<Link to={`/my-suggestions/statement/${statement.statementId}`}>
						<button className="btn btn--secondary">{t('View My Suggestions')}</button>
					</Link>
				</div>
			</div>
		</div>
	);
};
