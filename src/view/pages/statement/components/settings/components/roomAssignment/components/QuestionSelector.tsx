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
				const isSelected = selectedQuestionIds.includes(question.userQuestionId);
				const optionCount = question.options?.length || 0;

				return (
					<div
						key={question.userQuestionId}
						className={`${styles.questionSelector__item} ${isSelected ? styles['questionSelector__item--selected'] : ''}`}
						onClick={() => onToggle(question.userQuestionId)}
						role="checkbox"
						aria-checked={isSelected}
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onToggle(question.userQuestionId);
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
