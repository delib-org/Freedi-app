import React from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './TitleMassConsensus.module.scss';

const TitleMassConsensus = ({ title }: { title: string }) => {
	const { dir } = useUserConfig();

	return (
		<h1 className={styles.title} style={{ direction: dir }}>
			{title}
		</h1>
	);
};

export default TitleMassConsensus;
