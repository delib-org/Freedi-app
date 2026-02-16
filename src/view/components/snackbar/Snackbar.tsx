import { FC, useEffect } from 'react';
import styles from './Snackbar.module.scss';

interface SnackbarProps {
	message: string;
	subMessage?: string;
	isVisible: boolean;
	duration?: number;
	onClose: () => void;
	type?: 'info' | 'success' | 'warning' | 'error';
}

const Snackbar: FC<SnackbarProps> = ({
	message,
	subMessage,
	isVisible,
	duration = 3000,
	onClose,
	type = 'info',
}) => {
	useEffect(() => {
		if (isVisible && duration > 0) {
			const timer = setTimeout(() => {
				onClose();
			}, duration);

			return () => clearTimeout(timer);
		}
	}, [isVisible, duration, onClose]);

	if (!isVisible) return null;

	return (
		<div className={`${styles.snackbar} ${styles[type]} ${isVisible ? styles.visible : ''}`}>
			<div className={styles.content}>
				<span className={styles.message}>{message}</span>
				{subMessage && <span className={styles.subMessage}>{subMessage}</span>}
			</div>
		</div>
	);
};

export default Snackbar;
