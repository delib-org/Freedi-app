import { ComponentProps, FC } from 'react';
import styles from './inviteModal.module.scss';

type InviteModalProps = ComponentProps<'div'>;

const InviteModal: FC<InviteModalProps> = ({ children, className = '' }) => {
	return (
		<div className={`${styles.inviteModal} ${className}`}>
			<div className={styles.inviteModal__content}>{children}</div>
		</div>
	);
};

export default InviteModal;
