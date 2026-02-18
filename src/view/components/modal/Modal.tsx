import React, { FC, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.scss';

interface Props {
	className?: string;
	children: ReactNode;
	closeModal?: (e: React.MouseEvent<HTMLDivElement>) => void;
	title?: string;
}

const Modal: FC<Props> = ({ children, className = '', closeModal, title }) => {
	const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (closeModal && e.key === 'Escape') {
			closeModal(e as unknown as React.MouseEvent<HTMLDivElement>);
		}
	};

	const modalContent = (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title || 'Modal'}
			className={`${styles.modal} ${className}`}
			onClick={closeModal}
			onKeyDown={handleKeyDown}
			tabIndex={-1}
		>
			<div
				className={styles.modalContent}
				onClick={handleContentClick}
				onKeyDown={(e) => e.stopPropagation()}
				tabIndex={0}
			>
				{children}
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
};

export default Modal;
