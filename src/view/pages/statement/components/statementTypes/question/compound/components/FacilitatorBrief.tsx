import { FC, useState, useCallback, useRef, useEffect } from 'react';
import { updateDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from '../CompoundQuestion.module.scss';

interface FacilitatorBriefProps {
	statement: Statement;
	isAdmin: boolean;
}

const FacilitatorBrief: FC<FacilitatorBriefProps> = ({ statement, isAdmin }) => {
	const { t } = useTranslation();
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState(statement.brief ?? '');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setEditText(statement.brief ?? '');
	}, [statement.brief]);

	useEffect(() => {
		if (editing && textareaRef.current) {
			const ta = textareaRef.current;
			ta.focus();
			ta.selectionStart = ta.value.length;
			ta.style.height = 'auto';
			ta.style.height = `${ta.scrollHeight}px`;
		}
	}, [editing]);

	const handleSave = useCallback(async () => {
		const trimmed = editText.trim();
		if (trimmed === (statement.brief ?? '')) {
			setEditing(false);

			return;
		}
		try {
			const ref = createStatementRef(statement.statementId);
			await updateDoc(ref, { brief: trimmed, lastUpdate: getCurrentTimestamp() });
			setEditing(false);
		} catch (error) {
			logError(error, {
				operation: 'compound.updateFacilitatorBrief',
				statementId: statement.statementId,
			});
		}
	}, [editText, statement.brief, statement.statementId]);

	const handleCancel = useCallback(() => {
		setEditText(statement.brief ?? '');
		setEditing(false);
	}, [statement.brief]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	}, [handleSave, handleCancel]);

	if (editing) {
		return (
			<div className={styles.facilitatorEdit}>
				<textarea
					ref={textareaRef}
					className={styles.facilitatorTextarea}
					value={editText}
					onChange={(e) => {
						setEditText(e.target.value);
						e.target.style.height = 'auto';
						e.target.style.height = `${e.target.scrollHeight}px`;
					}}
					onKeyDown={handleKeyDown}
					placeholder={t('Write background context for participants...')}
					rows={2}
				/>
				<div className={styles.facilitatorEditActions}>
					<button
						className={styles.facilitatorSaveBtn}
						onClick={handleSave}
						aria-label={t('Save')}
					>
						&#10003;
					</button>
					<button
						className={styles.facilitatorCancelBtn}
						onClick={handleCancel}
						aria-label={t('Cancel')}
					>
						&#10005;
					</button>
				</div>
			</div>
		);
	}

	const briefText = statement.brief;

	if (!briefText && !isAdmin) return null;

	return (
		<p
			className={`${styles.facilitatorBrief} ${isAdmin ? styles.facilitatorBriefEditable : ''}`}
			onClick={isAdmin ? () => setEditing(true) : undefined}
			role={isAdmin ? 'button' : undefined}
			tabIndex={isAdmin ? 0 : undefined}
			onKeyDown={isAdmin ? (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					setEditing(true);
				}
			} : undefined}
		>
			{briefText || t('Click to add background context...')}
		</p>
	);
};

export default FacilitatorBrief;
