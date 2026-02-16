import { Statement, Role } from '@freedi/shared-types';
import { useAuthorization } from './useAuthorization';
import { useAppSelector } from './reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface EditPermissionState {
	canEdit: boolean;
	isAdmin: boolean;
	isCreator: boolean;
	role: Role;
}

export const useEditPermission = (statement?: Statement): EditPermissionState => {
	const { isAdmin, role } = useAuthorization(statement?.statementId);
	const creator = useAppSelector(creatorSelector);

	const isCreator = Boolean(
		statement?.creator?.uid && creator?.uid && statement.creator.uid === creator.uid,
	);
	const canEdit = isAdmin || isCreator;

	return {
		canEdit,
		isAdmin,
		isCreator,
		role,
	};
};
