import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import type { InheritedQuestion } from '@/types/demographics';
import InheritanceSwitch from '@/view/components/atomic/molecules/InheritanceSwitch';
import { buildPeopleAnchorPath } from '../../../host/hostHubLogic';
import styles from './InheritedJoinQuestions.module.scss';

interface InheritedJoinQuestionsProps {
	questions: ReadonlyArray<InheritedQuestion>;
	groupId: string;
	/** Ask (true) or skip (false) one inherited question here. */
	onAskChange: (questionId: string, ask: boolean) => void;
	/** Back to "Same as the group": ask every inherited question again. */
	onAskAll: () => void;
}

/**
 * Questions on joining that a sub-space inherits from the group, through the
 * one inheritance idiom: "Same as the group" lists them read-only; "Change for
 * this question" puts an "Ask" checkbox on each. Persists through the caller
 * to `statementSettings.excludedInheritedDemographicIds`, as before.
 */
const InheritedJoinQuestions: FC<InheritedJoinQuestionsProps> = ({
	questions,
	groupId,
	onAskChange,
	onAskAll,
}) => {
	const { t } = useTranslation();
	const isAskingAll = questions.every((question) => question.isEnabled);
	const [isInherited, setIsInherited] = useState(isAskingAll);

	useEffect(() => {
		if (!isAskingAll) setIsInherited(false);
	}, [isAskingAll]);

	function handleInheritChange(nextInherited: boolean): void {
		setIsInherited(nextInherited);
		if (nextInherited && !isAskingAll) onAskAll();
	}

	const sources = [...new Set(questions.map((question) => question.sourceStatementTitle))];
	const caption = fillPlaceholders(t('people.joinQuestions.fromGroup'), {
		name: sources.join(', '),
	});

	return (
		<InheritanceSwitch
			isInherited={isInherited}
			onChange={handleInheritChange}
			inheritLabel={t('people.sameAsGroup')}
			overrideLabel={t('people.changeHere')}
			groupLabel={t('people.joinQuestions')}
			caption={caption}
		>
			<ol className={styles.list}>
				{questions.map((question) => (
					<li key={question.userQuestionId} className={styles.row}>
						<span className={styles.question} dir="auto">
							{question.question}
						</span>
						{!isInherited && (
							<label className={styles.ask}>
								<input
									type="checkbox"
									checked={question.isEnabled}
									onChange={(e) => onAskChange(question.userQuestionId ?? '', e.target.checked)}
									aria-label={`${t('people.joinQuestions.ask')}: ${question.question}`}
								/>
								<span aria-hidden="true">{t('people.joinQuestions.ask')}</span>
							</label>
						)}
					</li>
				))}
			</ol>
			{isInherited && (
				<Link to={buildPeopleAnchorPath(groupId, 'questions')} className={styles.editLink}>
					{t('people.joinQuestions.editInGroup')}
				</Link>
			)}
		</InheritanceSwitch>
	);
};

export default InheritedJoinQuestions;
