import { FC, ReactNode } from "react";
import "./Modal.scss";
import { useClickOutside } from "@/controllers/hooks/useClickOutside";

interface Props {
	className?: string;
	children: ReactNode;
	closeModal?: (e?: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
}

const Modal: FC<Props> = ({ children, className = "", closeModal }) => {
	const modalRef = useClickOutside(() => {
		closeModal && closeModal();
	  });

	const handleContentClick = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
		e.stopPropagation();
	};

	return (
		<div
			className={`modal ${className}`}
			onClick={closeModal}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === 'Space') {
					closeModal && closeModal(e as React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div
				ref={modalRef}
				className="modal-content"
				onClick={handleContentClick}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === 'Space') {
						handleContentClick(e);
					}
				}}
				role="button"
				tabIndex={0}
			>
				{children}
			</div>
		</div>
	);
};

export default Modal;
