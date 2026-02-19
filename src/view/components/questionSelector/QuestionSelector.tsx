import React, { FC, useContext } from 'react';
import styles from './QuestionSelector.module.scss';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateQuestionType } from '@/controllers/db/statementSettings/setStatementSettings';
import { QuestionType } from '@freedi/shared-types';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import { getMassConsensusQuestionUrl } from '@/controllers/db/config';

const QuestionSelector: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t } = useTranslation();
	const handleChangeQuestionType = (ev: React.ChangeEvent<HTMLSelectElement>) => {
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
				defaultValue={statement?.questionSettings?.questionType ?? getDefaultQuestionType()}
			>
				<option value={QuestionType.multiStage}>{t('Simple Question')}</option>
				<option value={QuestionType.massConsensus}>{t('Mass Consensus')}</option>
			</select>
			{statement?.questionSettings?.questionType === QuestionType.massConsensus && statement && (
				<a
					href={getMassConsensusQuestionUrl(statement.statementId)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('Open Mass Consensus')}
				</a>
			)}
		</>
	);
};

export default QuestionSelector;
