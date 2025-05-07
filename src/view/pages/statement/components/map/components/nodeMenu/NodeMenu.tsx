import React from 'react'
import styles from './NodeMenu.module.scss';

//icons
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';

const NodeMenu = () => {
	return (
		<div className={styles.nodeMenu}>
			<ClusterIcon />
			<DeleteIcon />
		</div>
	)
}

export default NodeMenu