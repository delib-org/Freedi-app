import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	statementId?: string;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
	errorCount: number;
	lastErrorTime: number;
}

/**
 * Error boundary for mind-map components
 * Provides graceful error handling and recovery
 */
export class MindMapErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			errorCount: 0,
			lastErrorTime: 0,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		// Update state so the next render will show the fallback UI
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		const { statementId, onError } = this.props;
		const { errorCount, lastErrorTime } = this.state;

		// Log error with context
		logError(error, {
			operation: 'MindMapErrorBoundary.componentDidCatch',
			statementId,
			metadata: {
				componentStack: errorInfo.componentStack,
				errorCount: errorCount + 1,
				timeSinceLastError: Date.now() - lastErrorTime,
			},
		});

		// Update error state
		this.setState({
			errorInfo,
			errorCount: errorCount + 1,
			lastErrorTime: Date.now(),
		});

		// Call custom error handler if provided
		if (onError) {
			onError(error, errorInfo);
		}

		// Check for error loop
		if (this.isErrorLoop()) {
			this.handleErrorLoop();
		}
	}

	/**
	 * Check if we're in an error loop
	 */
	private isErrorLoop(): boolean {
		const { errorCount, lastErrorTime } = this.state;
		const timeSinceLastError = Date.now() - lastErrorTime;

		// If we've had more than 3 errors in the last 5 seconds, it's likely a loop
		return errorCount > 3 && timeSinceLastError < 5000;
	}

	/**
	 * Handle error loop by showing a more severe error message
	 */
	private handleErrorLoop(): void {
		logError(new Error('Mind-map error loop detected'), {
			operation: 'MindMapErrorBoundary.handleErrorLoop',
			metadata: {
				errorCount: this.state.errorCount,
				lastError: this.state.error?.message,
			},
		});
	}

	/**
	 * Retry rendering
	 */
	handleRetry = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
			// Keep error count to track retries
		});
	};

	/**
	 * Reset error boundary completely
	 */
	handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
			errorCount: 0,
			lastErrorTime: 0,
		});

		// Reload the page if error persists
		if (this.state.errorCount > 5) {
			window.location.reload();
		}
	};

	render() {
		const { hasError, error, errorInfo, errorCount } = this.state;
		const { children, fallback } = this.props;

		if (hasError && error) {
			// Check if we should show custom fallback
			if (fallback) {
				return <>{fallback}</>;
			}

			// Check if it's an error loop
			if (this.isErrorLoop()) {
				return (
					<div className="mind-map-error mind-map-error--critical">
						<div className="mind-map-error__container">
							<h2 className="mind-map-error__title">Critical Error</h2>
							<p className="mind-map-error__message">
								The mind-map is experiencing repeated errors and cannot recover.
							</p>
							<div className="mind-map-error__actions">
								<button className="btn btn--primary" onClick={() => window.location.reload()}>
									Reload Page
								</button>
							</div>
							<details className="mind-map-error__details">
								<summary>Error Details</summary>
								<pre>{error.stack}</pre>
								<p>Error count: {errorCount}</p>
							</details>
						</div>
					</div>
				);
			}

			// Regular error display
			return (
				<div className="mind-map-error">
					<div className="mind-map-error__container">
						<h2 className="mind-map-error__title">{MINDMAP_CONFIG.ERROR_MESSAGES.LOAD_FAILED}</h2>
						<p className="mind-map-error__message">
							{error.message || 'An unexpected error occurred while rendering the mind-map.'}
						</p>

						<div className="mind-map-error__actions">
							<button
								className="btn btn--primary"
								onClick={this.handleRetry}
								disabled={errorCount > 5}
							>
								{errorCount > 0 ? `Retry (${errorCount})` : 'Retry'}
							</button>
							<button className="btn btn--secondary" onClick={this.handleReset}>
								Reset
							</button>
						</div>

						{/* Development mode: show detailed error */}
						{process.env.NODE_ENV === 'development' && errorInfo && (
							<details className="mind-map-error__details">
								<summary>Error Details (Development Only)</summary>
								<pre className="mind-map-error__stack">{error.stack}</pre>
								<pre className="mind-map-error__component-stack">{errorInfo.componentStack}</pre>
							</details>
						)}
					</div>
				</div>
			);
		}

		return children;
	}
}

/**
 * Higher-order component to wrap any component with error boundary
 */
export function withMindMapErrorBoundary<P extends object>(
	Component: React.ComponentType<P>,
	fallback?: ReactNode,
): React.FC<P> {
	const WrappedComponent: React.FC<P> = (props: P) => (
		<MindMapErrorBoundary fallback={fallback}>
			<Component {...props} />
		</MindMapErrorBoundary>
	);

	WrappedComponent.displayName = `withMindMapErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

	return WrappedComponent;
}

/**
 * Hook for error handling in functional components
 */
export function useMindMapError() {
	const [error, setError] = React.useState<Error | null>(null);

	React.useEffect(() => {
		if (error) {
			throw error;
		}
	}, [error]);

	const throwError = React.useCallback((error: Error) => {
		setError(error);
	}, []);

	const clearError = React.useCallback(() => {
		setError(null);
	}, []);

	return { throwError, clearError };
}

/**
 * Error boundary styles
 */
const styles = `
  .mind-map-error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 2rem;
    background: var(--background-secondary, #f5f5f5);
    border-radius: 8px;
    margin: 1rem;
  }

  .mind-map-error--critical {
    background: var(--error-bg, #ffe6e6);
    border: 2px solid var(--error, #ff4444);
  }

  .mind-map-error__container {
    max-width: 600px;
    text-align: center;
  }

  .mind-map-error__title {
    color: var(--error, #ff4444);
    margin-bottom: 1rem;
    font-size: 1.5rem;
  }

  .mind-map-error__message {
    color: var(--text-body);
    margin-bottom: 2rem;
    line-height: 1.6;
  }

  .mind-map-error__actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .mind-map-error__details {
    margin-top: 2rem;
    text-align: left;
    background: white;
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .mind-map-error__details summary {
    cursor: pointer;
    font-weight: bold;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }

  .mind-map-error__stack,
  .mind-map-error__component-stack {
    overflow-x: auto;
    padding: 1rem;
    background: #f8f8f8;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.875rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn--primary {
    background: var(--btn-primary);
    color: white;
  }

  .btn--primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn--secondary {
    background: var(--btn-secondary, #e0e0e0);
    color: var(--text-body);
  }

  .btn--secondary:hover:not(:disabled) {
    background: var(--btn-secondary-hover, #d0d0d0);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
	const styleElement = document.createElement('style');
	styleElement.innerHTML = styles;
	document.head.appendChild(styleElement);
}
