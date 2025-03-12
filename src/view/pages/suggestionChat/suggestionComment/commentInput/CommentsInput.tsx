import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Statement, StatementType } from 'delib-npm';
import { KeyboardEvent } from 'react'

interface Props {
	statement: Statement;
	isCreator: boolean;
	previousEvaluation: string;
	evaluationChanged: boolean;
	setEvaluationChanged: (value: boolean) => void;
}

const CommentsInput = ({
	statement,
	isCreator,
	previousEvaluation,
	evaluationChanged,
	setEvaluationChanged
}: Props) => {
	const { t } = useUserConfig();
	function handleCommentSubmit(ev: KeyboardEvent<HTMLTextAreaElement>): void {
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			const target = ev.target as HTMLTextAreaElement;
			const text = target.value.trim();

			if (text) {
				const _text = !isCreator && evaluationChanged ? `, ${text} ${t('change to:')} :${previousEvaluation}` : text;
				// Add comment
				saveStatementToDB({
					text: _text,
					parentStatement: statement,
					statementType: StatementType.statement
				})
			}
			target.value = '';
			setEvaluationChanged(false);
		}
	}

	return (
		<textarea
			name="commentInput"
			onKeyUp={handleCommentSubmit}
			placeholder={t("Write your comment...")}
		></textarea>
	)
}) => {
	const { t } = useUserConfig();
	function handleCommentSubmit(ev: KeyboardEvent<HTMLTextAreaElement>): void {
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			const target = ev.target as HTMLTextAreaElement;
			const text = target.value.trim();

			if (text) {
				const _text = !isCreator && evaluationChanged ? `, ${text} ${t('change to:')} :${previousEvaluation}` : text;
				// Add comment
				saveStatementToDB({
					text: _text,
					parentStatement: statement,
					statementType: StatementType.statement
				})
			}
			target.value = '';
			setEvaluationChanged(false);
		}
	}

	return (
		<textarea
			name="commentInput"
			onKeyUp={handleCommentSubmit}
			placeholder={t("Write your comment...")}
		></textarea>
	)
}

export default CommentsInput