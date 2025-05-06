import React, { FC, ReactNode } from "react";
import "./Modal.scss";

interface Props {
	className?: string;
	children: ReactNode;
	closeModal?: (e: React.MouseEvent<HTMLDivElement>) => void;
	title?: string;
}

const Modal: FC<Props> = ({ children, className = "", closeModal, title }) => {
	const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (closeModal && e.key === "Escape") {
			closeModal(e as unknown as React.MouseEvent<HTMLDivElement>);
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title || "Modal"}
			className={`modal ${className}`}
			onClick={closeModal}
			onKeyDown={handleKeyDown}
			tabIndex={-1}
		>
			<div
				className="modal-content"
				onClick={handleContentClick}
				onKeyDown={(e) => e.stopPropagation()}
				tabIndex={0}
			>
				{children}
			</div>
		</div>
	);
};

export default Modal;