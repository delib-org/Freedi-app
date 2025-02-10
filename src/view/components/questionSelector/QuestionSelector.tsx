import React, { FC, useContext } from 'react';
import styles from './QuestionSelector.module.scss';
import { QuestionType } from 'delib-npm';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { updateQuestionType } from '@/controllers/db/statementSettings/setStatementSettings';
import { Link } from 'react-router';
import { MassConsensusPageUrls } from '@/view/pages/massConsensus/model/massConsensusModel';

const QuestionSelector: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t, currentLanguage } = useLanguage();
	const handleChangeQuestionType = (ev: React.ChangeEvent<HTMLSelectElement>) => {
		if (statement)
			updateQuestionType({ statement, newValue: ev.target.value as QuestionType });
	}

	return (
		<>
			<select onChange={handleChangeQuestionType} className={styles.questionSelector} defaultValue={statement?.questionSettings?.questionType ?? QuestionType.simple}>
				<option value={QuestionType.simple}>{t("Simple Question")}</option>
				<option value={QuestionType.document}>{t("Multistage question")}</option>
				<option value={QuestionType.massConsensus}>{t("Mass Consensus")}</option>
			</select>
			{statement?.questionSettings?.questionType === QuestionType.massConsensus && (<Link to={`/mass-consensus/${statement.statementId}/${MassConsensusPageUrls.Introduction}?lang=${currentLanguage}`}>{t("Mass Consensus")}</Link>)}
		</>
	)
};

export default QuestionSelector;