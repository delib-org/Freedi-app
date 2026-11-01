import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type {
	ThemeRebuildApplyResponse,
	ThemeRebuildPreviewResponse,
	ThemeRebuildPreviewTheme,
} from '@freedi/shared-types';
import { applyThemeRebuild } from '@/controllers/db/synthesis/synthesisOperations';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import Card from '@/view/components/atomic/molecules/Card/Card';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { themeRebuildErrorMessage } from './themeRebuildMessages';
import styles from './ThemeRebuildPreview.module.scss';

const MAX_SAMPLE_TITLES = 3;
const TITLE_ID = 'theme-rebuild-preview-title';

interface Props {
	questionId: string;
	/** The proposal to review. `null` keeps the dialog closed. */
	preview: ThemeRebuildPreviewResponse | null;
	/** Extra class on the dialog, e.g. to lift it above a drawer that opened it. */
	className?: string;
	onClose: () => void;
	onApplied: (result: ThemeRebuildApplyResponse) => void;
}

interface ThemeCardProps {
	theme: ThemeRebuildPreviewTheme;
}

const ThemeCard: FC<ThemeCardProps> = ({ theme }) => {
	const { t } = useTranslation();
	const samples = theme.sampleTitles.slice(0, MAX_SAMPLE_TITLES);

	return (
		<Card
			title={theme.name}
			subtitle={theme.rule}
			bordered
			flat
			compact
			headerActions={
				<span className={styles.themeRebuild__count}>
					{t('Ideas')}: {theme.memberCount}
				</span>
			}
		>
			{theme.reusesThemeId && (
				<span className={styles.themeRebuild__keeps}>{t('Keeps existing theme')}</span>
			)}
			{samples.length > 0 && (
				<ul className={styles.themeRebuild__samples} aria-label={t('Examples')}>
					{samples.map((title, index) => (
						<li key={`${theme.key}-${index}`} className={styles.themeRebuild__sample}>
							{title}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
};

/**
 * Review step of "Re-theme with AI": lists the themes the AI proposes for the
 * question and lets the admin apply or discard them. Nothing is written until
 * Apply.
 */
const ThemeRebuildPreview: FC<Props> = ({ questionId, preview, className, onClose, onApplied }) => {
	const { t } = useTranslation();
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!preview) return null;

	function handleClose(): void {
		// The server keeps applying after a cancel, so the dialog stays until it answers.
		if (applying) return;
		setError(null);
		onClose();
	}

	async function handleApply(): Promise<void> {
		if (!preview) return;
		setApplying(true);
		setError(null);
		try {
			const result = await applyThemeRebuild(questionId, preview.runId);
			setApplying(false);
			onApplied(result);
			onClose();
		} catch (applyError) {
			// applyThemeRebuild already logged the failure with context.
			setApplying(false);
			setError(themeRebuildErrorMessage(applyError, t) ?? t('Operation failed'));
		}
	}

	return (
		<Modal
			isOpen
			onClose={handleClose}
			title={t('Proposed themes')}
			titleId={TITLE_ID}
			size="large"
			className={className}
			closeOnBackdrop={!applying}
			closeOnEscape={!applying}
			closeButtonLabel={t('Close')}
			footer={
				<div className={styles.themeRebuild__actions}>
					<Button
						text={t('Cancel')}
						variant="secondary"
						onClick={handleClose}
						disabled={applying}
					/>
					<Button
						text={applying ? t('Applying…') : t('Apply')}
						variant="primary"
						onClick={handleApply}
						disabled={applying}
						loading={applying}
					/>
				</div>
			}
		>
			<div className={styles.themeRebuild}>
				<p className={styles.themeRebuild__intro}>
					{t('Review the proposed themes. Nothing changes until you apply.')}
				</p>

				<dl className={styles.themeRebuild__summary}>
					<div className={styles.themeRebuild__stat}>
						<dt>{t('Ideas')}</dt>
						<dd>{preview.atomCount}</dd>
					</div>
					<div className={styles.themeRebuild__stat}>
						<dt>{t('Themes')}</dt>
						<dd>{preview.themes.length}</dd>
					</div>
					<div className={styles.themeRebuild__stat}>
						<dt>{t('Other ideas')}</dt>
						<dd>{preview.otherCount}</dd>
					</div>
				</dl>

				{(preview.unansweredCount ?? 0) > 0 && (
					<p className={styles.themeRebuild__notice} role="status">
						{t('Ideas the AI could not sort')}: {preview.unansweredCount}.{' '}
						{t('They are under Other ideas. Run the preview again to retry them.')}
					</p>
				)}

				<ul className={styles.themeRebuild__list}>
					{preview.themes.map((theme) => (
						<li key={theme.key}>
							<ThemeCard theme={theme} />
						</li>
					))}
				</ul>

				{error && (
					<p className={styles.themeRebuild__error} role="alert">
						{error}
					</p>
				)}
			</div>
		</Modal>
	);
};

export default ThemeRebuildPreview;
