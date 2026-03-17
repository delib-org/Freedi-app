import React, { FC } from 'react';
import styles from './TreeThreadLine.module.scss';

interface TreeThreadLineProps {
	depth: number;
}

const TreeThreadLine: FC<TreeThreadLineProps> = ({ depth }) => {
	return (
		<div
			className={styles['tree-thread-line']}
			style={{ '--depth': depth } as React.CSSProperties}
		/>
	);
};

export default TreeThreadLine;
