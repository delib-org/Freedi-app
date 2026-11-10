import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ScoreGate from '../../../../questionScreen/ScoreGate';
import styles from '../CompoundQuestion.module.scss';

interface LeadingSuggestionProps {
	option: Statement;
	isHost: boolean;
}

/** Naming the leader is itself a result, so the whole box waits behind the score guard. */
const LeadingSuggestion: FC<LeadingSuggestionProps> = ({ option, isHost }) => {
	const { t } = useTranslation();

	return (
		<ScoreGate answer={option} isHost={isHost}>
			<div className={styles.topSuggestion} data-testid="leading-suggestion">
				<span className={styles.topSuggestionLabel}>{t('Leading suggestion')}</span>
				<p className={styles.topSuggestionText}>{option.statement}</p>
				<span className={styles.topSuggestionConsensus}>
					{t('Agreement score')}: {Math.round((option.consensus ?? 0) * 100)}%
				</span>
			</div>
		</ScoreGate>
	);
};

export default LeadingSuggestion;
