import React, { FC, useContext } from 'react';
import styles from './QuestionSelector.module.scss';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateQuestionType } from '@/controllers/db/statementSettings/setStatementSettings';
import { Link } from 'react-router';
import { MassConsensusPageUrls, QuestionType } from 'delib-npm';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';

const QuestionSelector: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t, currentLanguage } = useTranslation();
	const handleChangeQuestionType = (
		ev: React.ChangeEvent<HTMLSelectElement>
	) => {
		if (statement)
			updateQuestionType({
				statement,
				newValue: ev.target.value as QuestionType,
			});
	};

	return (
		<>
			<select
				onChange={handleChangeQuestionType}
				className={styles.questionSelector}
				defaultValue={
					statement?.questionSettings?.questionType ??
					getDefaultQuestionType()
				}
			>
				<option value={QuestionType.multiStage}>
					{t('Simple Question')}
				</option>
				<option value={QuestionType.massConsensus}>
					{t('Mass Consensus')}
				</option>
			</select>
			{statement?.questionSettings?.questionType ===
				QuestionType.massConsensus && (
					<Link
						to={`/mass-consensus/${statement.statementId}/${MassConsensusPageUrls.introduction}?lang=${currentLanguage}`}
					>
						{t('Mass Consensus')}
					</Link>
				)}
		</>
	);
};

export default QuestionSelector;
