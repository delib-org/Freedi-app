import { FC, useEffect, useRef, useState } from 'react';

// Hooks & Helpers
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './TitleAndDescription.module.scss';
import VisuallyHidden from '@/view/components/accessibility/toScreenReaders/VisuallyHidden';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { useNavigate } from 'react-router';
import { GoogleDocsImportModal } from '@/view/components/googleDocsImport';

const TitleAndDescription: FC<StatementSettingsProps> = ({
	statement,
	setStatementToEdit,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [showImportModal, setShowImportModal] = useState(false);

	// * Variables * //
	const arrayOfStatementParagraphs = statement?.statement.split('\n') || [];
	const title = arrayOfStatementParagraphs[0];

	const description = arrayOfStatementParagraphs.slice(1).join('\n');

	const titleInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (titleInputRef.current) {
			titleInputRef.current.focus();
		}
	}, []);

	return (
		<div className={styles.titleAndDescription}>
			<label htmlFor='statement-title'>
				<VisuallyHidden labelName={t('Group Title')}></VisuallyHidden>
				<input
					id='statement-title'
					data-cy='statement-title'
					ref={titleInputRef}
					type='text'
					name='statement'
					placeholder={t('Group Title')}
					value={title}
					onChange={(e) => {
						const newTitle = e.target.value;
						setStatementToEdit({
							...statement,
							statement: `${newTitle}\n${description}`,
						});
					}}
					required={true}
				/>
			</label>
			<label htmlFor='statement-description'>
				<VisuallyHidden
					labelName={t('Group Description')}
				></VisuallyHidden>
				<textarea
					id='statement-description'
					name='description'
					placeholder={t('Group Description')}
					rows={3}
					defaultValue={statement.description}
					onChange={(e) => {
						const newDescription = e.target.value;
						setStatementToEdit({
							...statement,
							description: newDescription,
						});
					}}
				/>
			</label>
			<div className={styles.btns}>
				<Button
					text={t('Save')}
					aria-label='Submit button'
					data-cy='settings-statement-submit-btn'
					type='submit'
				/>
				<Button
					text={t('Cancel')}
					type='button'
					buttonType={ButtonType.SECONDARY}
					aria-label='Cancel button'
					data-cy='settings-statement-cancel-btn'
					onClick={() => {
						navigate('/home');
					}}
				/>
				<Button
					text={t('Import from Google Docs')}
					type='button'
					buttonType={ButtonType.SECONDARY}
					aria-label='Import from Google Docs'
					onClick={() => setShowImportModal(true)}
				/>
			</div>

			<GoogleDocsImportModal
				statement={statement}
				isOpen={showImportModal}
				onClose={() => setShowImportModal(false)}
				onImportComplete={() => {
					// Refresh the page to show imported content
					window.location.reload();
				}}
			/>
		</div>
	);
};

export default TitleAndDescription;
