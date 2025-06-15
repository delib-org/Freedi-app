import React from 'react';
import { usePolarizationData, useResponsiveDimensions, useCanvasInteractions } from './hooks';
import {
	LoadingState,
	NoDataState,
	StatementSelector,
	AxisSelector,
	PolarizationChart,
	StatsPanel,
	GroupDetails,
	GroupsList,
	AllStatementsOverview,
	Instructions
} from './components';
import styles from './PolarizationIndex.module.scss';

const PolarizationIndexRefactored: React.FC = () => {
	// Custom hooks for data, dimensions, and interactions
	const {
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
		selectedGroupData
	} = usePolarizationData();

	const { dimensions, containerRef } = useResponsiveDimensions();

	const { handleCanvasClick } = useCanvasInteractions(
		hasData,
		polarizationIndexes,
		selectedStatementIndex,
		setSelectedStatementIndex,
		setSelectedAxis,
		setSelectedGroup,
		currentStatementData,
		selectedAxis,
		selectedGroup,
		dimensions
	);

	// Helper functions for component interactions
	const handleStatementSelect = (index: number) => {
		setSelectedStatementIndex(index);
		setSelectedAxis(0);
		setSelectedGroup(null);
	};

	const handleAxisSelect = (index: number) => {
		setSelectedAxis(index);
		setSelectedGroup(null);
	};

	const handleGroupSelect = (index: number | null) => {
		setSelectedGroup(selectedGroup === index ? null : index);
	};

	// Loading state
	if (isLoading) {
		return <LoadingState />;
	}

	// No data state
	if (!hasData) {
		return <NoDataState statementId={statementId} />;
	}

	return (
		<div className={styles.polarizationContainer}>
			{/* Header */}
			<div className={styles.header}>
				<h1 className={styles.title}>
					Polarization Analysis - All Statements
				</h1>
				<p className={styles.subtitle}>
					Selected Statement: <strong>{currentStatementData?.statement || 'Unknown'}</strong>
				</p>

				{/* Statement Selector */}
				<StatementSelector
					polarizationIndexes={polarizationIndexes}
					selectedStatementIndex={selectedStatementIndex}
					onStatementSelect={handleStatementSelect}
				/>

				{/* Axis Selector */}
				{currentAxis && currentStatementData?.axes && (
					<AxisSelector
						axes={currentStatementData.axes}
						selectedAxis={selectedAxis}
						onAxisSelect={handleAxisSelect}
					/>
				)}
			</div>

			{/* Chart Container */}
			<div ref={containerRef} className={styles.chartContainer}>
				<PolarizationChart
					dimensions={dimensions}
					polarizationIndexes={polarizationIndexes}
					selectedStatementIndex={selectedStatementIndex}
					selectedAxis={selectedAxis}
					selectedGroup={selectedGroup}
					currentStatementData={currentStatementData}
					onCanvasClick={handleCanvasClick}
				/>
			</div>

			{/* Statistics Panel */}
			{currentAxis && currentStatementData && (
				<StatsPanel
					currentStatementData={currentStatementData}
					currentAxis={currentAxis}
				/>
			)}

			{/* Group Details */}
			<GroupDetails selectedGroupData={selectedGroupData} />

			{/* Groups List */}
			<GroupsList
				groups={currentAxis?.groups}
				selectedGroup={selectedGroup}
				onGroupSelect={handleGroupSelect}
			/>

			{/* All Statements Overview */}
			<AllStatementsOverview
				polarizationIndexes={polarizationIndexes}
				selectedStatementIndex={selectedStatementIndex}
				onStatementSelect={handleStatementSelect}
			/>

			{/* Instructions */}
			<Instructions />
		</div>
	);
};

export default PolarizationIndexRefactored;
