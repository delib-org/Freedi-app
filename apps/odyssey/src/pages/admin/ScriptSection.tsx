import { useState } from 'react';
import type { OdysseyGameScript } from '@freedi/shared-types';
import {
	AgoraSessionMode,
	ODYSSEY_EVENT_SCRIPT,
	resolveSessionFlow,
	scriptToFlow,
} from '@freedi/shared-types';
import { useT } from '../../i18n/useT';
import { saveGamePatch } from '../../lib/admin';
import { updateCivicFlow } from '../../lib/callables';
import type { Flash, Run } from './types';

/** One switch, with the sentence that says what turning it off actually does. */
function ScriptToggle({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint: string;
	checked: boolean;
	onChange(next: boolean): void;
}) {
	return (
		<label className="flex items-start gap-2 cursor-pointer">
			<input
				type="checkbox"
				className="mt-1"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span className="flex flex-col">
				<span className="text-[14px] text-[var(--cream)]">{label}</span>
				<span className="text-[12px] opacity-70">{hint}</span>
			</span>
		</label>
	);
}

/**
 * The script of the event: which beats the Agora deliberation runs.
 *
 * Everything here is a default the organizer may override, so an empty script
 * is a real answer and not an unfinished form — it means "run the square the
 * way civic squares have always run". The presets exist because the two shapes
 * anyone actually asks for are "as it was" and "no sides at all", and building
 * the second one switch at a time invites getting it half-done.
 */
export default function ScriptSection({
	script,
	hasOpenSessions,
	busy,
	flash,
	gameId,
	run,
}: {
	script: OdysseyGameScript | undefined;
	hasOpenSessions: boolean;
	busy: boolean;
	flash: Flash;
	gameId: string;
	run: Run;
}) {
	const { t } = useT();
	const [draft, setDraft] = useState<OdysseyGameScript>(script ?? {});
	const resolved = resolveSessionFlow({
		sessionMode: AgoraSessionMode.civic,
		flow: scriptToFlow(draft),
	});

	function patch(next: Partial<OdysseyGameScript>): void {
		setDraft((current) => ({ ...current, ...next }));
	}

	/** Saving also re-points anything already open, or the knob is a lie. */
	async function save(next: OdysseyGameScript): Promise<void> {
		await saveGamePatch(gameId, { script: next });
		if (!hasOpenSessions) {
			flash(t('admin.script.saved'));

			return;
		}
		const result = await updateCivicFlow(gameId);
		flash(t('admin.script.savedUpdated', { count: result.updated.length }));
	}

	return (
		<section className="panel flex flex-col gap-4">
			<div>
				<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">
					{t('admin.script.title')}
				</h2>
				<p className="text-[14px] opacity-80 m-0">{t('admin.script.intro')}</p>
			</div>

			<div className="flex flex-col gap-3">
				<ScriptToggle
					label={t('admin.script.stances')}
					hint={resolved.stances ? t('admin.script.stancesOn') : t('admin.script.stancesOff')}
					checked={resolved.stances}
					onChange={(next) => patch({ stancesEnabled: next })}
				/>
				<ScriptToggle
					label={t('admin.script.needs')}
					hint={t('admin.script.needsHint')}
					checked={resolved.needs}
					onChange={(next) => patch({ needsEnabled: next })}
				/>
				<ScriptToggle
					label={t('admin.script.elders')}
					hint={t('admin.script.eldersHint')}
					checked={resolved.elders}
					onChange={(next) => patch({ eldersEnabled: next })}
				/>
				<ScriptToggle
					label={t('admin.script.framing')}
					hint={t('admin.script.framingHint')}
					checked={resolved.framing}
					onChange={(next) => patch({ framingEnabled: next })}
				/>
				<ScriptToggle
					label={t('admin.script.voting')}
					hint={t('admin.script.votingHint')}
					checked={resolved.voting}
					onChange={(next) => patch({ votingEnabled: next })}
				/>

				<div className="flex flex-wrap gap-4">
					<label className="flex flex-col gap-1">
						<span className="text-[13px] opacity-80">{t('admin.script.rounds')}</span>
						<input
							type="number"
							min={1}
							max={9}
							className="w-20"
							value={resolved.rounds}
							onChange={(event) => patch({ rounds: Number(event.target.value) })}
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-[13px] opacity-80">{t('admin.script.ratingsPerRound')}</span>
						<input
							type="number"
							min={1}
							max={9}
							className="w-20"
							value={resolved.ratingsPerRound}
							onChange={(event) => patch({ ratingsPerRound: Number(event.target.value) })}
						/>
					</label>
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => void run(() => save(draft))}
				>
					{t('admin.script.save')}
				</button>
				<button
					type="button"
					className="btn-outline"
					disabled={busy}
					onClick={() => {
						setDraft(ODYSSEY_EVENT_SCRIPT);
						void run(() => save(ODYSSEY_EVENT_SCRIPT));
					}}
				>
					{t('admin.script.eventMode')}
				</button>
				<button
					type="button"
					className="btn-outline"
					disabled={busy}
					onClick={() => {
						setDraft({});
						void run(() => save({}));
					}}
				>
					{t('admin.script.reset')}
				</button>
			</div>
		</section>
	);
}
