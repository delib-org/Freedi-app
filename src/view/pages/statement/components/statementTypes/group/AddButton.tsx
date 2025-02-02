import React from 'react'
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from "@/assets/icons/plusIcon.svg?react";
import AddDocumentIcon from "@/assets/icons/document.svg?react";
import AddClusterIcon from "@/assets/icons/net-clusters.svg?react";
import AddSubGroupIcon from "@/assets/icons/team-group.svg?react";
import { useClickOutside } from '@/controllers/hooks/useClickOutside';

export default function AddButton() {
	const [actionsOpen, setActionsOpen] = React.useState(false)

	const actionsRef = useClickOutside(() => {
		setActionsOpen(false);
	  });

	  const toggleActions = (e: React.MouseEvent) => {
		e.stopPropagation();
		setActionsOpen(!actionsOpen);
	  };

	  const handleActionClick = (action: () => void) => (e: React.MouseEvent) => {
		e.stopPropagation();
		action();
		setActionsOpen(false);
	  };

	const addDocumentAction = () => {
		return;
	}

	const addClusterAction = () => {
		return;
	}

	const addSubGroupAction = () => {
		return;
	}

	return (
		<div className='actions' ref={actionsRef}>
			{actionsOpen && <>
				<IconButton onClick={handleActionClick(addDocumentAction)} className="action-btn">
					<AddDocumentIcon />
				</IconButton>
				<IconButton onClick={handleActionClick(addClusterAction)} className="action-btn">
					<AddClusterIcon />
				</IconButton>
				<IconButton onClick={handleActionClick(addSubGroupAction)} className="action-btn">
					<AddSubGroupIcon />
				</IconButton>
				<button className='invisibleBackground' onClick={() => setActionsOpen(false)}></button>
			</>}

			<IconButton onClick={toggleActions} className="plus-button">
				<PlusIcon />
			</IconButton>
		</div>
	)
}
