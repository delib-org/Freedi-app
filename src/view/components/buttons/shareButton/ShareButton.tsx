import { useState } from 'react';
import styles from './ShareButton.module.scss';
import LinkIcon from '@/assets/icons/shareIcon.svg?react';
import ShareModal from '@/view/components/shareModal/ShareModal';

interface ShareButtonProps {
	readonly title?: string;
	readonly text?: string;
	readonly url?: string;
}

function ShareButton({ title, text, url }: ShareButtonProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);

	const shareUrl = url || window.location.pathname;

	const handleOpenModal = () => {
		setIsModalOpen(true);
	};

	const handleCloseModal = () => {
		setIsModalOpen(false);
	};

	return (
		<>
			<button onClick={handleOpenModal} className={styles.shareButton}>
				<LinkIcon />
				{text}
			</button>
			<ShareModal isOpen={isModalOpen} onClose={handleCloseModal} url={shareUrl} title={title} />
		</>
	);
}

export default ShareButton;
