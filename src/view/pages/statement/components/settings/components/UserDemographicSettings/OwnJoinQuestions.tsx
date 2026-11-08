import { FC } from 'react';
import { ListChecks } from 'lucide-react';
import { UserDemographicQuestion } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button from '@/view/components/atomic/atoms/Button';
import EmptyState from '@/view/components/atomic/molecules/EmptyState';
import styles from './InheritedJoinQuestions.module.scss';

interface OwnJoinQuestionsProps {
	questions: ReadonlyArray<UserDemographicQuestion>;
	/** Inherited questions are listed above; then "No questions yet" would be untrue. */
	hasInherited: boolean;
	/** Opens the question editor (add, edit, delete, "Apply to all sub-discussions"). */
	onOpenEditor: () => void;
}

/**
 * The questions this space asks on joining, one line each, and the button
 * that opens the question editor (UX §3.9). Replaces the "Survey" button.
 */
const OwnJoinQuestions: FC<OwnJoinQuestionsProps> = ({ questions, hasInherited, onOpenEditor }) => {
	const { t } = useTranslation();

	return (
		<>
			{questions.length > 0 && (
				<ol className={styles.list}>
					{questions.map((question) => (
						<li key={question.userQuestionId} className={styles.row}>
							<span className={styles.question} dir="auto">
								{question.question}
							</span>
							<Button
								text={t('Edit')}
								ariaLabel={`${t('Edit')}: ${question.question}`}
								variant="secondary"
								size="small"
								className="button--touch"
								onClick={onOpenEditor}
							/>
						</li>
					))}
				</ol>
			)}
			{questions.length === 0 && !hasInherited && (
				<EmptyState compact icon={<ListChecks />} text={t('No questions yet')} />
			)}
			<div>
				<Button
					text={t('people.addQuestion')}
					variant="primary"
					size="small"
					className="button--touch"
					onClick={onOpenEditor}
				/>
			</div>
		</>
	);
};

export default OwnJoinQuestions;
