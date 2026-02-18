import React from 'react';
import styles from './fullScreenModal.module.scss';

interface FullScreenModalProps {
	children: React.ReactNode;
}

export default function FullScreenModal({ children }: FullScreenModalProps) {
	return <div className={styles.fullScreenModal}>{children}</div>;
}
