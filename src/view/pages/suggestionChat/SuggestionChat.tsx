import { FC, KeyboardEvent, useState, useRef, useEffect } from 'react';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { Statement } from 'delib-npm';
import Text from '@/view/components/text/Text';
import styles from './SuggestionChat.module.scss';
import { useProfanityCheck } from '@/controllers/hooks/useProfanityCheck';

interface StatementDescriptionProps {
	statement: Statement;
	isStatementCreator: boolean;
}

const StatementDescription: FC<StatementDescriptionProps> = ({
	statement,
	isStatementCreator
}) => {
	const [editDescription, setEditDescription] = useState<boolean>(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { validateText, isChecking } = useProfanityCheck();

	useEffect(() => {
		if (editDescription && textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
			textareaRef.current.focus();
		}
	}, [editDescription]);

	const handleEditDescription = () => setEditDescription(true);

	const handleTextareaChange = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	const handleUpdateDescription = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			const newDesc = e.currentTarget.value;

			const isClean = await validateText(newDesc);
			if (!isClean) {
				alert('Inappropriate language is not allowed.');

				return;
			}

			await updateStatementText(statement, undefined, newDesc);
			setEditDescription(false);
		}
	};

	const handleBlur = async () => {
		if (textareaRef.current) {
			const newDesc = textareaRef.current.value;
			const isClean = await validateText(newDesc);

			if (!isClean) {
				alert('Inappropriate language is not allowed.');
				textareaRef.current.focus();

				return;
			}

			await updateStatementText(statement, undefined, newDesc);
		}
		setEditDescription(false);
	};

	if (!statement.description && !editDescription) {
		return isStatementCreator ? (
			<div className="btns">
				<button className="btn btn-primary" onClick={handleEditDescription}>
					הוספת תיאור
				</button>
			</div>
		) : null;
	}

	return editDescription ? (
		<textarea
			ref={textareaRef}
			defaultValue={statement.description}
			onKeyDown={handleUpdateDescription}
			onInput={handleTextareaChange}
			onBlur={handleBlur}
			autoFocus
			disabled={isChecking}
			style={{
				width: '100%',
				minHeight: '2rem',
				resize: 'none',
				overflow: 'hidden',
				padding: '8px',
				boxSizing: 'border-box'
			}}
		/>
	) : (
		<button
			onClick={isStatementCreator ? handleEditDescription : undefined}
			style={{ cursor: isStatementCreator ? 'pointer' : 'default' }}
		>
			<div className={styles["suggestionChat__description-text"]}>
				<Text description={statement.description} />
			</div>
		</button>
	);
};

export default StatementDescription;
