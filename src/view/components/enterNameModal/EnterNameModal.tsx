import React, { FC, useEffect, useRef, useState } from 'react';

// Styles
import Button, { ButtonType } from '../buttons/button/Button';
import Modal from '../modal/Modal';
import styles from './enterNameModal.module.scss';

// Custom components

// Functions
import { signAnonymously } from '@/controllers/db/authenticationUtils';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	closeModal: VoidFunction;
}

const EnterNameModal: FC<Props> = ({ closeModal }) => {
	const [displayName, setDisplayName] = useState<string | null>(null);
	const [showStartBtn, setShowStartBtn] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement>(null); // Create a ref for the input
		
	const { t } = useUserConfig();

	useEffect(() => {
		inputRef.current?.focus(); // Set focus on the input when the component mounts
	}, []);

	// Handle Enter key press to start
	useEffect(() => {
	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && isReadyToStart(displayName)) {
			handleStart();
		}
	};

	const inputElement = inputRef.current;
    if (inputElement) {
        inputElement.addEventListener('keydown', handleKeyDown);

        return () => {
            inputElement.removeEventListener('keydown', handleKeyDown);
        };
    }
	}, [displayName]);

	function handleSetName(ev: React.ChangeEvent<HTMLInputElement>) {
		setDisplayName(ev.target.value);
		setShowStartBtn(isReadyToStart(ev.target.value));
	}

	function handleStart() {
		try {
			if (isReadyToStart(displayName)) {
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
					ref={inputRef} // Assign the ref to the input
					className={styles.input}
					onChange={handleSetName}
					type='text'
					name='displayName'
					placeholder={t('Nickname')}
					autoComplete='off'
				/>
				<div className='btns'>
					<Button
						buttonType={ButtonType.PRIMARY}
						data-cy='anonymous-start-btn'
						text={t('Start')}
						onClick={handleStart}
						disabled={!showStartBtn}
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

function isReadyToStart(displayName: string | null) {
	return displayName !== null && displayName.length > 1; // Simplified condition
}
