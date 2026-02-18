import { FC } from 'react';
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import ImportUnClusterIcon from '@/assets/icons/network-no.svg?react';
import { useMindMap } from '../../../MindMapMV';
import { useSelector } from 'react-redux';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import styles from './ClusterButton.module.scss';

interface Props {
	selectedId: string | null;
	addToIconsRef: (el: HTMLButtonElement) => void;
}

const ClusterButton: FC<Props> = ({ selectedId, addToIconsRef }) => {
	const children = useSelector(statementOptionsSelector(selectedId));

	const hasClusterChildren = children.every((child) => child.isCluster);

	const { handleCluster, handleRecoverSnapshot, loading } = useMindMap();

	if (!children || children.length === 0) return null;

	if (loading) {
		return (
			<button ref={addToIconsRef} disabled>
				<div className={styles.loader}>
					<ClusterIcon />
				</div>
			</button>
		);
	}

	if (hasClusterChildren) {
		return (
			<button ref={addToIconsRef} onClick={() => handleRecoverSnapshot(selectedId)}>
				<ImportUnClusterIcon />
			</button>
		);
	}

	return (
		<button ref={addToIconsRef} onClick={() => handleCluster(selectedId)}>
			<ClusterIcon />
		</button>
	);
};

export default ClusterButton;
