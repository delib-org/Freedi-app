import React, { useState, useEffect, useRef } from 'react';

import styles from './PolarizationIndex.module.scss';

// Mock data based on your schema
const mockPolarizationData = {
	statementId: "climate_policy_001",
	totalEvaluators: 1000,
	overallMAD: 0.65,
	averageAgreement: 0.12,
	lastUpdated: Date.now(),
	axes: [
		{
			groupingQuestionId: "political_affiliation_123",
			groupingQuestionText: "What is your political affiliation?",
			axisAverageAgreement: 0.12,
			axisMAD: 0.65,
			groups: [
				{
					groupId: "pol_123_liberal",
					groupName: "Liberal",
					average: 0.73,
					numberOfMembers: 350,
					color: "#3182ce",
					mad: 0.18
				},
				{
					groupId: "pol_123_conservative",
					groupName: "Conservative",
					average: -0.68,
					numberOfMembers: 320,
					color: "#e53e3e",
					mad: 0.21
				},
				{
					groupId: "pol_123_moderate",
					groupName: "Moderate",
					average: 0.15,
					numberOfMembers: 330,
					color: "#38a169",
					mad: 0.45
				}
			]
		},
		{
			groupingQuestionId: "age_group_456",
			groupingQuestionText: "What is your age group?",
			axisAverageAgreement: 0.18,
			axisMAD: 0.52,
			groups: [
				{
					groupId: "age_456_young",
					groupName: "18-35",
					average: 0.45,
					numberOfMembers: 400,
					color: "#9f7aea",
					mad: 0.35
				},
				{
					groupId: "age_456_middle",
					groupName: "36-55",
					average: 0.08,
					numberOfMembers: 350,
					color: "#f56565",
					mad: 0.58
				},
				{
					groupId: "age_456_senior",
					groupName: "55+",
					average: -0.12,
					numberOfMembers: 250,
					color: "#4299e1",
					mad: 0.42
				}
			]
		}
	]
};

const PolarizationIndex = ({ statementId = 'climate_policy_001' }) => {
	const canvasRef = useRef(null);
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const containerRef = useRef(null);

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

	// Canvas to data coordinates (for click detection)
	const canvasToData = (canvasX, canvasY) => {
		const margin = 60;
		const plotWidth = dimensions.width - 2 * margin;
		const plotHeight = dimensions.height - 2 * margin;

		const dataX = ((canvasX - margin) / plotWidth) * 2 - 1;
		const dataY = (dimensions.height - margin - canvasY) / plotHeight;

		return { x: dataX, y: dataY };
	};

	// Draw the chart
	useEffect(() => {
		if (!dimensions.width || !dimensions.height) return;

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

		// Draw overall position
		const overallPoint = dataToCanvas(mockPolarizationData.averageAgreement, mockPolarizationData.overallMAD);
		ctx.fillStyle = '#ff6b6b';
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 3;

		ctx.beginPath();
		ctx.arc(overallPoint.x, overallPoint.y, 12, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();

		// Draw groups for selected axis
		const currentAxis = mockPolarizationData.axes[selectedAxis];
		currentAxis.groups.forEach((group, index) => {
			const groupPoint = dataToCanvas(group.average, currentAxis.axisMAD);

			ctx.fillStyle = group.color;
			ctx.strokeStyle = selectedGroup === index ? '#000' : '#fff';
			ctx.lineWidth = selectedGroup === index ? 3 : 2;

			const radius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));

			ctx.beginPath();
			ctx.arc(groupPoint.x, groupPoint.y, radius, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();

			// Group label
			ctx.fillStyle = '#333';
			ctx.font = '11px Arial';
			ctx.textAlign = 'center';
			ctx.fillText(group.groupName, groupPoint.x, groupPoint.y - radius - 8);
		});

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

	}, [dimensions, selectedAxis, selectedGroup]);

	// Handle canvas clicks
	const handleCanvasClick = (event) => {
		const canvas = canvasRef.current;
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		const currentAxis = mockPolarizationData.axes[selectedAxis];

		// Check if click is on any group
		currentAxis.groups.forEach((group, index) => {
			const groupPoint = dataToCanvas(group.average, currentAxis.axisMAD);
			const distance = Math.sqrt(
				Math.pow(canvasX - groupPoint.x, 2) + Math.pow(canvasY - groupPoint.y, 2)
			);

			const radius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));

			if (distance <= radius + 5) {
				setSelectedGroup(selectedGroup === index ? null : index);
			}
		});
	};

	const currentAxis = mockPolarizationData.axes[selectedAxis];
	const selectedGroupData = selectedGroup !== null ? currentAxis.groups[selectedGroup] : null;

	return (
		<div className={styles.polarizationContainer}>
			{/* Header */}
			<div className={styles.header}>
				<h1 className={styles.title}>
					Polarization Analysis
				</h1>
				<p className={styles.subtitle}>
					Statement ID: {statementId}
				</p>

				{/* Axis Selector */}
				<div className={styles.axisSelector}>
					{mockPolarizationData.axes.map((axis, index) => (
						<button
							key={axis.groupingQuestionId}
							onClick={() => {
								setSelectedAxis(index);
								setSelectedGroup(null);
							}}
							className={`${styles.axisButton} ${selectedAxis === index ? styles.axisButtonActive : ''}`}
						>
							{axis.groupingQuestionText}
						</button>
					))}
				</div>
			</div>

			{/* Chart Container */}
			<div
				ref={containerRef}
				className={styles.chartContainer}
			>
				<canvas
					ref={canvasRef}
					onClick={handleCanvasClick}
					className={styles.canvas}
				/>
			</div>

			{/* Statistics Panel */}
			<div className={styles.statsGrid}>
				{/* Overall Stats */}
				<div className={styles.statsCard}>
					<h3 className={styles.statsCardTitle}>Overall Metrics</h3>
					<div className={styles.statsContent}>
						<div><strong>Total Evaluators:</strong> {mockPolarizationData.totalEvaluators}</div>
						<div><strong>Average Agreement:</strong> {mockPolarizationData.averageAgreement.toFixed(3)}</div>
						<div><strong>Polarization (MAD):</strong> {mockPolarizationData.overallMAD.toFixed(3)}</div>
						<div><strong>Last Updated:</strong> {new Date(mockPolarizationData.lastUpdated).toLocaleString()}</div>
					</div>
				</div>

				{/* Current Axis Stats */}
				<div className={styles.axisStatsCard}>
					<h3 className={styles.axisStatsTitle}>
						{currentAxis.groupingQuestionText}
					</h3>
					<div className={styles.statsContent}>
						<div><strong>Axis Average:</strong> {currentAxis.axisAverageAgreement.toFixed(3)}</div>
						<div><strong>Axis MAD:</strong> {currentAxis.axisMAD.toFixed(3)}</div>
						<div><strong>Groups:</strong> {currentAxis.groups.length}</div>
						<div><strong>Total Members:</strong> {currentAxis.groups.reduce((sum, g) => sum + g.numberOfMembers, 0)}</div>
					</div>
				</div>
			</div>

			{/* Group Details */}
			{selectedGroupData && (
				<div className={styles.selectedGroupCard}>
					<h3 className={styles.selectedGroupTitle}>
						Selected Group: {selectedGroupData.groupName}
					</h3>
					<div className={styles.selectedGroupGrid}>
						<div><strong>Average Opinion:</strong> {selectedGroupData.average.toFixed(3)}</div>
						<div><strong>Members:</strong> {selectedGroupData.numberOfMembers}</div>
						<div><strong>Internal MAD:</strong> {selectedGroupData.mad.toFixed(3)}</div>
						<div><strong>Color:</strong> <span
							className={styles.colorBadge}
							style={{ backgroundColor: selectedGroupData.color }}
						>{selectedGroupData.color}</span></div>
					</div>
				</div>
			)}

			{/* Groups List */}
			<div className={styles.groupsListContainer}>
				<h3 className={styles.groupsListTitle}>Groups in Current Axis</h3>
				<div className={styles.groupsGrid}>
					{currentAxis.groups.map((group, index) => (
						<div
							key={group.groupId}
							onClick={() => setSelectedGroup(selectedGroup === index ? null : index)}
							className={`${styles.groupCard} ${selectedGroup === index ? styles.groupCardSelected : ''}`}
							style={{
								borderColor: selectedGroup === index ? group.color : '#e2e8f0',
								backgroundColor: selectedGroup === index ? `${group.color}15` : '#f7fafc'
							}}
						>
							<div className={styles.groupCardHeader}>
								<div
									className={styles.groupColorDot}
									style={{ backgroundColor: group.color }}
								/>
								<strong>{group.groupName}</strong>
							</div>
							<div className={styles.groupCardContent}>
								<div>Average: {group.average.toFixed(3)}</div>
								<div>Members: {group.numberOfMembers}</div>
								<div>MAD: {group.mad.toFixed(3)}</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Instructions */}
			<div className={styles.instructions}>
				💡 Click on group dots to see detailed information. Switch between different grouping questions using the buttons above.
			</div>
		</div>
	);
};

export default PolarizationIndex;