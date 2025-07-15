import React from 'react';
import { render } from '@testing-library/react';

// Simple component to test React 19 features
const TestComponent: React.FC = () => {
	return <div data-testid="test-component">Hello React 19!</div>;
};

describe('React 19 Features', () => {
	it('renders components correctly', () => {
		const { getByTestId } = render(<TestComponent />);
		expect(getByTestId('test-component')).toBeInTheDocument();
	});

	it('works with React 19 JSX transform', () => {
		// Test that React 19 JSX transform is working
		const { container } = render(<TestComponent />);
		expect(container).toBeInTheDocument();
	});

	it('supports modern React features', () => {
		// Test that basic React features work
		const { getByText } = render(<TestComponent />);
		expect(getByText('Hello React 19!')).toBeInTheDocument();
	});
});