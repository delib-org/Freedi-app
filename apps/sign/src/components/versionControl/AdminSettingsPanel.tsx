'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useVersionControlStore } from '@/store/versionControlStore';
import styles from './versionControl.module.scss';

interface AdminSettingsPanelProps {
	documentId: string;
}

/**
 * Admin Settings Panel Component
 * Simplified MVP version - toggle, threshold slider, basic settings
 */
export function AdminSettingsPanel({ documentId }: AdminSettingsPanelProps) {
	const { t } = useTranslation();
	const { isLoading, error, subscribeToSettings, updateSettings, getSettings } =
		useVersionControlStore();

	const currentSettings = getSettings(documentId);
	const loading = isLoading[documentId];
	const loadError = error[documentId];

	const [enabled, setEnabled] = useState(currentSettings.enabled);
	const [reviewThreshold, setReviewThreshold] = useState(currentSettings.reviewThreshold * 100);
	const [allowAdminEdit, setAllowAdminEdit] = useState(currentSettings.allowAdminEdit);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState<string | null>(null);

	// Subscribe to settings on mount
	useEffect(() => {
		const unsubscribe = subscribeToSettings(documentId);
		return () => unsubscribe();
	}, [documentId, subscribeToSettings]);

	// Update local state when settings change
	useEffect(() => {
		setEnabled(currentSettings.enabled);
		setReviewThreshold(currentSettings.reviewThreshold * 100);
		setAllowAdminEdit(currentSettings.allowAdminEdit);
	}, [currentSettings]);

	const handleSave = async () => {
		setIsSaving(true);
		setSaveError(null);
		setSaveSuccess(false);

		try {
			await updateSettings(documentId, {
				enabled,
				reviewThreshold: reviewThreshold / 100,
				allowAdminEdit,
			});
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 3000);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : t('Error loading settings'));
		} finally {
			setIsSaving(false);
		}
	};

	const handleSyncQueue = async () => {
		setIsSyncing(true);
		setSyncMessage(null);
		setSaveError(null);

		try {
			const response = await fetch(`/api/admin/version-control/${documentId}/sync`, {
				method: 'POST',
				credentials: 'include',
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to sync queue');
			}

			const result = await response.json();
			const message = result.paragraphsScanned === 0
				? `No paragraphs found to scan. Make sure your document has official paragraphs.`
				: `${t('Queue synced successfully!')} ${result.addedCount} ${t('suggestions added to queue')}, ${result.skippedCount} ${t('skipped (already in queue)')}. Scanned ${result.paragraphsScanned} paragraphs.`;
			setSyncMessage(message);
			setTimeout(() => setSyncMessage(null), 8000);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Failed to sync queue');
		} finally {
			setIsSyncing(false);
		}
	};

	if (loading) {
		return (
			<div className={styles['settings-panel']}>
				<div className={styles['settings-panel__loading']}>{t('Loading settings...')}</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles['settings-panel']}>
				<div className={styles['settings-panel__error']}>
					{t('Error loading settings:')}{' '}{loadError.message}
				</div>
			</div>
		);
	}

	return (
		<div className={styles['settings-panel']}>
			<h2 className={styles['settings-panel__title']}>{t('Version Control Settings')}</h2>

			{/* Enable/Disable Toggle */}
			<div className={styles['settings-panel__field']}>
				<label className={styles['settings-panel__label']}>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(e) => setEnabled(e.target.checked)}
						className={styles['settings-panel__checkbox']}
					/>
					<span className={styles['settings-panel__label-text']}>{t('Enable Version Control')}</span>
				</label>
				<p className={styles['settings-panel__help']}>
					{t('When enabled, suggestions that reach the review threshold will appear in the queue for admin approval')}
				</p>
			</div>

			{/* Review Threshold Slider */}
			<div className={styles['settings-panel__field']}>
				<label className={styles['settings-panel__label']}>
					<span className={styles['settings-panel__label-text']}>
						{t('Review Threshold')}: {reviewThreshold}%
					</span>
				</label>
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					value={reviewThreshold}
					onChange={(e) => setReviewThreshold(Number(e.target.value))}
					className={styles['settings-panel__slider']}
					disabled={!enabled}
				/>
				<p className={styles['settings-panel__help']}>
					{t('Suggestions with consensus ≥')} {reviewThreshold}% {t('will appear in the review queue')}
				</p>
			</div>

			{/* Allow Admin Edit */}
			<div className={styles['settings-panel__field']}>
				<label className={styles['settings-panel__label']}>
					<input
						type="checkbox"
						checked={allowAdminEdit}
						onChange={(e) => setAllowAdminEdit(e.target.checked)}
						className={styles['settings-panel__checkbox']}
						disabled={!enabled}
					/>
					<span className={styles['settings-panel__label-text']}>
						{t('Allow editing before approval')}
					</span>
				</label>
				<p className={styles['settings-panel__help']}>
					{t('Admins can modify suggestions before applying them to the document')}
				</p>
			</div>

			{/* Sync Queue Button */}
			{enabled && (
				<div className={styles['settings-panel__field']}>
					<p className={styles['settings-panel__help']}>
						{t('Scan existing suggestions and add qualifying ones to the review queue')}
					</p>
					<button
						onClick={handleSyncQueue}
						disabled={isSyncing}
						className={`${styles['settings-panel__button']} ${styles['settings-panel__button--secondary']}`}
					>
						{isSyncing ? t('Syncing...') : t('Sync Queue')}
					</button>
				</div>
			)}

			{/* Save Button */}
			<div className={styles['settings-panel__actions']}>
				<button
					onClick={handleSave}
					disabled={isSaving}
					className={styles['settings-panel__button']}
				>
					{isSaving ? t('Saving...') : t('Save Settings')}
				</button>
			</div>

			{/* Error/Success Messages */}
			{saveError && (
				<div className={styles['settings-panel__error']}>
					{saveError}
				</div>
			)}
			{saveSuccess && (
				<div className={styles['settings-panel__success']}>
					{t('Settings saved successfully!')}
				</div>
			)}
			{syncMessage && (
				<div className={styles['settings-panel__success']}>
					{syncMessage}
				</div>
			)}
		</div>
	);
}
