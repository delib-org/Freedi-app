import { useEffect, useState } from 'react';
import type { OdysseyDigestSettings } from '@freedi/shared-types';
import {
	DIGEST_TIMEZONE_DEFAULT,
	ODYSSEY_DIGEST_MAX_HOURS,
	loadDigestSettings,
	saveDigestSettings,
} from '../lib/notificationPrefs';

type Cadence = 'none' | 'every' | 'daily' | 'multi';

const DAILY_DEFAULT_HOUR = 19;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * "סיפור המסע שלכם למייל" — the async bridge's opt-in. Three cadences:
 * none, once a day at a chosen hour, or a few chosen hours a day. Push is
 * deliberately not offered — it does not work reliably for uncommitted PWA
 * users; the story arrives by email or not at all.
 */
export default function DigestSettings({ uid, onClose }: { uid: string; onClose: () => void }) {
	const [cadence, setCadence] = useState<Cadence>('none');
	const [hours, setHours] = useState<number[]>([DAILY_DEFAULT_HOUR]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		loadDigestSettings(uid)
			.then((existing) => {
				if (cancelled || !existing) return;
				if (!existing.enabled) setCadence('none');
				else if (existing.everyUpdate) setCadence('every');
				else if (existing.hoursLocal.length <= 1) setCadence('daily');
				else setCadence('multi');
				if (existing.hoursLocal.length > 0) setHours(existing.hoursLocal);
			})
			.catch((loadError: unknown) => {
				// The defaults still let the user pick a cadence — but the spinner
				// must never survive a failed read.
				console.error('[Odyssey] loading digest settings failed:', loadError, { uid });
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [uid]);

	function toggleHour(hour: number): void {
		setSaved(false);
		if (cadence === 'daily') {
			setHours([hour]);

			return;
		}
		setHours((current) =>
			current.includes(hour)
				? current.filter((entry) => entry !== hour)
				: current.length >= ODYSSEY_DIGEST_MAX_HOURS
					? current
					: [...current, hour].sort((a, b) => a - b),
		);
	}

	async function save(): Promise<void> {
		setSaving(true);
		setError(false);
		try {
			const timed = cadence === 'daily' || cadence === 'multi';
			const settings: OdysseyDigestSettings = {
				enabled: cadence === 'every' || (timed && hours.length > 0),
				hoursLocal: timed ? hours : [],
				timezone: DIGEST_TIMEZONE_DEFAULT,
				everyUpdate: cadence === 'every',
			};
			await saveDigestSettings(uid, settings);
			setSaved(true);
		} catch (saveError) {
			console.error('[Odyssey] saving digest settings failed:', saveError, { uid });
			setError(true);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="panel flex flex-col gap-3" data-testid="digest-settings">
			<div className="flex items-center gap-2">
				<strong className="text-[15px] text-[var(--cream)]">📬 סיפור המסע שלכם למייל</strong>
				<button
					type="button"
					className="mr-auto text-[13px] opacity-70 hover:opacity-100"
					onClick={onClose}
					aria-label="סגירה"
				>
					✕
				</button>
			</div>
			<p className="m-0 text-[13px] opacity-80">
				מה קרה בים מאז שירדתם לחוף: מפליגים חדשים לידכם, רוחות שהתהפכו, ואתגר מזקני הדור — בשעה
				שנוחה לכם.
			</p>

			{loading ? (
				<p className="m-0 text-[13px] opacity-70">טוענים…</p>
			) : (
				<>
					<div className="flex flex-wrap gap-2" role="radiogroup" aria-label="תדירות">
						{(
							[
								['none', 'בלי מיילים'],
								['every', 'כל עדכון'],
								['daily', 'פעם ביום'],
								['multi', 'כמה פעמים ביום'],
							] as [Cadence, string][]
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								role="radio"
								aria-checked={cadence === value}
								className={`attitude ${cadence === value ? 'active-support' : ''}`}
								onClick={() => {
									setSaved(false);
									setCadence(value);
									if (value === 'daily') setHours((current) => current.slice(0, 1));
								}}
							>
								{label}
							</button>
						))}
					</div>

					{cadence === 'every' ? (
						<p className="m-0 text-[13px] opacity-80">
							ברגע שמשהו זז בים — נבדק פעם בשעה, ונשלח רק כשבאמת יש חדש.
						</p>
					) : null}

					{cadence === 'daily' || cadence === 'multi' ? (
						<div>
							<p className="m-0 mb-2 text-[13px] opacity-80">
								{cadence === 'daily'
									? 'באיזו שעה?'
									: `באילו שעות? (עד ${ODYSSEY_DIGEST_MAX_HOURS})`}
							</p>
							<div className="flex flex-wrap gap-1.5" role="group" aria-label="שעות">
								{HOURS.map((hour) => (
									<button
										key={hour}
										type="button"
										aria-pressed={hours.includes(hour)}
										className={`attitude !px-2 !py-1 text-[12px] ${hours.includes(hour) ? 'active-support' : ''}`}
										onClick={() => toggleHour(hour)}
									>
										{String(hour).padStart(2, '0')}:00
									</button>
								))}
							</div>
						</div>
					) : null}

					<div className="flex items-center gap-3">
						<button
							type="button"
							className="btn"
							disabled={
								saving || ((cadence === 'daily' || cadence === 'multi') && hours.length === 0)
							}
							onClick={() => void save()}
						>
							{saving ? 'שומרים…' : 'שמירה'}
						</button>
						{saved ? <span className="text-[13px] text-[var(--gold-strong)]">נשמר ✓</span> : null}
						{error ? (
							<span className="text-[13px] text-[var(--gold-strong)]">
								השמירה נכשלה — נסו שוב בעוד רגע.
							</span>
						) : null}
					</div>
				</>
			)}
		</div>
	);
}
