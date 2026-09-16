import React, { FC, useEffect } from 'react';
import clsx from 'clsx';
import { TIME } from '@/constants/common';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Toast.module.scss';
import X from '@/assets/icons/x.svg?react';

interface Props {
	text: string;
	type: 'error' | 'success' | 'message';
	show: boolean;
	children?: React.ReactNode;
	setShow: (show: boolean) => void;
}

/** A plain notice leaves on its own; a toast carrying actions waits for one. */
export const TOAST_DURATION_MS = 3.5 * TIME.SECOND;

/**
 * Dark pill above the floating bottom nav (WizCol design). The type is carried
 * by a small leading dot, not by repainting the whole pill.
 */
const Toast: FC<Props> = ({ text, type, show, setShow, children }) => {
	const { t } = useTranslation();

	useEffect(() => {
		if (!show || children) return;
		const timer = window.setTimeout(() => setShow(false), TOAST_DURATION_MS);

		return () => window.clearTimeout(timer);
	}, [show, children, setShow]);

	if (!show) return null;

	return (
		<div
			className={clsx(styles.toast, styles[`toast--${type}`])}
			role={type === 'error' ? 'alert' : 'status'}
			data-testid="toast"
		>
			<div className={styles.toast__row}>
				<span className={styles.toast__dot} aria-hidden="true" />
				<p className={styles.toast__text}>{text}</p>
				{!children && (
					<button
						type="button"
						className={styles.toast__close}
						onClick={() => setShow(false)}
						aria-label={t('Close')}
					>
						<X aria-hidden="true" />
					</button>
				)}
			</div>
			{children && <div className={styles.toast__children}>{children}</div>}
		</div>
	);
};

export default Toast;
