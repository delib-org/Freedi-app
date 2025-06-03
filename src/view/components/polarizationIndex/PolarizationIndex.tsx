import React, { useState, useEffect, useRef } from 'react';

// Mock data based on your schema - array of different statements
const mockPolarizationData = [
	{
		statementId: "climate_policy_001",
		statement: "Government should implement carbon taxes to combat climate change",
		totalEvaluators: 1000,
		overallMAD: 0.65,
		averageAgreement: 0.12,
		lastUpdated: Date.now(),
		color: "#e53e3e", // Red
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
					},
					{
						groupId: "pol_123_independent",
						groupName: "Independent",
						average: -0.22,
						numberOfMembers: 280,
						color: "#ed8936",
						mad: 0.52
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
					},
					{
						groupId: "age_456_elderly",
						groupName: "65+",
						average: -0.35,
						numberOfMembers: 180,
						color: "#805ad5",
						mad: 0.38
					}
				]
			},
			{
				groupingQuestionId: "education_level_789",
				groupingQuestionText: "What is your education level?",
				axisAverageAgreement: 0.09,
				axisMAD: 0.58,
				groups: [
					{
						groupId: "edu_789_high_school",
						groupName: "High School",
						average: -0.32,
						numberOfMembers: 220,
						color: "#d69e2e",
						mad: 0.44
					},
					{
						groupId: "edu_789_bachelor",
						groupName: "Bachelor's",
						average: 0.18,
						numberOfMembers: 380,
						color: "#38b2ac",
						mad: 0.39
					},
					{
						groupId: "edu_789_graduate",
						groupName: "Graduate",
						average: 0.41,
						numberOfMembers: 300,
						color: "#667eea",
						mad: 0.33
					}
				]
			},
			{
				groupingQuestionId: "income_level_012",
				groupingQuestionText: "What is your household income?",
				axisAverageAgreement: 0.04,
				axisMAD: 0.61,
				groups: [
					{
						groupId: "inc_012_low",
						groupName: "Under $50k",
						average: 0.28,
						numberOfMembers: 250,
						color: "#f687b3",
						mad: 0.47
					},
					{
						groupId: "inc_012_middle",
						groupName: "$50k-$100k",
						average: 0.02,
						numberOfMembers: 420,
						color: "#4fd1c7",
						mad: 0.55
					},
					{
						groupId: "inc_012_high",
						groupName: "Over $100k",
						average: -0.19,
						numberOfMembers: 330,
						color: "#fc8181",
						mad: 0.41
					}
				]
			}
		]
	},
	{
		statementId: "healthcare_002",
		statement: "Universal healthcare should be implemented nationwide",
		totalEvaluators: 1200,
		overallMAD: 0.43,
		averageAgreement: 0.31,
		lastUpdated: Date.now() - 3600000, // 1 hour ago
		color: "#3182ce", // Blue
		axes: [
			{
				groupingQuestionId: "political_affiliation_123",
				groupingQuestionText: "What is your political affiliation?",
				axisAverageAgreement: 0.31,
				axisMAD: 0.43,
				groups: [
					{
						groupId: "pol_123_liberal",
						groupName: "Liberal",
						average: 0.82,
						numberOfMembers: 420,
						color: "#3182ce",
						mad: 0.15
					},
					{
						groupId: "pol_123_conservative",
						groupName: "Conservative",
						average: -0.45,
						numberOfMembers: 380,
						color: "#e53e3e",
						mad: 0.28
					},
					{
						groupId: "pol_123_moderate",
						groupName: "Moderate",
						average: 0.25,
						numberOfMembers: 280,
						color: "#38a169",
						mad: 0.35
					},
					{
						groupId: "pol_123_independent",
						groupName: "Independent",
						average: 0.15,
						numberOfMembers: 320,
						color: "#ed8936",
						mad: 0.42
					}
				]
			},
			{
				groupingQuestionId: "age_group_456",
				groupingQuestionText: "What is your age group?",
				axisAverageAgreement: 0.28,
				axisMAD: 0.38,
				groups: [
					{
						groupId: "age_456_young",
						groupName: "18-35",
						average: 0.52,
						numberOfMembers: 480,
						color: "#9f7aea",
						mad: 0.32
					},
					{
						groupId: "age_456_middle",
						groupName: "36-55",
						average: 0.18,
						numberOfMembers: 420,
						color: "#f56565",
						mad: 0.41
					},
					{
						groupId: "age_456_senior",
						groupName: "55+",
						average: 0.08,
						numberOfMembers: 300,
						color: "#4299e1",
						mad: 0.38
					},
					{
						groupId: "age_456_elderly",
						groupName: "65+",
						average: -0.12,
						numberOfMembers: 200,
						color: "#805ad5",
						mad: 0.35
					}
				]
			},
			{
				groupingQuestionId: "education_level_789",
				groupingQuestionText: "What is your education level?",
				axisAverageAgreement: 0.33,
				axisMAD: 0.41,
				groups: [
					{
						groupId: "edu_789_high_school",
						groupName: "High School",
						average: 0.15,
						numberOfMembers: 280,
						color: "#d69e2e",
						mad: 0.48
					},
					{
						groupId: "edu_789_bachelor",
						groupName: "Bachelor's",
						average: 0.35,
						numberOfMembers: 450,
						color: "#38b2ac",
						mad: 0.36
					},
					{
						groupId: "edu_789_graduate",
						groupName: "Graduate",
						average: 0.48,
						numberOfMembers: 370,
						color: "#667eea",
						mad: 0.29
					}
				]
			},
			{
				groupingQuestionId: "income_level_012",
				groupingQuestionText: "What is your household income?",
				axisAverageAgreement: 0.29,
				axisMAD: 0.44,
				groups: [
					{
						groupId: "inc_012_low",
						groupName: "Under $50k",
						average: 0.58,
						numberOfMembers: 320,
						color: "#f687b3",
						mad: 0.33
					},
					{
						groupId: "inc_012_middle",
						groupName: "$50k-$100k",
						average: 0.22,
						numberOfMembers: 480,
						color: "#4fd1c7",
						mad: 0.42
					},
					{
						groupId: "inc_012_high",
						groupName: "Over $100k",
						average: 0.08,
						numberOfMembers: 400,
						color: "#fc8181",
						mad: 0.38
					}
				]
			}
		]
	},
	{
		statementId: "education_funding_003",
		statement: "Public schools should receive significantly more funding",
		totalEvaluators: 850,
		overallMAD: 0.22,
		averageAgreement: 0.58,
		lastUpdated: Date.now() - 7200000, // 2 hours ago
		color: "#38a169", // Green
		axes: [
			{
				groupingQuestionId: "political_affiliation_123",
				groupingQuestionText: "What is your political affiliation?",
				axisAverageAgreement: 0.58,
				axisMAD: 0.22,
				groups: [
					{
						groupId: "pol_123_liberal",
						groupName: "Liberal",
						average: 0.75,
						numberOfMembers: 290,
						color: "#3182ce",
						mad: 0.18
					},
					{
						groupId: "pol_123_conservative",
						groupName: "Conservative",
						average: 0.35,
						numberOfMembers: 270,
						color: "#e53e3e",
						mad: 0.25
					},
					{
						groupId: "pol_123_moderate",
						groupName: "Moderate",
						average: 0.62,
						numberOfMembers: 190,
						color: "#38a169",
						mad: 0.19
					},
					{
						groupId: "pol_123_independent",
						groupName: "Independent",
						average: 0.58,
						numberOfMembers: 200,
						color: "#ed8936",
						mad: 0.21
					}
				]
			},
			{
				groupingQuestionId: "age_group_456",
				groupingQuestionText: "What is your age group?",
				axisAverageAgreement: 0.61,
				axisMAD: 0.19,
				groups: [
					{
						groupId: "age_456_young",
						groupName: "18-35",
						average: 0.68,
						numberOfMembers: 340,
						color: "#9f7aea",
						mad: 0.22
					},
					{
						groupId: "age_456_middle",
						groupName: "36-55",
						average: 0.72,
						numberOfMembers: 280,
						color: "#f56565",
						mad: 0.18
					},
					{
						groupId: "age_456_senior",
						groupName: "55+",
						average: 0.45,
						numberOfMembers: 230,
						color: "#4299e1",
						mad: 0.28
					},
					{
						groupId: "age_456_elderly",
						groupName: "65+",
						average: 0.38,
						numberOfMembers: 150,
						color: "#805ad5",
						mad: 0.32
					}
				]
			},
			{
				groupingQuestionId: "education_level_789",
				groupingQuestionText: "What is your education level?",
				axisAverageAgreement: 0.55,
				axisMAD: 0.24,
				groups: [
					{
						groupId: "edu_789_high_school",
						groupName: "High School",
						average: 0.48,
						numberOfMembers: 180,
						color: "#d69e2e",
						mad: 0.28
					},
					{
						groupId: "edu_789_bachelor",
						groupName: "Bachelor's",
						average: 0.58,
						numberOfMembers: 350,
						color: "#38b2ac",
						mad: 0.22
					},
					{
						groupId: "edu_789_graduate",
						groupName: "Graduate",
						average: 0.65,
						numberOfMembers: 320,
						color: "#667eea",
						mad: 0.19
					}
				]
			},
			{
				groupingQuestionId: "income_level_012",
				groupingQuestionText: "What is your household income?",
				axisAverageAgreement: 0.56,
				axisMAD: 0.25,
				groups: [
					{
						groupId: "inc_012_low",
						groupName: "Under $50k",
						average: 0.72,
						numberOfMembers: 220,
						color: "#f687b3",
						mad: 0.21
					},
					{
						groupId: "inc_012_middle",
						groupName: "$50k-$100k",
						average: 0.58,
						numberOfMembers: 380,
						color: "#4fd1c7",
						mad: 0.23
					},
					{
						groupId: "inc_012_high",
						groupName: "Over $100k",
						average: 0.38,
						numberOfMembers: 250,
						color: "#fc8181",
						mad: 0.31
					}
				]
			}
		]
	}
];

const PolarizationIndex = () => {
	const canvasRef = useRef(null);
	const [selectedStatementIndex, setSelectedStatementIndex] = useState(0);
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const containerRef = useRef(null);

	// Get current statement data
	const currentStatementData = mockPolarizationData[selectedStatementIndex];

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

		// Draw ALL main statement points
		mockPolarizationData.forEach((statement, index) => {
			const statementPoint = dataToCanvas(statement.averageAgreement, statement.overallMAD);
			const isSelected = index === selectedStatementIndex;

			ctx.fillStyle = statement.color;
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
			ctx.fillText(statement.statementId.replace('_', ' '), statementPoint.x, labelY);
		});

		// Draw groups for SELECTED statement only
		const currentAxis = currentStatementData.axes[selectedAxis];

		currentAxis.groups.forEach((group, index) => {
			const groupPoint = dataToCanvas(group.average, group.mad);

			const baseRadius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));

			ctx.fillStyle = group.color;
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
			ctx.fillText(group.groupName, groupPoint.x, groupPoint.y - baseRadius - 8);
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

	}, [dimensions, selectedAxis, selectedGroup, selectedStatementIndex]);

	// Handle canvas clicks
	const handleCanvasClick = (event) => {
		const canvas = canvasRef.current;
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		// Check for main statement point clicks FIRST
		let clickedStatement = null;
		mockPolarizationData.forEach((statement, index) => {
			const statementPoint = dataToCanvas(statement.averageAgreement, statement.overallMAD);
			const distance = Math.sqrt(
				Math.pow(canvasX - statementPoint.x, 2) + Math.pow(canvasY - statementPoint.y, 2)
			);
			const radius = index === selectedStatementIndex ? 14 : 10;

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
		const currentAxis = currentStatementData.axes[selectedAxis];
		let clickedGroup = null;

		currentAxis.groups.forEach((group, index) => {
			const groupPoint = dataToCanvas(group.average, group.mad);
			const groupDistance = Math.sqrt(
				Math.pow(canvasX - groupPoint.x, 2) + Math.pow(canvasY - groupPoint.y, 2)
			);

			const radius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));

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

	const currentAxis = currentStatementData.axes[selectedAxis];
	const selectedGroupData = selectedGroup !== null ? currentAxis.groups[selectedGroup] : null;

	return (
		<div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
			{/* Header */}
			<div style={{ marginBottom: '20px' }}>
				<h1 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
					Polarization Analysis - All Statements
				</h1>
				<p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
					Selected Statement: <strong>{currentStatementData.statement}</strong>
				</p>

				{/* Statement Legend */}
				<div style={{ marginBottom: '20px' }}>
					<h3 style={{ marginBottom: '10px', color: '#333' }}>Statements (Click on chart to select):</h3>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
						{mockPolarizationData.map((statement, index) => (
							<div
								key={statement.statementId}
								onClick={() => {
									setSelectedStatementIndex(index);
									setSelectedAxis(0);
									setSelectedGroup(null);
								}}
								style={{
									padding: '8px 12px',
									backgroundColor: selectedStatementIndex === index ? statement.color : '#f7fafc',
									color: selectedStatementIndex === index ? 'white' : '#333',
									border: `2px solid ${statement.color}`,
									borderRadius: '6px',
									cursor: 'pointer',
									fontSize: '14px',
									maxWidth: '300px',
									textAlign: 'left'
								}}
							>
								<div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{statement.statementId}</div>
								<div style={{ fontSize: '12px', opacity: selectedStatementIndex === index ? 0.9 : 0.7 }}>
									{statement.statement}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Axis Selector */}
				<div style={{ marginBottom: '20px' }}>
					<h3 style={{ marginBottom: '10px', color: '#333' }}>Select Grouping for "{currentStatementData.statementId}":</h3>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
						{currentStatementData.axes.map((axis, index) => (
							<button
								key={axis.groupingQuestionId}
								onClick={() => {
									setSelectedAxis(index);
									setSelectedGroup(null);
								}}
								style={{
									padding: '8px 16px',
									backgroundColor: selectedAxis === index ? '#38a169' : '#f7fafc',
									color: selectedAxis === index ? 'white' : '#333',
									border: '1px solid #e2e8f0',
									borderRadius: '6px',
									cursor: 'pointer',
									fontSize: '14px'
								}}
							>
								{axis.groupingQuestionText}
							</button>
						))}
					</div>
				</div>
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
						<div><strong>Statement:</strong> {currentStatementData.statementId}</div>
						<div><strong>Total Evaluators:</strong> {currentStatementData.totalEvaluators}</div>
						<div><strong>Average Agreement:</strong> {currentStatementData.averageAgreement.toFixed(3)}</div>
						<div><strong>Polarization (MAD):</strong> {currentStatementData.overallMAD.toFixed(3)}</div>
						<div><strong>Last Updated:</strong> {new Date(currentStatementData.lastUpdated).toLocaleString()}</div>
					</div>
				</div>

				{/* Current Axis Stats */}
				<div style={{ backgroundColor: '#f7fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
					<h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
						{currentAxis.groupingQuestionText}
					</h3>
					<div style={{ fontSize: '14px', lineHeight: '1.6' }}>
						<div><strong>Axis Average:</strong> {currentAxis.axisAverageAgreement.toFixed(3)}</div>
						<div><strong>Axis MAD:</strong> {currentAxis.axisMAD.toFixed(3)}</div>
						<div><strong>Groups:</strong> {currentAxis.groups.length}</div>
						<div><strong>Total Members:</strong> {currentAxis.groups.reduce((sum, g) => sum + g.numberOfMembers, 0)}</div>
					</div>
				</div>
			</div>

			{/* Group Details */}
			{selectedGroupData && (
				<div style={{ backgroundColor: '#fffdf7', padding: '16px', borderRadius: '8px', border: '2px solid #fbbf24', marginBottom: '20px' }}>
					<h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
						Selected Group: {selectedGroupData.groupName}
					</h3>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '14px' }}>
						<div><strong>Average Opinion:</strong> {selectedGroupData.average.toFixed(3)}</div>
						<div><strong>Members:</strong> {selectedGroupData.numberOfMembers}</div>
						<div><strong>Internal MAD:</strong> {selectedGroupData.mad.toFixed(3)}</div>
						<div><strong>Color:</strong> <span
							style={{
								display: 'inline-block',
								width: '20px',
								height: '20px',
								backgroundColor: selectedGroupData.color,
								borderRadius: '3px',
								verticalAlign: 'middle',
								marginLeft: '8px',
								border: '1px solid #ccc'
							}}
						></span> {selectedGroupData.color}</div>
					</div>
				</div>
			)}

			{/* Groups List */}
			<div style={{ marginBottom: '20px' }}>
				<h3 style={{ marginBottom: '16px', color: '#333' }}>Groups in Current Axis</h3>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
					{currentAxis.groups.map((group, index) => (
						<div
							key={group.groupId}
							onClick={() => setSelectedGroup(selectedGroup === index ? null : index)}
							style={{
								padding: '12px',
								borderRadius: '8px',
								border: `2px solid ${selectedGroup === index ? group.color : '#e2e8f0'}`,
								backgroundColor: selectedGroup === index ? `${group.color}15` : '#f7fafc',
								cursor: 'pointer',
								transition: 'all 0.2s ease'
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
								<div
									style={{
										width: '12px',
										height: '12px',
										backgroundColor: group.color,
										borderRadius: '50%',
										marginRight: '8px'
									}}
								/>
								<strong>{group.groupName}</strong>
							</div>
							<div style={{ fontSize: '14px', lineHeight: '1.4' }}>
								<div>Average: {group.average.toFixed(3)}</div>
								<div>Members: {group.numberOfMembers}</div>
								<div>MAD: {group.mad.toFixed(3)}</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* All Statements Summary */}
			<div style={{ marginBottom: '20px' }}>
				<h3 style={{ marginBottom: '16px', color: '#333' }}>All Statements Overview</h3>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
					{mockPolarizationData.map((statement, index) => (
						<div
							key={statement.statementId}
							onClick={() => {
								setSelectedStatementIndex(index);
								setSelectedAxis(0);
								setSelectedGroup(null);
							}}
							style={{
								padding: '16px',
								borderRadius: '8px',
								border: `2px solid ${statement.color}`,
								backgroundColor: selectedStatementIndex === index ? `${statement.color}15` : '#f7fafc',
								cursor: 'pointer',
								transition: 'all 0.2s ease'
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
								<div
									style={{
										width: '16px',
										height: '16px',
										backgroundColor: statement.color,
										borderRadius: '50%',
										marginRight: '8px'
									}}
								/>
								<strong style={{ fontSize: '16px' }}>{statement.statementId}</strong>
							</div>
							<div style={{ fontSize: '14px', marginBottom: '8px', color: '#666' }}>
								{statement.statement}
							</div>
							<div style={{ fontSize: '12px', lineHeight: '1.4' }}>
								<div><strong>Agreement:</strong> {statement.averageAgreement.toFixed(3)}</div>
								<div><strong>Polarization:</strong> {statement.overallMAD.toFixed(3)}</div>
								<div><strong>Evaluators:</strong> {statement.totalEvaluators}</div>
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