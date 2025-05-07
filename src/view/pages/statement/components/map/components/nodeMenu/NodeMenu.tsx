import React, { useEffect, useRef } from 'react';
import { useStore } from 'reactflow'; // Import the useStore hook from react-flow
import styles from './NodeMenu.module.scss';
// icons
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';

const NodeMenu = () => {
	const nodeMenuRef = useRef(null);

	// Get the current zoom level from the react-flow store
	const zoom = useStore((state) => state.transform[2]);

	useEffect(() => {
		if (nodeMenuRef.current && zoom) {
			// Apply inverse scaling to counteract the zoom
			const scale = 1 / zoom;

			// Apply the transform to the node menu container
			nodeMenuRef.current.style.transform = `scale(${scale})`;

			// Adjust the transform origin to ensure proper positioning
			nodeMenuRef.current.style.transformOrigin = 'center center';
		}
	}, [zoom]);

	return (
		<div className={styles.nodeMenu} ref={nodeMenuRef}>
			<button>
				<ClusterIcon />
			</button>
			<button className={styles.deleteButton}>
				<DeleteIcon />
			</button>
		</div>
	);
};

export default NodeMenu;