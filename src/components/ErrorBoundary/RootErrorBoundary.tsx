import React, { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import "./ErrorBoundary.scss";

interface Props {
  children: ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorBoundaryKey: number;
}

export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorBoundaryKey: 0,
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
      console.error("Error caught by boundary:", error, errorInfo);
    }

    // Send to Sentry
    Sentry.withScope((scope) => {
      scope.setExtras({
        componentStack: errorInfo.componentStack,
        digest: errorInfo.digest,
      });
      scope.setLevel("error");
      scope.setContext("errorBoundary", {
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
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;

      if (Fallback) {
        return (
          <Fallback error={this.state.error!} resetError={this.resetError} />
        );
      }

      // Default fallback UI
      return (
        <DefaultErrorFallback
          error={this.state.error!}
          resetError={this.resetError}
        />
      );
    }

    return (
      <React.Fragment key={this.state.errorBoundaryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

// Default error UI component
const DefaultErrorFallback: React.FC<{
  error: Error;
  resetError: () => void;
}> = ({ error, resetError }) => {
  const isDev = import.meta.env.DEV;

  return (
    <div className="error-fallback">
      <div className="error-fallback__container">
        <div className="error-fallback__icon">⚠️</div>

        <h1 className="error-fallback__title">
          משהו השתבש / Something went wrong
        </h1>

        <div className="error-fallback__message">
          <p>אנחנו מצטערים, אירעה שגיאה בלתי צפויה.</p>
          <p>We're sorry, an unexpected error occurred.</p>
        </div>

        {isDev && (
          <details className="error-fallback__details">
            <summary>Error details (Development only)</summary>
            <pre className="error-fallback__stack">
              {error.toString()}
              {"\n\n"}
              {error.stack}
            </pre>
          </details>
        )}

        <div className="error-fallback__actions">
          <button
            className="error-fallback__button error-fallback__button--primary"
            onClick={resetError}
          >
            נסה שוב / Try again
          </button>
          <button
            className="error-fallback__button error-fallback__button--secondary"
            onClick={() => (window.location.href = "/")}
          >
            חזור לדף הבית / Go to home
          </button>
        </div>

        {!isDev && (
          <p className="error-fallback__report">
            השגיאה דווחה אוטומטית לצוות הטכני שלנו.
            <br />
            The error has been automatically reported to our technical team.
          </p>
        )}
      </div>
    </div>
  );
};

// Export the Sentry-wrapped version for automatic error tracking
export default Sentry.withErrorBoundary(RootErrorBoundary, {
  fallback: ({ error, resetError }) => (
    <DefaultErrorFallback error={error as Error} resetError={resetError} />
  ),
  showDialog: false,
});
