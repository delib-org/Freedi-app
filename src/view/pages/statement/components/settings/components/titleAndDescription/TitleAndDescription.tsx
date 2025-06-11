import { FC, useEffect, useRef, useState } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import './TitleAndDescription.scss';
import VisuallyHidden from '@/view/components/accessibility/toScreenReaders/VisuallyHidden';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { useNavigate } from 'react-router';
import { useProfanityCheck } from '@/controllers/hooks/useProfanityCheck';

interface Props extends StatementSettingsProps {
	onSubmit: (fullText: string) => void;
}

const TitleAndDescription: FC<Props> = ({ statement, onSubmit }) => {
	const { t } = useUserConfig();
	const navigate = useNavigate();

	const arrayOfStatementParagraphs = statement?.statement.split('\n') || [];
	const [title, setTitle] = useState(arrayOfStatementParagraphs[0]);
	const [description, setDescription] = useState(
		arrayOfStatementParagraphs.slice(1).join('\n')
	);

	const titleInputRef = useRef<HTMLInputElement>(null);
	const { validateText, isChecking, error } = useProfanityCheck();

	useEffect(() => {
		if (titleInputRef.current) {
			titleInputRef.current.focus();
		}
	}, []);

	const handleSubmit = async () => {
		const fullText = `${title}\n${description}`;
		const isClean = await validateText(fullText);

		if (!isClean) return;
		onSubmit(fullText);
	};

	return (
		<div className='title-and-description'>
			<label htmlFor='statement-title'>
				<VisuallyHidden labelName={t('Group Title')} />
				<input
					id='statement-title'
					data-cy='statement-title'
					ref={titleInputRef}
					type='text'
					name='statement'
					placeholder={t('Group Title')}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
				/>
			</label>

			<label htmlFor='statement-description'>
				<VisuallyHidden labelName={t('Group Description')} />
				<textarea
					id='statement-description'
					name='description'
					placeholder={t('Group Description')}
					rows={3}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</label>

			{error && (
				<p style={{ color: 'red', fontSize: '0.9rem', marginTop: '0.5rem' }}>
					{error}
				</p>
			)}

			<div className='btns'>
				<Button
					text={isChecking ? t('Checking...') : t('Save')}
					aria-label='Submit button'
					data-cy='settings-statement-submit-btn'
					type='button'
					onClick={handleSubmit}
				/>
				<Button
					text={t('Cancel')}
					type='button'
					buttonType={ButtonType.SECONDARY}
					aria-label='Cancel button'
					data-cy='settings-statement-cancel-btn'
					onClick={() => navigate('/home')}
				/>
			</div>
		</div>
	);
};

export default TitleAndDescription;