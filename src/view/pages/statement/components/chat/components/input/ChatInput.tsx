import React, { FC, useState, useEffect, useRef } from 'react';
import styles from './ChatInput.module.scss';
// Third Party Imports

// Icons
import { handleAddStatement } from './StatementInputCont';

// Redux Store
import useStatementColor from '@/controllers/hooks/useStatementColor';
import SendIcon from '@/view/components/icons/SendIcon';
import { Statement } from '@/types/statement/StatementTypes';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	statement: Statement;
}

const ChatInput: FC<Props> = ({ statement }) => {
	if (!statement) throw new Error('No statement');

	// Redux hooks
	const { t, rowDirection } = useUserConfig();
	const { user } = useAuthentication();

	const statementColor = useStatementColor({ statement });
	const [message, setMessage] = useState('');

	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.focus();
		}
	}, []);

	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		try {
			const _isMobile =
				!!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
					navigator.userAgent
				);

			if (e.key === 'Enter' && !e.shiftKey && !_isMobile) {
				handleSubmitInput(e);
			}
		} catch (error) {
			console.error(error);
		}
	}

	const handleSubmitInput = (
		e:
			| React.FormEvent<HTMLFormElement>
			| React.KeyboardEvent<HTMLTextAreaElement>
	) => {
		e.preventDefault();

		// Create statement
		handleAddStatement(message, statement, user);

		setMessage('');
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	return (
		<div className={styles.chatInput}>
			<form
				onSubmit={(e) => handleSubmitInput(e)}
				name='theForm'
				style={{ flexDirection: rowDirection }}
			>
				<textarea
					style={{
						borderTop: `2px solid ${statementColor.backgroundColor}`,
						minHeight: '40px', // Add minimum height
						resize: 'none', // Prevent manual resizing since we're handling it
						overflow: 'hidden', // Hide scrollbar since we're auto-expanding
					}}
					data-cy='statement-chat-input'
					className='page__footer__form__input'
					aria-label='Form Input'
					name='newStatement'
					ref={textareaRef}
					onKeyUp={(e) => handleKeyUp(e)}
					value={message}
					onInput={adjustTextareaHeight}
					onChange={(e) => {
						setMessage(e.target.value);
						adjustTextareaHeight(); // Call height adjustment on change
					}}
					required
					placeholder={t('Type your message here...')}
				></textarea>
				<button
					type='submit'
					aria-label='Submit Button'
					style={statementColor}
					data-cy='statement-chat-send-btn'
				>
					<SendIcon color={statementColor.color} />
				</button>
			</form>
		</div>
	);
};

export default ChatInput;
