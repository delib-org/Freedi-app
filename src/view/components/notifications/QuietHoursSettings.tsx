import React, { useEffect, useState } from 'react';
import styles from './notificationPreferences.module.scss';
import { getAuth } from 'firebase/auth';
import { saveQuietHours, getQuietHours, QuietHoursConfig } from '@/services/notificationRepository';
import { logError } from '@/utils/errorHandling';

interface QuietHoursSettingsProps {
	disabled?: boolean;
}

/**
 * Component for configuring quiet hours for push notifications.
 * Allows users to set a time range during which they won't receive push notifications.
 */
const QuietHoursSettings: React.FC<QuietHoursSettingsProps> = ({ disabled = false }) => {
	const [config, setConfig] = useState<QuietHoursConfig>({
		enabled: false,
		startTime: '22:00',
		endTime: '08:00',
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	// Load current quiet hours configuration
	useEffect(() => {
		const loadConfig = async (): Promise<void> => {
			try {
				const auth = getAuth();
				if (!auth.currentUser) {
					setIsLoading(false);

					return;
				}

				const savedConfig = await getQuietHours(auth.currentUser.uid);
				if (savedConfig) {
					setConfig(savedConfig);
				}
				setIsLoading(false);
			} catch (error) {
				logError(error, { operation: 'notifications.QuietHoursSettings.loadConfig', metadata: { message: 'Error loading quiet hours config:' } });
				setIsLoading(false);
			}
		};

		loadConfig();
	}, []);

	const handleSave = async (newConfig: QuietHoursConfig): Promise<void> => {
		try {
			setIsSaving(true);
			const auth = getAuth();

			if (!auth.currentUser) {
				setIsSaving(false);

				return;
			}

			await saveQuietHours(auth.currentUser.uid, newConfig);
			setConfig(newConfig);
			setIsSaving(false);
		} catch (error) {
			logError(error, { operation: 'notifications.QuietHoursSettings.handleSave', metadata: { message: 'Error saving quiet hours:' } });
			setIsSaving(false);
		}
	};

	const handleToggle = async (enabled: boolean): Promise<void> => {
		const newConfig = { ...config, enabled };
		await handleSave(newConfig);
	};

	const handleTimeChange = async (field: 'startTime' | 'endTime', value: string): Promise<void> => {
		const newConfig = { ...config, [field]: value };
		setConfig(newConfig);

		// Only save if quiet hours is enabled
		if (config.enabled) {
			await handleSave(newConfig);
		}
	};

	if (isLoading) {
		return (
			<div className={styles.quietHoursSection}>
				<span>Loading...</span>
			</div>
		);
	}

	// Get user-friendly timezone name
	const getTimezoneDisplay = (): string => {
		try {
			const options: Intl.DateTimeFormatOptions = {
				timeZoneName: 'short',
				timeZone: config.timezone,
			};
			const formatter = new Intl.DateTimeFormat('en-US', options);
			const parts = formatter.formatToParts(new Date());
			const tzPart = parts.find((part) => part.type === 'timeZoneName');

			return tzPart?.value || config.timezone;
		} catch {
			return config.timezone;
		}
	};

	return (
		<div className={styles.quietHoursSection}>
			<h4>Quiet Hours</h4>
			<p className={styles.quietHoursDescription}>Pause push notifications during specific hours</p>

			<div className={styles.quietHoursToggle}>
				<span>Enable quiet hours</span>
				<label className={styles.switch}>
					<input
						type="checkbox"
						checked={config.enabled}
						onChange={(e) => handleToggle(e.target.checked)}
						disabled={disabled || isSaving}
					/>
					<span className={styles.slider}></span>
				</label>
			</div>

			{config.enabled && (
				<>
					<div className={styles.timeInputs}>
						<div className={styles.timeGroup}>
							<label htmlFor="quiet-start">From</label>
							<input
								type="time"
								id="quiet-start"
								value={config.startTime}
								onChange={(e) => handleTimeChange('startTime', e.target.value)}
								disabled={disabled || isSaving}
							/>
						</div>
						<span className={styles.separator}>to</span>
						<div className={styles.timeGroup}>
							<label htmlFor="quiet-end">Until</label>
							<input
								type="time"
								id="quiet-end"
								value={config.endTime}
								onChange={(e) => handleTimeChange('endTime', e.target.value)}
								disabled={disabled || isSaving}
							/>
						</div>
					</div>
					<p className={styles.timezoneNote}>
						Times are in your local timezone ({getTimezoneDisplay()})
					</p>
				</>
			)}

			{isSaving && <p className={styles.savingIndicator}>Saving...</p>}
		</div>
	);
};

export default QuietHoursSettings;
