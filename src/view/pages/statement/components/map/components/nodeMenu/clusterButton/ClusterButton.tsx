import { FC } from 'react'
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import ImportUnClusterIcon from '@/assets/icons/network-no.svg?react';
import { useMindMap } from '../../../MindMapMV';
import { useSelector } from 'react-redux';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';

interface Props {
	selectedId: string | null
	addToIconsRef: (el: HTMLButtonElement) => void
}

const ClusterButton: FC<Props> = ({ selectedId, addToIconsRef }) => {

	const children = useSelector(statementOptionsSelector(selectedId));

	const hasClusterChildren = children.every((child) => child.isCluster);

	const { handleCluster, handleRecoverSnapshot } = useMindMap();

	if (hasClusterChildren) {
		return (
			<button ref={addToIconsRef} onClick={() => handleRecoverSnapshot()}>
				<ImportUnClusterIcon />
			</button>
		)
	}

	return (
		<button ref={addToIconsRef} onClick={() => handleCluster(selectedId)}>
			<ClusterIcon />
		</button>
	)
}

export default ClusterButton