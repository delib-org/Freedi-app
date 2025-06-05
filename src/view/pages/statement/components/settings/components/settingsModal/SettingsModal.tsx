import React from 'react'

import styles from './SettingsModal.module.scss';

interface Props {
	children?: React.ReactNode;
	closeModal?: () => void;
}

const SettingsModal: React.FC<Props> = ({ children, closeModal }) => {
	return (
		<div className={styles.modal}>

			{children}
			<div className="btns">
				<button className='btn btn--primary' onClick={closeModal}>Close</button>
			</div>
		</div>
	)
}

export default SettingsModal