import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import styles from './ErrorBoundary.module.scss';
import {
	generateBugReportEmail,
	getUserFriendlyErrorMessage,
	formatErrorDetails,
	isChunkLoadError,
	handleChunkLoadError,
} from '../../utils/errorBoundaryHelpers';

interface Props {
	children: ReactNode;
	fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
	errorBoundaryKey: number;
	showDetails: boolean;
}

export class RootErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			errorBoundaryKey: 0,
			showDetails: false,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return {
			hasError: true,
			error,
			errorBoundaryKey: Date.now(),
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// Log to console in development
		if (import.meta.env.DEV) {
			console.error('Error caught by boundary:', error, errorInfo);
		}

		// Check for chunk loading errors (stale cache after deployment)
		if (isChunkLoadError(error)) {
			console.info('Chunk loading error detected, reloading to get latest version...');
			handleChunkLoadError();

			return; // Don't continue, page will reload
		}

		// Send to Sentry
		Sentry.withScope((scope) => {
			scope.setExtras({
				componentStack: errorInfo.componentStack,
				digest: errorInfo.digest,
			});
			scope.setLevel('error');
			scope.setContext('errorBoundary', {
				componentStack: errorInfo.componentStack,
			});
			Sentry.captureException(error);
		});

		// Update state with error info
		this.setState({
			errorInfo,
		});
	}

	resetError = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
			errorBoundaryKey: this.state.errorBoundaryKey + 1,
			showDetails: false,
		});
	};

	toggleDetails = () => {
		this.setState((prevState) => ({
			showDetails: !prevState.showDetails,
		}));
	};

	render() {
		if (this.state.hasError) {
			const { fallback: Fallback } = this.props;

			if (Fallback) {
				return <Fallback error={this.state.error!} resetError={this.resetError} />;
			}

			// Default fallback UI
			return (
				<DefaultErrorFallback
					error={this.state.error!}
					errorInfo={this.state.errorInfo}
					resetError={this.resetError}
					showDetails={this.state.showDetails}
					toggleDetails={this.toggleDetails}
				/>
			);
		}

		return <React.Fragment key={this.state.errorBoundaryKey}>{this.props.children}</React.Fragment>;
	}
}

// Default error UI component
const DefaultErrorFallback: React.FC<{
	error: Error;
	errorInfo: ErrorInfo | null;
	resetError: () => void;
	showDetails: boolean;
	toggleDetails: () => void;
}> = ({ error, errorInfo, resetError, showDetails, toggleDetails }) => {
	const isDev = import.meta.env.DEV;
	const currentUrl = window.location.href;
	const friendlyMessage = getUserFriendlyErrorMessage(error);

	const handleReportBug = () => {
		const emailLink = generateBugReportEmail({
			error,
			errorInfo,
			url: currentUrl,
			isDevelopment: isDev,
		});
		window.location.href = emailLink;
	};

	const handleGoHome = () => {
		window.location.href = '/';
	};

	return (
		<div className={styles.errorBoundary}>
			<div className={styles.errorBoundary__backdrop} />
			<div className={styles.errorBoundary__container}>
				{/* Decorative gradient background */}
				<div className={styles.errorBoundary__gradient} />

				{/* Main content card */}
				<div className={styles.errorBoundary__card}>
					{/* Icon section with animation */}
					<div className={styles.errorBoundary__iconWrapper}>
						<div className={styles.errorBoundary__iconCircle}>
							<svg
								className={styles.errorBoundary__icon}
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M12 9V13M12 17H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0377 2.66667 10.2679 4L3.33975 16C2.56995 17.3333 3.53223 19 5.07183 19Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
					</div>

					{/* Title - Bilingual */}
					<div className={styles.errorBoundary__header}>
						<h1 className={styles.errorBoundary__title}>{friendlyMessage.titleHebrew}</h1>
						<h2 className={styles.errorBoundary__subtitle}>{friendlyMessage.title}</h2>
					</div>

					{/* Description - Bilingual */}
					<div className={styles.errorBoundary__description}>
						<p className={styles.errorBoundary__descriptionHebrew}>
							{friendlyMessage.descriptionHebrew}
						</p>
						<p className={styles.errorBoundary__descriptionEnglish}>
							{friendlyMessage.description}
						</p>
					</div>

					{/* Current URL display */}
					<div className={styles.errorBoundary__urlContainer}>
						<span className={styles.errorBoundary__urlLabel}>URL:</span>
						<span className={styles.errorBoundary__urlText}>{currentUrl}</span>
					</div>

					{/* Error details - collapsible */}
					{isDev && (
						<div className={styles.errorBoundary__detailsContainer}>
							<button
								className={styles.errorBoundary__detailsToggle}
								onClick={toggleDetails}
								aria-expanded={showDetails}
							>
								<span>{showDetails ? 'Hide' : 'Show'} Error Details</span>
								<svg
									className={`${styles.errorBoundary__detailsIcon} ${showDetails ? styles['errorBoundary__detailsIcon--open'] : ''}`}
									viewBox="0 0 24 24"
									fill="none"
								>
									<path
										d="M19 9L12 16L5 9"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>

							{showDetails && (
								<div className={styles.errorBoundary__details}>
									<pre className={styles.errorBoundary__detailsContent}>
										{formatErrorDetails(error, errorInfo)}
									</pre>
								</div>
							)}
						</div>
					)}

					{/* Action buttons */}
					<div className={styles.errorBoundary__actions}>
						<button
							className={`btn btn--primary ${styles.errorBoundary__button}`}
							onClick={resetError}
						>
							<svg viewBox="0 0 24 24" fill="none" className={styles.errorBoundary__buttonIcon}>
								<path
									d="M4 4V9H4.58152M19.9381 11C19.446 7.05369 16.0796 4 12 4C8.64262 4 5.76829 6.06817 4.58152 9M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.2317 17.9318 15.3574 20 12 20C7.92038 20 4.55399 16.9463 4.06189 13M19.4185 15H15"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
							<span>נסה שוב / Try Again</span>
						</button>

						<button
							className={`btn btn--secondary ${styles.errorBoundary__button}`}
							onClick={handleGoHome}
						>
							<svg viewBox="0 0 24 24" fill="none" className={styles.errorBoundary__buttonIcon}>
								<path
									d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
								<path
									d="M9 22V12H15V22"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
							<span>לדף הבית / Go Home</span>
						</button>

						<button
							className={`btn ${styles.errorBoundary__reportButton}`}
							onClick={handleReportBug}
						>
							<svg viewBox="0 0 24 24" fill="none" className={styles.errorBoundary__buttonIcon}>
								<path
									d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
								<path
									d="M22 6L12 13L2 6"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
							<span>דווח על באג / Report Bug</span>
						</button>
					</div>

					{/* Footer message */}
					{!isDev && (
						<div className={styles.errorBoundary__footer}>
							<p className={styles.errorBoundary__footerText}>
								השגיאה נשמרה ותטופל בהקדם / The error has been logged and will be addressed soon
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

// Wrapper component for Sentry fallback that provides all required props
const SentryFallback: React.FC<{ error: Error; resetError: () => void }> = ({
	error,
	resetError,
}) => {
	const [showDetails, setShowDetails] = React.useState(false);
	const toggleDetails = () => setShowDetails((prev) => !prev);

	return (
		<DefaultErrorFallback
			error={error}
			errorInfo={null}
			resetError={resetError}
			showDetails={showDetails}
			toggleDetails={toggleDetails}
		/>
	);
};

// Export the Sentry-wrapped version for automatic error tracking
export default Sentry.withErrorBoundary(RootErrorBoundary, {
	fallback: ({ error, resetError }) => (
		<SentryFallback error={error as Error} resetError={resetError} />
	),
	showDialog: false,
});
