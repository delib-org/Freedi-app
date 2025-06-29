import React from 'react';

interface ErrorBoundaryState {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends React.Component<
	React.PropsWithChildren<{}>,
	ErrorBoundaryState
> {
	constructor(props: React.PropsWithChildren<{}>) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// Log error to console (visible in android:logs)
		console.error('React Error Boundary caught an error:', error, errorInfo);

		// In production, you could send this to a logging service
		// logErrorToService(error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div style={{ padding: '20px', textAlign: 'center' }}>
					<h2>🚨 Something went wrong!</h2>
					<details style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>
						{this.state.error && this.state.error.toString()}
					</details>
					<button onClick={() => this.setState({ hasError: false })}>
						Try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
