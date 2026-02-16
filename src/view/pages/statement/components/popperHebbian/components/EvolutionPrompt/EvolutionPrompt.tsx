import { FC } from 'react';
import { PopperHebbianScore } from '@/models/popperHebbian/ScoreModels';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EvolutionPrompt.module.scss';

interface EvolutionPromptProps {
	score: PopperHebbianScore;
	onCreateImprovedVersion: () => void;
}

const EvolutionPrompt: FC<EvolutionPromptProps> = ({ score, onCreateImprovedVersion }) => {
	const { t } = useTranslation();

	if (score.status !== 'needs-fixing') {
		return null;
	}

	const getChallengeSummary = (totalScore: number): string => {
		if (totalScore < -5) {
			return t(
				'This idea faces significant challenges from the community. Strong evidence contradicts key aspects of the proposal.',
			);
		} else if (totalScore < -2) {
			return t(
				'Multiple pieces of evidence challenge this idea. Consider addressing the main concerns raised.',
			);
		} else {
			return t(
				'Some evidence challenges aspects of this idea. You may want to refine or clarify it.',
			);
		}
	};

	return (
		<div className={styles.evolutionPrompt}>
			<div className={styles.promptHeader}>
				<div className={styles.aiGuide}>
					<span className={styles.aiIcon}>🤖</span>
					<span className={styles.aiLabel}>{t('AI Guide')}</span>
				</div>
			</div>

			<div className={styles.promptBody}>
				<h3 className={styles.promptTitle}>{t('Time to Evolve This Idea')}</h3>

				<p className={styles.challengeSummary}>{getChallengeSummary(score.totalScore)}</p>

				<div className={styles.evolutionExplanation}>
					<p>
						{t(
							'In the Popperian spirit, ideas that face strong challenges should evolve. Create an improved version that addresses the evidence while keeping what works.',
						)}
					</p>
				</div>
			</div>

			<div className={styles.promptFooter}>
				<button className={styles.evolveButton} onClick={onCreateImprovedVersion}>
					<span className={styles.evolveIcon}>🔄</span>
					{t('Create Improved Version')}
				</button>
			</div>
		</div>
	);
};

export default EvolutionPrompt;
