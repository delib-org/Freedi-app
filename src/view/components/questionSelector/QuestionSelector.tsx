import React, { FC, useContext, useState } from 'react';
import { FileText, HelpCircle, Users } from 'lucide-react';
import styles from './QuestionSelector.module.scss';
import { QuestionType } from 'delib-npm';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { updateQuestionType } from '@/controllers/db/statementSettings/setStatementSettings';


interface Stage {
	id: number;
	icon: React.FC<React.SVGProps<SVGSVGElement>>;
	title: string;
	type: QuestionType;
	content: {
		title: string;
		description: string;
	};
}

const QuestionSelector: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t } = useLanguage();
	const handleChangeQuestionType = (ev: React.ChangeEvent<HTMLSelectElement>) => {
		if (statement)
			updateQuestionType({ statement, newValue: ev.target.value as QuestionType });
	}


	return (
		<select onChange={handleChangeQuestionType} className={styles.questionSelector} defaultValue={statement?.questionSettings?.questionType ?? QuestionType.simple}>
			<option value={QuestionType.simple}>{t("Simple Question")}</option>
			<option value={QuestionType.document}>{t("Multistage question")}</option>
			<option value={QuestionType.massConsensus}>{t("Mass Consensus")}</option>
		</select>
	)
};

export default QuestionSelector;