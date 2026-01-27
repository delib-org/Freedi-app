'use client';

import React, { useEffect, useState } from 'react';
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
	const { settings, isLoading, error, subscribeToSettings, updateSettings, getSettings } =
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
			setSaveError(error instanceof Error ? error.message : 'Failed to save settings');
		} finally {
			setIsSaving(false);
		}
	};

	if (loading) {
		return (
			<div className={styles['settings-panel']}>
				<div className={styles['settings-panel__loading']}>Loading settings...</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles['settings-panel']}>
				<div className={styles['settings-panel__error']}>
					Error loading settings: {loadError.message}
				</div>
			</div>
		);
	}

	return (
		<div className={styles['settings-panel']}>
			<h2 className={styles['settings-panel__title']}>Version Control Settings</h2>

			{/* Enable/Disable Toggle */}
			<div className={styles['settings-panel__field']}>
				<label className={styles['settings-panel__label']}>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(e) => setEnabled(e.target.checked)}
						className={styles['settings-panel__checkbox']}
					/>
					<span className={styles['settings-panel__label-text']}>Enable Version Control</span>
				</label>
				<p className={styles['settings-panel__help']}>
					When enabled, suggestions that reach the review threshold will appear in the queue for
					admin approval
				</p>
			</div>

			{/* Review Threshold Slider */}
			<div className={styles['settings-panel__field']}>
				<label className={styles['settings-panel__label']}>
					<span className={styles['settings-panel__label-text']}>
						Review Threshold: {reviewThreshold}%
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
					Suggestions with consensus ≥ {reviewThreshold}% will appear in the review queue
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
						Allow editing before approval
					</span>
				</label>
				<p className={styles['settings-panel__help']}>
					Admins can modify suggestions before applying them to the document
				</p>
			</div>

			{/* Save Button */}
			<div className={styles['settings-panel__actions']}>
				<button
					onClick={handleSave}
					disabled={isSaving}
					className={styles['settings-panel__button']}
				>
					{isSaving ? 'Saving...' : 'Save Settings'}
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
					Settings saved successfully!
				</div>
			)}
		</div>
	);
}
