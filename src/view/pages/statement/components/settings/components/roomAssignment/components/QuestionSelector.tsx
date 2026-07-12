import { FC } from 'react';
import { UserDemographicQuestion } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import styles from '../RoomAssignment.module.scss';

interface QuestionSelectorProps {
	questions: UserDemographicQuestion[];
	selectedQuestionIds: string[];
	onToggle: (questionId: string) => void;
}

const QuestionSelector: FC<QuestionSelectorProps> = ({
	questions,
	selectedQuestionIds,
	onToggle,
}) => {
	const { t } = useTranslation();

	if (questions.length === 0) {
		return (
			<div className={styles.questionSelector__empty}>
				<p>{t('No demographic questions available')}</p>
				<p>{t('Add radio or checkbox questions in User Demographics settings first')}</p>
			</div>
		);
	}

	return (
		<div className={styles.questionSelector}>
			{questions.map((question) => {
				const questionId = question.userQuestionId ?? '';
				const isSelected = selectedQuestionIds.includes(questionId);
				const optionCount = question.options?.length || 0;

				return (
					<div
						key={questionId}
						className={`${styles.questionSelector__item} ${isSelected ? styles['questionSelector__item--selected'] : ''}`}
						onClick={() => onToggle(questionId)}
						role="checkbox"
						aria-checked={isSelected}
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onToggle(questionId);
							}
						}}
					>
						<div
							className={`${styles.questionSelector__checkbox} ${isSelected ? styles['questionSelector__checkbox--checked'] : ''}`}
						>
							{isSelected && <CheckIcon />}
						</div>
						<span className={styles.questionSelector__questionText}>{question.question}</span>
						{optionCount > 0 && (
							<span className={styles.questionSelector__optionCount}>
								{optionCount} {t('options')}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
};

export default QuestionSelector;
