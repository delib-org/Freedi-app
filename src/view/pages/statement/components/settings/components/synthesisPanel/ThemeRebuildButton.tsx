import { FC, useState } from 'react';
import type { ThemeRebuildPreviewResponse } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { previewThemeRebuild } from '@/controllers/db/synthesis/synthesisOperations';
import Button, { type ButtonVariant } from '@/view/components/atomic/atoms/Button/Button';
import ThemeRebuildPreview from './ThemeRebuildPreview';
import { themeRebuildAppliedMessage, themeRebuildErrorMessage } from './themeRebuildMessages';

export interface ThemeRebuildNotice {
	tone: 'success' | 'error';
	message: string;
}

export interface ThemeRebuildButtonProps {
	questionId: string;
	/** Extra reason the button is unavailable (another run, unsaved settings…). */
	disabled?: boolean;
	variant?: ButtonVariant;
	fullWidth?: boolean;
	/** Class for the preview dialog, e.g. to lift it above a drawer. */
	previewClassName?: string;
	/** Fires while the preview is being fetched, so a host can lock its other actions. */
	onBusyChange?: (busy: boolean) => void;
	/** The outcome to show: the applied summary, or why the preview failed. */
	onNotice: (notice: ThemeRebuildNotice) => void;
}

/**
 * "Re-theme with AI": asks the server for a theme proposal, shows it in
 * ThemeRebuildPreview, and reports the outcome to the host. Nothing is written
 * until the admin applies the preview.
 */
const ThemeRebuildButton: FC<ThemeRebuildButtonProps> = ({
	questionId,
	disabled = false,
	variant = 'secondary',
	fullWidth = false,
	previewClassName,
	onBusyChange,
	onNotice,
}) => {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState<ThemeRebuildPreviewResponse | null>(null);

	async function handleClick(): Promise<void> {
		setBusy(true);
		onBusyChange?.(true);
		try {
			setPreview(await previewThemeRebuild(questionId));
		} catch (error) {
			// previewThemeRebuild already logged the failure with context.
			const message =
				themeRebuildErrorMessage(error, t) ??
				(error instanceof Error && error.message ? error.message : t('Operation failed'));
			onNotice({ tone: 'error', message });
		} finally {
			setBusy(false);
			onBusyChange?.(false);
		}
	}

	return (
		<>
			<Button
				text={t('Re-theme with AI')}
				variant={variant}
				fullWidth={fullWidth}
				onClick={handleClick}
				disabled={disabled || busy}
				loading={busy}
			/>
			<ThemeRebuildPreview
				questionId={questionId}
				preview={preview}
				className={previewClassName}
				onClose={() => setPreview(null)}
				onApplied={(result) =>
					onNotice({ tone: 'success', message: themeRebuildAppliedMessage(result, t) })
				}
			/>
		</>
	);
};

export default ThemeRebuildButton;
