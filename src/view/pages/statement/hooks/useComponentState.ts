import React, { useMemo } from 'react';
import { Role } from '@freedi/shared-types';
import { COMPONENT_STATES, ComponentState } from '../constants';

interface UseComponentStateProps {
	loading: boolean;
	isAuthorized: boolean;
	isWaitingForApproval: boolean;
	isStatementNotFound: boolean;
	error: string | null;
	role?: Role;
}

interface ComponentStateResult {
	currentState: ComponentState;
	shouldRender: boolean;
	renderComponent: () => React.ReactNode | null;
}

export const useComponentState = ({
	loading,
	isAuthorized,
	isWaitingForApproval,
	isStatementNotFound,
	error,
	role,
}: UseComponentStateProps): ComponentStateResult => {
	const currentState = useMemo((): ComponentState => {
		if (error) return COMPONENT_STATES.ERROR;
		if (isStatementNotFound) return COMPONENT_STATES.NOT_FOUND;
		if (isWaitingForApproval || role === Role.waiting) return COMPONENT_STATES.WAITING_APPROVAL;
		if (loading) return COMPONENT_STATES.LOADING;
		if (isAuthorized) return COMPONENT_STATES.AUTHORIZED;

		return COMPONENT_STATES.UNAUTHORIZED;
	}, [error, isStatementNotFound, isWaitingForApproval, role, loading, isAuthorized]);

	const shouldRender = currentState === COMPONENT_STATES.AUTHORIZED;

	const renderComponent = useMemo(() => {
		return () => {
			switch (currentState) {
				case COMPONENT_STATES.ERROR:
					return null; // Will be handled by error boundary or parent
				case COMPONENT_STATES.NOT_FOUND:
					return null; // Will be handled by parent
				case COMPONENT_STATES.WAITING_APPROVAL:
					return null; // Will be handled by parent
				case COMPONENT_STATES.LOADING:
					return null; // Will be handled by parent
				case COMPONENT_STATES.UNAUTHORIZED:
					return null; // Will be handled by parent
				case COMPONENT_STATES.AUTHORIZED:
					return null; // Main content will be rendered
				default:
					return null;
			}
		};
	}, [currentState]);

	return {
		currentState,
		shouldRender,
		renderComponent,
	};
};
