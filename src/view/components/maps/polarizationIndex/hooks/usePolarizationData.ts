import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId } from '@/redux/userDemographic/userDemographicSlice';
import { PolarizationIndex } from '@freedi/shared-types';

export const usePolarizationData = () => {
	const { statementId } = useParams();
	const [selectedStatementIndex, setSelectedStatementIndex] = useState(0);
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	// Get polarization data from Redux
	const polarizationIndexes: PolarizationIndex[] =
		useSelector(selectPolarizationIndexByParentId(statementId)) || [];
	// Safety check: Get current statement data with fallback
	const currentStatementData = polarizationIndexes[selectedStatementIndex];
	const hasData = polarizationIndexes.length > 0 && !!currentStatementData;

	// Listen to database changes
	useEffect(() => {
		if (!statementId) return;

		setIsLoading(true);
		const unsubscribe = listenToPolarizationIndex(statementId);

		// Set loading to false after a short delay to allow data to load
		const timer = setTimeout(() => {
			setIsLoading(false);
		}, 1000);

		return () => {
			if (unsubscribe) unsubscribe();
			clearTimeout(timer);
		};
	}, [statementId]);

	// Update loading state when data arrives
	useEffect(() => {
		if (polarizationIndexes.length > 0) {
			setIsLoading(false);
		}
	}, [polarizationIndexes]);

	// Reset selections when data changes
	useEffect(() => {
		if (hasData) {
			// Ensure selectedStatementIndex is within bounds
			if (selectedStatementIndex >= polarizationIndexes.length) {
				setSelectedStatementIndex(0);
			}
			// Reset other selections
			setSelectedAxis(0);
			setSelectedGroup(null);
		}
	}, [polarizationIndexes, selectedStatementIndex, hasData]);

	// Safe access to current axis and selected group data
	const currentAxis = currentStatementData?.axes?.[selectedAxis];
	const selectedGroupData =
		selectedGroup !== null && currentAxis?.groups ? currentAxis.groups[selectedGroup] : null;

	return {
		statementId,
		selectedStatementIndex,
		setSelectedStatementIndex,
		selectedAxis,
		setSelectedAxis,
		selectedGroup,
		setSelectedGroup,
		isLoading,
		polarizationIndexes,
		currentStatementData,
		hasData,
		currentAxis,
		selectedGroupData,
	};
};
