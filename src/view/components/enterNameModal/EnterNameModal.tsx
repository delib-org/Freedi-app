import React, { FC, useEffect, useRef, useState } from 'react';

// Styles
import Button, { ButtonType } from '../buttons/button/Button';
import Modal from '../modal/Modal';
import styles from './enterNameModal.module.scss';

// Custom components

// Functions
import { signAnonymously } from '@/controllers/db/authenticationUtils';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useProfanityCheck } from '@/controllers/hooks/useProfanityCheck';

interface Props {
	closeModal: VoidFunction;
}

const EnterNameModal: FC<Props> = ({ closeModal }) => {
	const [displayName, setDisplayName] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null); // Create a ref for the input
	const { t } = useUserConfig();

	// ✅ Profanity filtering state
	const { validateText, isChecking, error } = useProfanityCheck();
	const [isValid, setIsValid] = useState(false);

	useEffect(() => {
		inputRef.current?.focus(); // Set focus on the input when the component mounts
	}, []);

	// ✅ Check profanity on change
	async function handleSetName(ev: React.ChangeEvent<HTMLInputElement>) {
		const value = ev.target.value;
		setDisplayName(value);

		if (value.length > 1) {
			const clean = await validateText(value);
			setIsValid(clean);
		} else {
			setIsValid(false);
		}
	}

	function handleStart() {
		try {
			if (displayName && displayName.length > 1 && isValid) {
				signAnonymously();
				const _displayName = displayName || 'Anonymous';
				localStorage.setItem('displayName', _displayName);
				closeModal();
			}
		} catch (error) {
			console.error(error);
		}
	}

	return (
		<Modal>
			<div className={styles.box} data-cy='anonymous-input'>
				<input
					ref={inputRef}
					className={styles.input}
					onChange={handleSetName}
					type='text'
					name='displayName'
					placeholder={t('Nickname')}
					autoComplete='off'
					value={displayName || ''}
				/>

				{/* ✅ Show profanity error */}
				{error && (
					<p style={{ color: 'red', fontSize: '0.9rem', marginTop: '0.5rem' }}>
						{error}
					</p>
				)}

				<div className='btns'>
					<Button
						buttonType={ButtonType.PRIMARY}
						data-cy='anonymous-start-btn'
						text={isChecking ? t('Checking...') : t('Start')}
						onClick={handleStart}
						disabled={!isValid || isChecking}
					/>
					<Button
						buttonType={ButtonType.SECONDARY}
						data-cy='anonymous-cancel-btn'
						text={t('Cancel')}
						onClick={closeModal}
					/>
				</div>
			</div>
		</Modal>
	);
};

export default EnterNameModal;
