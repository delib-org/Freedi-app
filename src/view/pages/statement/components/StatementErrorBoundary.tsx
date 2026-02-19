import React, { Component, ErrorInfo, ReactNode } from 'react';
import styles from './StatementErrorBoundary.module.scss';
import {
	generateBugReportEmail,
	getUserFriendlyErrorMessage,
	formatErrorDetails,
} from '../../../../utils/errorBoundaryHelpers';
import { logError } from '@/utils/errorHandling';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error?: Error;
	errorInfo?: ErrorInfo;
	showDetails: boolean;
}

export class StatementErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			showDetails: false,
		};
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error, showDetails: false };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		logError(new Error('StatementErrorBoundary caught an error:'), { operation: 'components.StatementErrorBoundary.unknown', metadata: { detail: error, errorInfo } });
		this.setState({ errorInfo });
		this.props.onError?.(error, errorInfo);
	}

	private handleRetry = () => {
		this.setState({
			hasError: false,
			error: undefined,
			errorInfo: undefined,
			showDetails: false,
		});
	};

	private handleReportBug = () => {
		if (this.state.error) {
			const emailLink = generateBugReportEmail({
				error: this.state.error,
				errorInfo: this.state.errorInfo,
				url: window.location.href,
				isDevelopment: import.meta.env.DEV,
			});
			window.location.href = emailLink;
		}
	};

	private handleGoHome = () => {
		window.location.href = '/';
	};

	private toggleDetails = () => {
		this.setState((prevState) => ({
			showDetails: !prevState.showDetails,
		}));
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			const isDev = import.meta.env.DEV;
			const currentUrl = window.location.href;
			const friendlyMessage = this.state.error
				? getUserFriendlyErrorMessage(this.state.error)
				: {
						title: 'Something went wrong',
						titleHebrew: 'משהו השתבש',
						description: 'An error occurred in this section',
						descriptionHebrew: 'אירעה שגיאה באזור זה',
					};

			return (
				<div className={styles.statementError}>
					<div className={styles.statementError__container}>
						{/* Decorative background pattern */}
						<div className={styles.statementError__pattern} />

						{/* Main card */}
						<div className={styles.statementError__card}>
							{/* Icon with pulse effect */}
							<div className={styles.statementError__iconContainer}>
								<div className={styles.statementError__iconBg}>
									<svg
										className={styles.statementError__icon}
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
										<path
											d="M12 7V13M12 17H12.01"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
										/>
									</svg>
								</div>
							</div>

							{/* Bilingual title */}
							<div className={styles.statementError__header}>
								<h2 className={styles.statementError__titleHe}>{friendlyMessage.titleHebrew}</h2>
								<h3 className={styles.statementError__titleEn}>{friendlyMessage.title}</h3>
							</div>

							{/* Bilingual description */}
							<div className={styles.statementError__description}>
								<p className={styles.statementError__descHe}>{friendlyMessage.descriptionHebrew}</p>
								<p className={styles.statementError__descEn}>{friendlyMessage.description}</p>
							</div>

							{/* URL display */}
							<div className={styles.statementError__url}>
								<span className={styles.statementError__urlLabel}>Location:</span>
								<code className={styles.statementError__urlText}>{currentUrl}</code>
							</div>

							{/* Error details for development */}
							{isDev && this.state.error && (
								<div className={styles.statementError__detailsWrapper}>
									<button
										className={styles.statementError__detailsBtn}
										onClick={this.toggleDetails}
										aria-expanded={this.state.showDetails}
									>
										<span>{this.state.showDetails ? 'Hide' : 'Show'} Technical Details</span>
										<svg
											className={`${styles.statementError__detailsArrow} ${
												this.state.showDetails ? styles['statementError__detailsArrow--open'] : ''
											}`}
											viewBox="0 0 24 24"
											fill="none"
										>
											<path
												d="M6 9L12 15L18 9"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									</button>

									{this.state.showDetails && (
										<div className={styles.statementError__details}>
											<pre className={styles.statementError__detailsText}>
												{formatErrorDetails(this.state.error, this.state.errorInfo)}
											</pre>
										</div>
									)}
								</div>
							)}

							{/* Action buttons */}
							<div className={styles.statementError__actions}>
								<button
									onClick={this.handleRetry}
									className={`btn btn--primary ${styles.statementError__btn}`}
								>
									<svg viewBox="0 0 24 24" fill="none" className={styles.statementError__btnIcon}>
										<path
											d="M4 4V9H9M20 20V15H15"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
										<path
											d="M20.49 9A9 9 0 0 0 5.64 5.64L4 4M20 20L18.36 18.36A9 9 0 0 1 3.51 15"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
									<span>נסה שוב / Try Again</span>
								</button>

								<button
									onClick={this.handleGoHome}
									className={`btn btn--secondary ${styles.statementError__btn}`}
								>
									<svg viewBox="0 0 24 24" fill="none" className={styles.statementError__btnIcon}>
										<path
											d="M10 19L3 12M3 12L10 5M3 12H21"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
									<span>חזרה / Go Back</span>
								</button>

								<button
									onClick={this.handleReportBug}
									className={`${styles.statementError__reportBtn}`}
								>
									<svg viewBox="0 0 24 24" fill="none" className={styles.statementError__btnIcon}>
										<path
											d="M3 8L10.89 13.26C11.2187 13.4793 11.6049 13.5963 12 13.5963C12.3951 13.5963 12.7813 13.4793 13.11 13.26L21 8M5 19H19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H5C4.46957 5 3.96086 5.21071 3.58579 5.58579C3.21071 5.96086 3 6.46957 3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19Z"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
									<span>דווח / Report</span>
								</button>
							</div>

							{/* Footer info */}
							{!isDev && (
								<div className={styles.statementError__footer}>
									<p className={styles.statementError__footerText}>
										הצוות שלנו קיבל התראה על הבעיה / Our team has been notified
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
