import { FC, KeyboardEvent, useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';

// Styles
import styles from './SuggestionChat.module.scss';

// Components
import Evaluation from '../statement/components/evaluations/components/evaluation/Evaluation';
import ChatInput from '../statement/components/chat/components/input/ChatInput';
import SuggestionComment from './suggestionComment/SuggestionComment';

// Redux selectors
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

// API functions
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { Statement, ParagraphType } from '@freedi/shared-types';
import Text from '@/view/components/text/Text';
import {
	getParagraphsText,
	hasParagraphsContent,
	generateParagraphId,
} from '@/utils/paragraphUtils';

const SuggestionChat = () => {
	// Hooks and state
	const { statementId } = useParams();
	const creator = useSelector(creatorSelector);
	const statement = useSelector(statementSelector(statementId));
	const comments = useSelector(statementSubsSelector(statementId));

	// Return early if critical data is missing
	if (!statement || !creator) {
		return <div className={styles.suggestionChat}>Loading...</div>;
	}

	// Derived state - now safe to access
	const isStatementCreator = statement?.creator?.uid === creator?.uid;
	const hasCreatorCommented = comments.some((comment) => comment?.creator?.uid === creator?.uid);

	// Component render
	return (
		<div className={styles.suggestionChat}>
			<div className={styles['suggestionChat__description']}>
				<StatementDescription statement={statement} isStatementCreator={isStatementCreator} />
			</div>

			<p className={styles['suggestionChat__explain']}>כמה את/ה מרוצה מההצעה?</p>

			<div className={styles.evaluationPanel}>
				<Evaluation statement={statement} />
			</div>

			<p className={styles['suggestionChat__comments']}>
				{!isStatementCreator
					? 'כתוב/כתבי ההערה כדי לסייע למציע ההצעה לשפר את ההצעה'
					: 'כאן יכתבו הערות להצעתך'}
			</p>

			<div className={styles.comments}>
				{comments.map((comment) => (
					<SuggestionComment
						key={comment.statementId}
						statement={comment}
						parentStatement={statement}
					/>
				))}
			</div>

			{statement && !hasCreatorCommented && !isStatementCreator && (
				<div className={styles.chatInput}>
					<ChatInput statement={statement} hasEvaluation={true} />
				</div>
			)}
		</div>
	);
};

interface StatementDescriptionProps {
	statement: Statement; // Replace with your actual Statement type
	isStatementCreator: boolean;
}

const StatementDescription: FC<StatementDescriptionProps> = ({ statement, isStatementCreator }) => {
	const [editDescription, setEditDescription] = useState<boolean>(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Function to adjust textarea height
	const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	};

	// Adjust height when entering edit mode
	useEffect(() => {
		if (editDescription && textareaRef.current) {
			adjustTextareaHeight(textareaRef.current);
			textareaRef.current.focus();
		}
	}, [editDescription]);

	const handleEditDescription = (): void => {
		setEditDescription(true);
	};

	const handleTextareaChange = () => {
		if (textareaRef.current) {
			adjustTextareaHeight(textareaRef.current);
		}
	};

	// Helper to convert text to paragraphs
	const textToParagraphs = (text: string) => {
		if (!text.trim()) return undefined;
		const lines = text.split('\n').filter((line) => line.trim());

		return lines.map((line, index) => ({
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: line,
			order: index,
		}));
	};

	const handleUpdateDescription = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === 'Enter' && e.shiftKey === false) {
			e.preventDefault(); // Prevent new line on Enter
			updateStatementText(statement, undefined, textToParagraphs(e.currentTarget.value));
			setEditDescription(false);
		}
	};

	const handleBlur = () => {
		// Optional: Save on blur
		if (textareaRef.current) {
			updateStatementText(statement, undefined, textToParagraphs(textareaRef.current.value));
		}
		setEditDescription(false);
	};

	const paragraphsText = getParagraphsText(statement.paragraphs);

	if (!hasParagraphsContent(statement.paragraphs) && !editDescription) {
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
			defaultValue={paragraphsText}
			onKeyDown={handleUpdateDescription} // Changed from onKeyUp to onKeyDown for better prevention
			onInput={handleTextareaChange}
			onBlur={handleBlur}
			autoFocus
			style={{
				width: '100%',
				minHeight: '2rem',
				resize: 'none',
				overflow: 'hidden',
				padding: '8px',
				boxSizing: 'border-box',
			}}
		/>
	) : (
		<button
			onClick={isStatementCreator ? handleEditDescription : undefined}
			style={{ cursor: isStatementCreator ? 'pointer' : 'default' }}
		>
			<div className={styles['suggestionChat__description-text']}>
				<Text description={paragraphsText} />
			</div>
		</button>
	);
};
export default SuggestionChat;
