import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationFrequency, type NotificationSettings } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	getNotificationSettings,
	updateNotificationSettings,
	type NotificationSettingsPatch,
} from '@/controllers/db/notificationSettings/db_notificationSettings';
import styles from './globalNotificationSettings.module.scss';

/**
 * Per-user global notification settings — master mute, per-channel switches,
 * default frequency, and quiet hours. Writes the app-agnostic
 * `notificationSettings/{uid}` doc shared with chat and the Cloud Functions.
 */
const GlobalNotificationSettings: React.FC = () => {
	const { t } = useTranslation();
	const user = useSelector(creatorSelector);

	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!user) return;
		let active = true;
		(async () => {
			const loaded = await getNotificationSettings(user.uid);
			if (active) {
				setSettings(loaded);
				setLoading(false);
			}
		})();

		return () => {
			active = false;
		};
	}, [user]);

	async function patch(update: NotificationSettingsPatch) {
		if (!user || !settings) return;
		const optimistic = { ...settings, ...update } as NotificationSettings;
		setSettings(optimistic);
		setSaving(true);
		const saved = await updateNotificationSettings(user.uid, update);
		if (saved) setSettings(saved);
		setSaving(false);
	}

	if (loading || !settings) {
		return <p className={styles.loading}>{t('Loading…')}</p>;
	}

	const channels = settings.defaultChannels;
	const quiet = settings.quietHours;
	const muted = settings.muted;

	const FREQUENCIES: { value: NotificationFrequency; label: string }[] = [
		{ value: NotificationFrequency.INSTANT, label: t('Instant') },
		{ value: NotificationFrequency.DAILY, label: t('Daily') },
		{ value: NotificationFrequency.WEEKLY, label: t('Weekly') },
		{ value: NotificationFrequency.NONE, label: t('Off') },
	];

	return (
		<div className={styles.settings}>
			{/* Master mute */}
			<div className={styles.row}>
				<div className={styles.rowMain}>
					<h4>{t('Pause all notifications')}</h4>
					<p>{t('Turn off every notification until you switch this back on.')}</p>
				</div>
				<label className={styles.switch}>
					<input
						type="checkbox"
						checked={muted}
						onChange={(e) => patch({ muted: e.target.checked })}
						disabled={saving}
					/>
					<span className={styles.slider}></span>
				</label>
			</div>

			<fieldset className={styles.group} disabled={muted}>
				<legend>{t('Channels')}</legend>
				{(
					[
						['inApp', t('In-app'), t('Show notifications inside the app')],
						['push', t('Push'), t('Send push notifications to this device')],
						['email', t('Email'), t('Send email notifications')],
					] as const
				).map(([key, title, desc]) => (
					<div className={styles.row} key={key}>
						<div className={styles.rowMain}>
							<h4>{title}</h4>
							<p>{desc}</p>
						</div>
						<label className={styles.switch}>
							<input
								type="checkbox"
								checked={channels[key]}
								onChange={(e) =>
									patch({ defaultChannels: { ...channels, [key]: e.target.checked } })
								}
								disabled={saving}
							/>
							<span className={styles.slider}></span>
						</label>
					</div>
				))}
			</fieldset>

			<fieldset className={styles.group} disabled={muted}>
				<legend>{t('How often')}</legend>
				<div className={styles.choices}>
					{FREQUENCIES.map((f) => (
						<label
							key={f.value}
							className={`${styles.choice} ${
								settings.defaultFrequency === f.value ? styles.choiceActive : ''
							}`}
						>
							<input
								type="radio"
								name="defaultFrequency"
								value={f.value}
								checked={settings.defaultFrequency === f.value}
								onChange={() => patch({ defaultFrequency: f.value })}
								disabled={saving}
							/>
							<span>{f.label}</span>
						</label>
					))}
				</div>
			</fieldset>

			<fieldset className={styles.group} disabled={muted}>
				<legend>{t('Quiet hours')}</legend>
				<div className={styles.row}>
					<div className={styles.rowMain}>
						<h4>{t('Pause notifications during set hours')}</h4>
					</div>
					<label className={styles.switch}>
						<input
							type="checkbox"
							checked={quiet?.enabled ?? false}
							onChange={(e) =>
								patch({
									quietHours: {
										enabled: e.target.checked,
										startTime: quiet?.startTime ?? '21:00',
										endTime: quiet?.endTime ?? '08:00',
										timezone:
											quiet?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
									},
								})
							}
							disabled={saving}
						/>
						<span className={styles.slider}></span>
					</label>
				</div>
				{quiet?.enabled && (
					<div className={styles.times}>
						<label>
							<span>{t('From')}</span>
							<input
								type="time"
								value={quiet.startTime}
								onChange={(e) => patch({ quietHours: { ...quiet, startTime: e.target.value } })}
								disabled={saving}
							/>
						</label>
						<label>
							<span>{t('To')}</span>
							<input
								type="time"
								value={quiet.endTime}
								onChange={(e) => patch({ quietHours: { ...quiet, endTime: e.target.value } })}
								disabled={saving}
							/>
						</label>
					</div>
				)}
			</fieldset>

			{saving && <p className={styles.saving}>{t('Saving…')}</p>}
		</div>
	);
};

export default GlobalNotificationSettings;
