import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import type { PolarizationStatement } from '../types';

import PolarizationIndexRefactored from '../PolarizationIndexRefactored';

// Mock the database listener
jest.mock('@/controllers/db/polarizationIndex/getPolarizationIndex', () => ({
	listenToPolarizationIndex: jest.fn(() => () => { }),
}));

// Mock react-router useParams
jest.mock('react-router', () => ({
	...jest.requireActual('react-router'),
	useParams: () => ({
		statementId: 'test-statement-id',
	}),
}));

// Define types for test data
interface MockUserDataState {
	polarizationIndexes: Record<string, PolarizationStatement[]>;
}

interface MockAction {
	type: string;
	payload?: Record<string, PolarizationStatement[]>;
}

// Mock Redux selector to return empty data initially
const mockUserDataReducer = (state: MockUserDataState = { polarizationIndexes: {} }, action: MockAction) => {
	switch (action.type) {
		case 'SET_TEST_DATA':
			return { polarizationIndexes: action.payload || {} };
		default:
			return state;
	}
};

// Create mock store
const createMockStore = (initialState: Record<string, PolarizationStatement[]> = {}) => {
	return configureStore({
		reducer: {
			userData: mockUserDataReducer,
		},
		preloadedState: {
			userData: { polarizationIndexes: initialState },
		},
	});
};

// Test wrapper
const TestWrapper: React.FC<{
	children: React.ReactNode;
	store?: ReturnType<typeof createMockStore>;
}> = ({
	children,
	store = createMockStore()
}) => (
		<Provider store={store}>
			<BrowserRouter>
				{children}
			</BrowserRouter>
		</Provider>
	);

describe('PolarizationIndexRefactored', () => {
	beforeEach(() => {
		// Clear all mocks before each test
		jest.clearAllMocks();
	});

	test('renders loading state initially', () => {
		render(
			<TestWrapper>
				<PolarizationIndexRefactored />
			</TestWrapper>
		);

		expect(screen.getByText('Loading Polarization Analysis...')).toBeInTheDocument();
		expect(screen.getByText('📊 Loading data...')).toBeInTheDocument();
	});

	test('renders no data state when no polarization data is available', async () => {
		render(
			<TestWrapper>
				<PolarizationIndexRefactored />
			</TestWrapper>
		);

		// Wait for loading to complete and no data state to appear
		await waitFor(
			() => {
				expect(screen.getByText('No Polarization Data Available')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});

	test('renders with mock data', () => {
		const mockData = {
			'test-statement-id': [
				{
					statementId: 'statement-1',
					statement: 'Test statement',
					averageAgreement: 0.5,
					overallMAD: 0.3,
					totalEvaluators: 10,
					color: '#ff0000',
					axes: [
						{
							groupingQuestionText: 'Age Group',
							axisAverageAgreement: 0.4,
							axisMAD: 0.2,
							groups: [
								{
									groupName: 'Young',
									average: 0.6,
									mad: 0.1,
									numberOfMembers: 5,
									color: '#00ff00'
								}
							]
						}
					]
				}
			]
		};

		const store = createMockStore(mockData);

		render(
			<TestWrapper store={store}>
				<PolarizationIndexRefactored />
			</TestWrapper>
		);

		// Should not show loading or no data states
		expect(screen.queryByText('Loading Polarization Analysis...')).not.toBeInTheDocument();
		expect(screen.queryByText('No Polarization Data Available')).not.toBeInTheDocument();

		// Should show the main component
		expect(screen.getByText('Polarization Analysis - All Statements')).toBeInTheDocument();
	});
});

const testExport = {};
export default testExport;
