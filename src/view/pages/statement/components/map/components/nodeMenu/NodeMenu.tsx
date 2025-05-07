import { FC, useEffect, useRef } from 'react';
import { useStore } from 'reactflow';
import styles from './NodeMenu.module.scss';
// icons
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import { useMindMap } from '../../MindMapMV';

interface Props {
	selectedId?: string
}

const NodeMenu: FC<Props> = ({ selectedId }) => {
	const nodeMenuRef = useRef(null);
	const iconsRef = useRef([]);
	const { handleCluster } = useMindMap();

	// Get the current zoom level from the react-flow store
	const zoom = useStore((state) => state.transform[2]);

	useEffect(() => {
		if (nodeMenuRef.current && zoom) {
			// Apply scaling to the container only, not affecting its children
			// We don't want to scale the container as that affects padding, etc.
			nodeMenuRef.current.style.transform = ''; // Remove transform from container

			// Instead, scale each SVG icon directly
			iconsRef.current.forEach(iconElement => {
				if (iconElement) {
					// Find the SVG elements inside the buttons
					const svgElement = iconElement.querySelector('svg');
					if (svgElement) {
						// Apply inverse scaling only to the SVG itself
						const scale = 1;

						// Set a fixed size for the SVG based on the zoom level
						// This ensures consistent size while preserving button clickability
						svgElement.style.transform = `scale(${scale})`;
						svgElement.style.transformOrigin = 'center center';
						svgElement.style.display = 'block';
					}
				}
			});
		}
	}, [zoom]);

	// Function to add ref to icons array
	const addToIconsRef = (el) => {
		if (el && !iconsRef.current.includes(el)) {
			iconsRef.current.push(el);
		}
	};

	return (
		<div className={styles.nodeMenu} ref={nodeMenuRef}>
			<button ref={addToIconsRef} onClick={() => handleCluster(selectedId)}>
				<ClusterIcon />
			</button>
			<button className={styles.deleteButton} ref={addToIconsRef}>
				<DeleteIcon />
			</button>
		</div>
	);
};

export default NodeMenu;