import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class StatementErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('StatementErrorBoundary caught an error:', error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: undefined });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="error-boundary">
					<div className="error-content">
						<h2>Something went wrong</h2>
						<p>We're sorry, but something unexpected happened.</p>
						{this.state.error && (
							<details className="error-details">
								<summary>Error details</summary>
								<pre>{this.state.error.message}</pre>
							</details>
						)}
						<button onClick={this.handleRetry} className="retry-button">
							Try again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
