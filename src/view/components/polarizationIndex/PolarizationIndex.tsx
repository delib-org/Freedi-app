import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import { selectPolarizationIndexByParentId } from '@/redux/userData/userDataSlice';
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';

const PolarizationIndex = () => {
	const { statementId } = useParams();
	const canvasRef = useRef(null);
	const [selectedStatementIndex, setSelectedStatementIndex] = useState(0);
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const containerRef = useRef(null);
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));

	// Early return with loading state if no data
	if (!polarizationIndexes || polarizationIndexes.length === 0) {
		return (
			<div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
				<h1 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
					Polarization Analysis
				</h1>
				<div style={{
					padding: '40px',
					backgroundColor: '#f7fafc',
					borderRadius: '8px',
					border: '1px solid #e2e8f0',
					margin: '20px 0'
				}}>
					<div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>
						Loading polarization data...
					</div>
					<div style={{ fontSize: '14px', color: '#999' }}>
						Please wait while we fetch the analysis results.
					</div>
				</div>
			</div>
		);
	}

	// Ensure selectedStatementIndex is within bounds
	const safeSelectedIndex = Math.min(selectedStatementIndex, polarizationIndexes.length - 1);
	const currentStatementData = polarizationIndexes[safeSelectedIndex];

	// Additional safety check for current statement data
	if (!currentStatementData || !currentStatementData.axes || currentStatementData.axes.length === 0) {
		return (
			<div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
				<h1 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
					Polarization Analysis
				</h1>
				<div style={{
					padding: '40px',
					backgroundColor: '#fff3cd',
					borderRadius: '8px',
					border: '1px solid #ffeaa7',
					margin: '20px 0'
				}}>
					<div style={{ fontSize: '18px', color: '#856404', marginBottom: '10px' }}>
						No analysis data available
					</div>
					<div style={{ fontSize: '14px', color: '#856404' }}>
						The polarization analysis for this statement is not yet complete.
					</div>
				</div>
			</div>
		);
	}

	// Ensure selectedAxis is within bounds
	const safeSelectedAxis = Math.min(selectedAxis, currentStatementData.axes.length - 1);

	// Handle responsive canvas sizing
	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current) {
				const container = containerRef.current;
				const rect = container.getBoundingClientRect();
				setDimensions({
					width: rect.width,
					height: Math.min(rect.width * 0.8, 500)
				});
			}
		};

		updateDimensions();
		window.addEventListener('resize', updateDimensions);

		return () => window.removeEventListener('resize', updateDimensions);
	}, []);

	useEffect(() => {
		const unsubscribe = listenToPolarizationIndex(statementId);

		return () => {
			if (unsubscribe) unsubscribe();
		};
	}, [statementId]);

	// Reset selections when data changes
	useEffect(() => {
		if (polarizationIndexes && polarizationIndexes.length > 0) {
			setSelectedStatementIndex(0);
			setSelectedAxis(0);
			setSelectedGroup(null);
		}
	}, [polarizationIndexes]);

	// Generate triangle boundary points
	const generateTriangleBoundary = () => {
		const points = [];
		for (let x = -1; x <= 1; x += 0.02) {
			const maxY = Math.min(1 + x, 1 - x);
			if (maxY >= 0) {
				points.push({ x, y: maxY });
			}
		}

		return points;
	};

	// Transform data coordinates to canvas coordinates
	const dataToCanvas = (dataX, dataY) => {
		const margin = 60;
		const plotWidth = dimensions.width - 2 * margin;
		const plotHeight = dimensions.height - 2 * margin;

		const canvasX = margin + ((dataX + 1) / 2) * plotWidth;
		const canvasY = dimensions.height - margin - (dataY * plotHeight);

		return { x: canvasX, y: canvasY };
	};

	// Draw the chart
	useEffect(() => {
		if (!dimensions.width || !dimensions.height || !currentStatementData) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		const dpr = window.devicePixelRatio || 1;

		// Set up high DPI canvas
		canvas.width = dimensions.width * dpr;
		canvas.height = dimensions.height * dpr;
		canvas.style.width = dimensions.width + 'px';
		canvas.style.height = dimensions.height + 'px';
		ctx.scale(dpr, dpr);

		// Clear canvas
		ctx.clearRect(0, 0, dimensions.width, dimensions.height);

		const margin = 60;
		const plotWidth = dimensions.width - 2 * margin;
		const plotHeight = dimensions.height - 2 * margin;

		// Draw background grid
		ctx.strokeStyle = '#e0e0e0';
		ctx.lineWidth = 1;

		// Vertical grid lines
		for (let i = 0; i <= 10; i++) {
			const x = margin + (i / 10) * plotWidth;
			ctx.beginPath();
			ctx.moveTo(x, margin);
			ctx.lineTo(x, dimensions.height - margin);
			ctx.stroke();
		}

		// Horizontal grid lines
		for (let i = 0; i <= 10; i++) {
			const y = margin + (i / 10) * plotHeight;
			ctx.beginPath();
			ctx.moveTo(margin, y);
			ctx.lineTo(dimensions.width - margin, y);
			ctx.stroke();
		}

		// Draw triangle boundary
		const boundaryPoints = generateTriangleBoundary();
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 2;
		ctx.beginPath();

		boundaryPoints.forEach((point, index) => {
			const canvasPoint = dataToCanvas(point.x, point.y);
			if (index === 0) {
				ctx.moveTo(canvasPoint.x, canvasPoint.y);
			} else {
				ctx.lineTo(canvasPoint.x, canvasPoint.y);
			}
		});
		ctx.stroke();

		// Draw axis labels
		ctx.fillStyle = '#333';
		ctx.font = '14px Arial';
		ctx.textAlign = 'center';

		// X-axis label
		ctx.fillText('Average Agreement', dimensions.width / 2, dimensions.height - 20);

		// Y-axis label
		ctx.save();
		ctx.translate(20, dimensions.height / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText('Polarization (MAD)', 0, 0);
		ctx.restore();

		// Draw axis ticks and labels
		ctx.font = '10px Arial';
		ctx.fillStyle = '#666';

		// X-axis ticks
		const xTicks = [-1, -0.5, 0, 0.5, 1];
		xTicks.forEach(tick => {
			const canvasPoint = dataToCanvas(tick, 0);
			ctx.textAlign = 'center';
			ctx.fillText(tick.toString(), canvasPoint.x, dimensions.height - margin + 15);
		});

		// Y-axis ticks
		const yTicks = [0, 0.25, 0.5, 0.75, 1];
		yTicks.forEach(tick => {
			const canvasPoint = dataToCanvas(-1, tick);
			ctx.textAlign = 'right';
			ctx.fillText(tick.toString(), margin - 10, canvasPoint.y + 3);
		});

		// Draw ALL main statement points
		polarizationIndexes.forEach((statement, index) => {
			// Safety check for statement data
			if (!statement || typeof statement.averageAgreement !== 'number' || typeof statement.overallMAD !== 'number') {
				return;
			}

			const statementPoint = dataToCanvas(statement.averageAgreement, statement.overallMAD);
			const isSelected = index === safeSelectedIndex;

			ctx.fillStyle = statement.color || '#999';
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = isSelected ? 4 : 2;

			ctx.beginPath();
			ctx.arc(statementPoint.x, statementPoint.y, isSelected ? 14 : 10, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();

			// Add statement label
			ctx.fillStyle = '#333';
			ctx.font = isSelected ? 'bold 11px Arial' : '10px Arial';
			ctx.textAlign = 'center';
			const labelY = statementPoint.y - (isSelected ? 20 : 16);
			ctx.fillText((statement.statementId || 'Unknown').replace('_', ' '), statementPoint.x, labelY);
		});

		// Draw groups for SELECTED statement only
		const currentAxis = currentStatementData.axes[safeSelectedAxis];
		if (currentAxis && currentAxis.groups) {
			currentAxis.groups.forEach((group, index) => {
				// Safety check for group data
				if (!group || typeof group.average !== 'number' || typeof group.mad !== 'number') {
					return;
				}

				const groupPoint = dataToCanvas(group.average, group.mad);
				const baseRadius = Math.max(6, Math.min(15, Math.sqrt((group.numberOfMembers || 1) / 10)));

				ctx.fillStyle = group.color || '#999';
				ctx.strokeStyle = selectedGroup === index ? '#000' : '#fff';
				ctx.lineWidth = selectedGroup === index ? 3 : 2;

				ctx.beginPath();
				ctx.arc(groupPoint.x, groupPoint.y, baseRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();

				// Group label
				ctx.fillStyle = '#333';
				ctx.font = '11px Arial';
				ctx.textAlign = 'center';
				ctx.fillText(group.groupName || 'Unknown', groupPoint.x, groupPoint.y - baseRadius - 8);
			});
		}

		// Draw vertices labels
		ctx.fillStyle = '#333';
		ctx.font = 'bold 12px Arial';

		// Complete Rejection vertex
		const vertex1 = dataToCanvas(-1, 0);
		ctx.textAlign = 'center';
		ctx.fillText('Complete Rejection', vertex1.x, vertex1.y - 20);
		ctx.fillText('(-1, 0)', vertex1.x, vertex1.y - 8);

		// Complete Consensus vertex
		const vertex2 = dataToCanvas(1, 0);
		ctx.textAlign = 'center';
		ctx.fillText('Complete Consensus', vertex2.x, vertex2.y - 20);
		ctx.fillText('(+1, 0)', vertex2.x, vertex2.y - 8);

		// Maximum Polarization vertex
		const vertex3 = dataToCanvas(0, 1);
		ctx.textAlign = 'center';
		ctx.fillText('Maximum Polarization', vertex3.x, vertex3.y - 20);
		ctx.fillText('(0, 1)', vertex3.x, vertex3.y - 8);

	}, [dimensions, safeSelectedAxis, selectedGroup, safeSelectedIndex, polarizationIndexes, currentStatementData]);

	// Handle canvas clicks
	const handleCanvasClick = (event) => {
		if (!currentStatementData) return;

		const canvas = canvasRef.current;
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		// Check for main statement point clicks FIRST
		let clickedStatement = null;
		polarizationIndexes.forEach((statement, index) => {
			if (!statement || typeof statement.averageAgreement !== 'number' || typeof statement.overallMAD !== 'number') {
				return;
			}

			const statementPoint = dataToCanvas(statement.averageAgreement, statement.overallMAD);
			const distance = Math.sqrt(
				Math.pow(canvasX - statementPoint.x, 2) + Math.pow(canvasY - statementPoint.y, 2)
			);
			const radius = index === safeSelectedIndex ? 14 : 10;

			if (distance <= radius + 5) {
				clickedStatement = index;
			}
		});

		if (clickedStatement !== null) {
			// Statement point was clicked
			setSelectedStatementIndex(clickedStatement);
			setSelectedAxis(0); // Reset to first axis
			setSelectedGroup(null); // Clear selected group

			return;
		}

		// Check for group clicks (only for current statement)
		const currentAxis = currentStatementData.axes[safeSelectedAxis];
		if (!currentAxis || !currentAxis.groups) return;

		let clickedGroup = null;
		currentAxis.groups.forEach((group, index) => {
			if (!group || typeof group.average !== 'number' || typeof group.mad !== 'number') {
				return;
			}

			const groupPoint = dataToCanvas(group.average, group.mad);
			const groupDistance = Math.sqrt(
				Math.pow(canvasX - groupPoint.x, 2) + Math.pow(canvasY - groupPoint.y, 2)
			);

			const radius = Math.max(6, Math.min(15, Math.sqrt((group.numberOfMembers || 1) / 10)));

			if (groupDistance <= radius + 5) {
				clickedGroup = index;
			}
		});

		if (clickedGroup !== null) {
			setSelectedGroup(selectedGroup === clickedGroup ? null : clickedGroup);
		} else {
			setSelectedGroup(null);
		}
	};

	const currentAxis = currentStatementData.axes[safeSelectedAxis];
	const selectedGroupData = selectedGroup !== null && currentAxis?.groups ? currentAxis.groups[selectedGroup] : null;

	return (
		<div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
			{/* Header */}
			<div style={{ marginBottom: '20px' }}>
				<h1 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
					Polarization Analysis - All Statements
				</h1>
				<p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
					Selected Statement: <strong>{currentStatementData.statement || 'Unknown'}</strong>
				</p>

				{/* Statement Legend */}
				<div style={{ marginBottom: '20px' }}>
					<h3 style={{ marginBottom: '10px', color: '#333' }}>Statements (Click on chart to select):</h3>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
						{polarizationIndexes.map((statement, index) => (
							<div
								key={statement.statementId || index}
								onClick={() => {
									setSelectedStatementIndex(index);
									setSelectedAxis(0);
									setSelectedGroup(null);
								}}
								style={{
									padding: '8px 12px',
									backgroundColor: safeSelectedIndex === index ? (statement.color || '#999') : '#f7fafc',
									color: safeSelectedIndex === index ? 'white' : '#333',
									border: `2px solid ${statement.color || '#999'}`,
									borderRadius: '6px',
									cursor: 'pointer',
									fontSize: '14px',
									maxWidth: '300px',
									textAlign: 'left'
								}}
							>
								<div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
									{statement.statementId || 'Unknown'}
								</div>
								<div style={{ fontSize: '12px', opacity: safeSelectedIndex === index ? 0.9 : 0.7 }}>
									{statement.statement || 'No statement text available'}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Axis Selector */}
				{currentStatementData.axes && currentStatementData.axes.length > 0 && (
					<div style={{ marginBottom: '20px' }}>
						<h3 style={{ marginBottom: '10px', color: '#333' }}>
							Select Grouping for "{currentStatementData.statementId || 'Unknown'}":
						</h3>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
							{currentStatementData.axes.map((axis, index) => (
								<button
									key={axis.groupingQuestionId || index}
									onClick={() => {
										setSelectedAxis(index);
										setSelectedGroup(null);
									}}
									style={{
										padding: '8px 16px',
										backgroundColor: safeSelectedAxis === index ? '#38a169' : '#f7fafc',
										color: safeSelectedAxis === index ? 'white' : '#333',
										border: '1px solid #e2e8f0',
										borderRadius: '6px',
										cursor: 'pointer',
										fontSize: '14px'
									}}
								>
									{axis.groupingQuestionText || 'Unknown Grouping'}
								</button>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Chart Container */}
			<div
				ref={containerRef}
				style={{
					width: '100%',
					maxWidth: '800px',
					margin: '0 auto',
					backgroundColor: '#fff',
					border: '1px solid #e2e8f0',
					borderRadius: '8px',
					padding: '20px',
					marginBottom: '20px'
				}}
			>
				<canvas
					ref={canvasRef}
					onClick={handleCanvasClick}
					style={{ cursor: 'pointer', display: 'block' }}
				/>
			</div>

			{/* Statistics Panel */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
				{/* Overall Stats */}
				<div style={{ backgroundColor: '#f7fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
					<h3 style={{ margin: '0 0 12px 0', color: '#333' }}>Selected Statement Metrics</h3>
					<div style={{ fontSize: '14px', lineHeight: '1.6' }}>
						<div><strong>Statement:</strong> {currentStatementData.statementId || 'Unknown'}</div>
						<div><strong>Total Evaluators:</strong> {currentStatementData.totalEvaluators || 0}</div>
						<div><strong>Average Agreement:</strong> {(currentStatementData.averageAgreement || 0).toFixed(3)}</div>
						<div><strong>Polarization (MAD):</strong> {(currentStatementData.overallMAD || 0).toFixed(3)}</div>
						<div><strong>Last Updated:</strong> {
							currentStatementData.lastUpdated
								? new Date(currentStatementData.lastUpdated).toLocaleString()
								: 'Never'
						}</div>
					</div>
				</div>

				{/* Current Axis Stats */}
				{currentAxis && (
					<div style={{ backgroundColor: '#f7fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
						<h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
							{currentAxis.groupingQuestionText || 'Unknown Grouping'}
						</h3>
						<div style={{ fontSize: '14px', lineHeight: '1.6' }}>
							<div><strong>Axis Average:</strong> {(currentAxis.axisAverageAgreement || 0).toFixed(3)}</div>
							<div><strong>Axis MAD:</strong> {(currentAxis.axisMAD || 0).toFixed(3)}</div>
							<div><strong>Groups:</strong> {currentAxis.groups ? currentAxis.groups.length : 0}</div>
							<div><strong>Total Members:</strong> {
								currentAxis.groups
									? currentAxis.groups.reduce((sum, g) => sum + (g.numberOfMembers || 0), 0)
									: 0
							}</div>
						</div>
					</div>
				)}
			</div>

			{/* Group Details */}
			{selectedGroupData && (
				<div style={{ backgroundColor: '#fffdf7', padding: '16px', borderRadius: '8px', border: '2px solid #fbbf24', marginBottom: '20px' }}>
					<h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
						Selected Group: {selectedGroupData.groupName || 'Unknown'}
					</h3>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '14px' }}>
						<div><strong>Average Opinion:</strong> {(selectedGroupData.average || 0).toFixed(3)}</div>
						<div><strong>Members:</strong> {selectedGroupData.numberOfMembers || 0}</div>
						<div><strong>Internal MAD:</strong> {(selectedGroupData.mad || 0).toFixed(3)}</div>
						<div><strong>Color:</strong> <span
							style={{
								display: 'inline-block',
								width: '20px',
								height: '20px',
								backgroundColor: selectedGroupData.color || '#999',
								borderRadius: '3px',
								verticalAlign: 'middle',
								marginLeft: '8px',
								border: '1px solid #ccc'
							}}
						></span> {selectedGroupData.color || '#999'}</div>
					</div>
				</div>
			)}

			{/* Groups List */}
			{currentAxis && currentAxis.groups && currentAxis.groups.length > 0 && (
				<div style={{ marginBottom: '20px' }}>
					<h3 style={{ marginBottom: '16px', color: '#333' }}>Groups in Current Axis</h3>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
						{currentAxis.groups.map((group, index) => (
							<div
								key={group.groupId || index}
								onClick={() => setSelectedGroup(selectedGroup === index ? null : index)}
								style={{
									padding: '12px',
									borderRadius: '8px',
									border: `2px solid ${selectedGroup === index ? (group.color || '#999') : '#e2e8f0'}`,
									backgroundColor: selectedGroup === index ? `${group.color || '#999'}15` : '#f7fafc',
									cursor: 'pointer',
									transition: 'all 0.2s ease'
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
									<div
										style={{
											width: '12px',
											height: '12px',
											backgroundColor: group.color || '#999',
											borderRadius: '50%',
											marginRight: '8px'
										}}
									/>
									<strong>{group.groupName || 'Unknown'}</strong>
								</div>
								<div style={{ fontSize: '14px', lineHeight: '1.4' }}>
									<div>Average: {(group.average || 0).toFixed(3)}</div>
									<div>Members: {group.numberOfMembers || 0}</div>
									<div>MAD: {(group.mad || 0).toFixed(3)}</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* All Statements Summary */}
			<div style={{ marginBottom: '20px' }}>
				<h3 style={{ marginBottom: '16px', color: '#333' }}>All Statements Overview</h3>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
					{polarizationIndexes.map((statement, index) => (
						<div
							key={statement.statementId || index}
							onClick={() => {
								setSelectedStatementIndex(index);
								setSelectedAxis(0);
								setSelectedGroup(null);
							}}
							style={{
								padding: '16px',
								borderRadius: '8px',
								border: `2px solid ${statement.color || '#999'}`,
								backgroundColor: safeSelectedIndex === index ? `${statement.color || '#999'}15` : '#f7fafc',
								cursor: 'pointer',
								transition: 'all 0.2s ease'
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
								<div
									style={{
										width: '16px',
										height: '16px',
										backgroundColor: statement.color || '#999',
										borderRadius: '50%',
										marginRight: '8px'
									}}
								/>
								<strong style={{ fontSize: '16px' }}>{statement.statementId || 'Unknown'}</strong>
							</div>
							<div style={{ fontSize: '14px', marginBottom: '8px', color: '#666' }}>
								{statement.statement || 'No statement text available'}
							</div>
							<div style={{ fontSize: '12px', lineHeight: '1.4' }}>
								<div><strong>Agreement:</strong> {(statement.averageAgreement || 0).toFixed(3)}</div>
								<div><strong>Polarization:</strong> {(statement.overallMAD || 0).toFixed(3)}</div>
								<div><strong>Evaluators:</strong> {statement.totalEvaluators || 0}</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Instructions */}
			<div style={{
				backgroundColor: '#e6fffa',
				padding: '16px',
				borderRadius: '8px',
				border: '1px solid #4fd1c7',
				fontSize: '14px',
				color: '#234e52'
			}}>
				💡 <strong>How to use:</strong> All three main statement points are always visible on the chart. Click on any main point (large colored dots) to select a statement and view its groups. Use the grouping buttons to switch between different demographic breakdowns for the selected statement. Click on group dots to see detailed information.
			</div>
		</div>
	);
};

export default PolarizationIndex;