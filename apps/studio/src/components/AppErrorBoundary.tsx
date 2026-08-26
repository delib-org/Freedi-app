import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { Button } from '@/components/atomic/atoms/Button';
import { isChunkLoadError } from '@/utils/lazyWithRetry';
import { logError } from '@/utils/logError';

interface AppErrorBoundaryProps {
	children: ReactNode;
}

interface AppErrorBoundaryState {
	error: Error | null;
}

function ErrorScreen({ error }: { error: Error }) {
	const { t } = useTranslation();
	const stale = isChunkLoadError(error);

	return (
		<main className="app-error">
			<EmptyState
				icon="⚠️"
				title={stale ? t('A new version of Studio is available.') : t('Something went wrong')}
				text={
					stale
						? t('Reload the page to get the latest version.')
						: t('Reload the page. If this keeps happening, tell us what you were doing.')
				}
				action={
					<Button text={t('Reload')} variant="primary" onClick={() => window.location.reload()} />
				}
				variant={stale ? 'default' : 'error'}
			/>
		</main>
	);
}

/**
 * Last line of defence: a render/lazy-load error never leaves a blank page.
 * Stale-chunk errors (tab open across a deploy) get a "new version" message;
 * everything else a generic one. Both offer a reload.
 */
export default class AppErrorBoundary extends Component<
	AppErrorBoundaryProps,
	AppErrorBoundaryState
> {
	state: AppErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		logError(error, {
			operation: 'AppErrorBoundary.componentDidCatch',
			metadata: { componentStack: info.componentStack ?? '', staleChunk: isChunkLoadError(error) },
		});
	}

	render(): ReactNode {
		if (this.state.error) return <ErrorScreen error={this.state.error} />;

		return this.props.children;
	}
}
