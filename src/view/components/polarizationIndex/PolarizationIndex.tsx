import React, { useState, useEffect, useRef } from 'react';

import styles from './PolarizationIndex.module.scss';

// Mock data based on your schema - array of different statements
const mockPolarizationData = [
	{
		statementId: "climate_policy_001",
		statementText: "Government should implement carbon taxes to combat climate change",
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
		statementText: "Universal healthcare should be implemented nationwide",
		totalEvaluators: 1200,
		overallMAD: 0.43,
		averageAgreement: 0.31,
		lastUpdated: Date.now() - 3600000, // 1 hour ago
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
		statementText: "Public schools should receive significantly more funding",
		totalEvaluators: 850,
		overallMAD: 0.22,
		averageAgreement: 0.58,
		lastUpdated: Date.now() - 7200000, // 2 hours ago
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

const PolarizationIndex = ({ initialStatementId }: { initialStatementId?: string } = {}) => {
	const canvasRef = useRef(null); const [selectedStatementIndex, setSelectedStatementIndex] = useState(() => {
		if (initialStatementId) {
			const index = mockPolarizationData.findIndex(statement => statement.statementId === initialStatementId);

			return index >= 0 ? index : 0;
		}

		return 0;
	});
	const [selectedAxis, setSelectedAxis] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [isMainPointPressed, setIsMainPointPressed] = useState(false);
	const [subGroupsAnimation, setSubGroupsAnimation] = useState(0); // 0-1 animation progress
	const containerRef = useRef(null);
	const isAnimatingRef = useRef(false);

	// Get current statement data
	const currentStatementData = mockPolarizationData[selectedStatementIndex];

	// Animation effect for sub-groups
	useEffect(() => {
		let animationFrame;
		if (isMainPointPressed && subGroupsAnimation < 1) {
			// Animate in
			if (!isAnimatingRef.current) {
				isAnimatingRef.current = true;
				const startTime = Date.now();
				const duration = 300; // 300ms animation

				const animate = () => {
					const elapsed = Date.now() - startTime;
					const progress = Math.min(elapsed / duration, 1);

					// Easing function (ease-out)
					const easedProgress = 1 - Math.pow(1 - progress, 3);

					setSubGroupsAnimation(easedProgress); if (progress < 1) {
						animationFrame = requestAnimationFrame(animate);
					} else {
						isAnimatingRef.current = false;
					}
				};

				animationFrame = requestAnimationFrame(animate);
			}
		} else if (!isMainPointPressed && subGroupsAnimation > 0) {
			// Animate out
			if (!isAnimatingRef.current) {
				isAnimatingRef.current = true;
				const startTime = Date.now();
				const currentProgress = subGroupsAnimation;
				const duration = 200; // Faster animation out

				const animate = () => {
					const elapsed = Date.now() - startTime;
					const progress = Math.min(elapsed / duration, 1);

					// Easing function (ease-in)
					const easedProgress = Math.pow(1 - progress, 2);

					setSubGroupsAnimation(currentProgress * easedProgress);

					if (progress < 1) {
						animationFrame = requestAnimationFrame(animate);
					} else {
						setSubGroupsAnimation(0);
						isAnimatingRef.current = false;
					}
				};

				animationFrame = requestAnimationFrame(animate);
			}
		}

		return () => {
			if (animationFrame) {
				cancelAnimationFrame(animationFrame);
			}
		};
	}, [isMainPointPressed]); // Only depend on isMainPointPressed, not subGroupsAnimation

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

	// Global mouse/touch release handlers to catch releases outside canvas
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isMainPointPressed) {
				setIsMainPointPressed(false);
				setSelectedGroup(null);
			}
		};

		const handleGlobalTouchEnd = () => {
			if (isMainPointPressed) {
				setIsMainPointPressed(false);
				setSelectedGroup(null);
			}
		};

		document.addEventListener('mouseup', handleGlobalMouseUp);
		document.addEventListener('touchend', handleGlobalTouchEnd);

		return () => {
			document.removeEventListener('mouseup', handleGlobalMouseUp);
			document.removeEventListener('touchend', handleGlobalTouchEnd);
		};
	}, [isMainPointPressed]);

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
	// const canvasToData = (canvasX, canvasY) => {
	//   const margin = 60;
	//   const plotWidth = dimensions.width - 2 * margin;
	//   const plotHeight = dimensions.height - 2 * margin;
	//   
	//   const dataX = ((canvasX - margin) / plotWidth) * 2 - 1;
	//   const dataY = (dimensions.height - margin - canvasY) / plotHeight;
	//   
	//   return { x: dataX, y: dataY };
	// };

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
		const overallPoint = dataToCanvas(currentStatementData.averageAgreement, currentStatementData.overallMAD);
		ctx.fillStyle = '#ff6b6b';
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 3;

		ctx.beginPath();
		ctx.arc(overallPoint.x, overallPoint.y, 12, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();		// Draw groups for selected axis (only when main point is pressed)
		if (subGroupsAnimation > 0) {
			const currentAxis = currentStatementData.axes[selectedAxis];

			currentAxis.groups.forEach((group, index) => {
				// Use the group's own MAD for consistent positioning
				const groupPoint = dataToCanvas(group.average, group.mad);

				// Apply animation scaling and opacity
				const animatedAlpha = subGroupsAnimation;
				const baseRadius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));
				const animatedRadius = baseRadius * subGroupsAnimation;

				// Set opacity based on animation progress
				ctx.globalAlpha = animatedAlpha;

				ctx.fillStyle = group.color;
				ctx.strokeStyle = selectedGroup === index ? '#000' : '#fff';
				ctx.lineWidth = selectedGroup === index ? 3 : 2;

				ctx.beginPath();
				ctx.arc(groupPoint.x, groupPoint.y, animatedRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();

				// Group label with animation
				ctx.fillStyle = '#333';
				ctx.font = '11px Arial';
				ctx.textAlign = 'center';
				ctx.fillText(group.groupName, groupPoint.x, groupPoint.y - animatedRadius - 8);

				// Reset global alpha
				ctx.globalAlpha = 1.0;
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
		ctx.fillText('Maximum Polarization', vertex3.x, vertex3.y - 20); ctx.fillText('(0, 1)', vertex3.x, vertex3.y - 8);

	}, [dimensions, selectedAxis, selectedGroup, isMainPointPressed, subGroupsAnimation]);
	// Handle canvas clicks and mouse/touch events
	const handleCanvasMouseDown = (event) => {
		const canvas = canvasRef.current;
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		const mainPointClicked = checkMainPointClick(canvasX, canvasY);

		// If main point wasn't clicked and sub-groups are visible, check for group clicks
		if (!mainPointClicked && isMainPointPressed && subGroupsAnimation > 0.5) {
			checkGroupClick(canvasX, canvasY);
		}
	}; const handleCanvasTouchStart = (event) => {
		event.preventDefault();
		const canvas = canvasRef.current;
		const rect = canvas.getBoundingClientRect();
		const touch = event.touches[0];
		const canvasX = touch.clientX - rect.left;
		const canvasY = touch.clientY - rect.top;

		const mainPointClicked = checkMainPointClick(canvasX, canvasY);

		// If main point wasn't clicked and sub-groups are visible, check for group clicks
		if (!mainPointClicked && isMainPointPressed && subGroupsAnimation > 0.5) {
			checkGroupClick(canvasX, canvasY);
		}
	};
	const checkGroupClick = (canvasX, canvasY) => {
		const currentAxis = currentStatementData.axes[selectedAxis];
		currentAxis.groups.forEach((group, index) => {
			// Use the group's own average and mad, not the axis MAD
			const groupPoint = dataToCanvas(group.average, group.mad);
			const groupDistance = Math.sqrt(
				Math.pow(canvasX - groupPoint.x, 2) + Math.pow(canvasY - groupPoint.y, 2)
			);

			const radius = Math.max(6, Math.min(15, Math.sqrt(group.numberOfMembers / 10)));

			if (groupDistance <= radius + 5) {
				setSelectedGroup(selectedGroup === index ? null : index);
			}
		});
	};
	const handleCanvasMouseUp = () => {
		setIsMainPointPressed(false);
		setSelectedGroup(null); // Clear selected group when releasing main point
	};
	const handleCanvasTouchEnd = () => {
		setIsMainPointPressed(false);
		setSelectedGroup(null); // Clear selected group when releasing main point
	}; const checkMainPointClick = (canvasX, canvasY) => {
		const overallPoint = dataToCanvas(currentStatementData.averageAgreement, currentStatementData.overallMAD);
		const distance = Math.sqrt(
			Math.pow(canvasX - overallPoint.x, 2) + Math.pow(canvasY - overallPoint.y, 2)
		);

		const mainRadius = isMainPointPressed ? 16 : 12;
		const clickThreshold = mainRadius + 8;

		if (distance <= clickThreshold) {
			setIsMainPointPressed(true);
			setSelectedGroup(null); // Clear any selected group

			return true; // Indicate main point was clicked
		}

		return false; // Main point was not clicked
	};
	const handleCanvasClick = () => {
		// This function is kept for backward compatibility but main logic moved to mouse/touch handlers
	};

	const currentAxis = currentStatementData.axes[selectedAxis];
	const selectedGroupData = selectedGroup !== null ? currentAxis.groups[selectedGroup] : null;

	return (
		<div className={styles.polarizationContainer}>			{/* Header */}
			<div className={styles.header}>
				<h1 className={styles.title}>
					Polarization Analysis
				</h1>
				<p className={styles.subtitle}>
					Statement: {currentStatementData.statementText}
				</p>

				{/* Statement Selector */}
				<div className={styles.statementSelector}>
					{mockPolarizationData.map((statement, index) => (
						<button
							key={statement.statementId}
							onClick={() => {
								setSelectedStatementIndex(index);
								setSelectedAxis(0);
								setSelectedGroup(null);
								setIsMainPointPressed(false);
							}}
							className={`${styles.statementButton} ${selectedStatementIndex === index ? styles.statementButtonActive : ''}`}
						>
							<div className={styles.statementButtonTitle}>{statement.statementId}</div>
							<div className={styles.statementButtonText}>{statement.statementText}</div>
						</button>
					))}
				</div>

				{/* Axis Selector */}
				<div className={styles.axisSelector}>
					{currentStatementData.axes.map((axis, index) => (
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
					onMouseDown={handleCanvasMouseDown}
					onMouseUp={handleCanvasMouseUp}
					onTouchStart={handleCanvasTouchStart}
					onTouchEnd={handleCanvasTouchEnd}
					className={styles.canvas}
				/>

				{/* Main Point Tooltip */}
				{isMainPointPressed && (
					<div className={styles.mainPointTooltip}>
						Overall Position
					</div>
				)}
			</div>

			{/* Statistics Panel */}
			<div className={styles.statsGrid}>
				{/* Overall Stats */}
				<div className={styles.statsCard}>
					<h3 className={styles.statsCardTitle}>Overall Metrics</h3>				<div className={styles.statsContent}>
						<div><strong>Total Evaluators:</strong> {currentStatementData.totalEvaluators}</div>
						<div><strong>Average Agreement:</strong> {currentStatementData.averageAgreement.toFixed(3)}</div>
						<div><strong>Polarization (MAD):</strong> {currentStatementData.overallMAD.toFixed(3)}</div>
						<div><strong>Last Updated:</strong> {new Date(currentStatementData.lastUpdated).toLocaleString()}</div>
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
			</div>			{/* Instructions */}
			<div className={styles.instructions}>
				💡 Press and hold the main red point to reveal sub-groups. Click on sub-group dots while holding to see detailed information. Switch between different grouping questions using the buttons above.
			</div>
		</div>
	);
};

export default PolarizationIndex;