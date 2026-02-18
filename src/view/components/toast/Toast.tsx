import React, { FC } from 'react';
import styles from './Toast.module.scss';
import X from '@/assets/icons/x.svg?react';

interface Props {
	text: string;
	type: 'error' | 'success' | 'message';
	show: boolean;
	children?: React.ReactNode;
	setShow: (show: boolean) => void;
}

const Toast: FC<Props> = ({ text, type, show, setShow, children }) => {
	if (!show) return null;

	return (
		<div className={styles.toast} style={{ backgroundColor: getToastColor(type) }}>
			<p className={styles.toast__text}> {text}</p>
			{children && <div className={styles.toast__children}>{children}</div>}
			{!children && (
				<div className={styles.toast__close}>
					<button className={styles.toast__close__x} onClick={() => setShow(false)}>
						<X />
					</button>
				</div>
			)}
		</div>
	);
};

export default Toast;

function getToastColor(type: 'error' | 'success' | 'message') {
	switch (type) {
		case 'error':
			return '#E8749E';
		case 'success':
			return '#6FC5BE';
		case 'message':
			return '#6DB0F9';
		default:
			return '#6FC5BE';
	}
}
