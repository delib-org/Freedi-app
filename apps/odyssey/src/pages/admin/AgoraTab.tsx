import { useState } from 'react';
import type {
	OdysseyGameScript,
	OdysseyIsland,
	OdysseyIslandAgoraSession,
} from '@freedi/shared-types';
import { AgoraSessionMode, resolveSessionFlow, scriptToFlow } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';
import type { IslandContent } from '../../lib/game';
import { voyageLang } from '../../lib/agoraGate';
import { saveIslandAnchors } from '../../lib/admin';
import { provisionCivicSessions } from '../../lib/callables';
import ConductorSection from './ConductorSection';
import ScriptSection from './ScriptSection';
import type { Flash, Run } from './types';

/**
 * Opening the deliberations. Two decisions live here: which two stances are
 * the poles of each island — they decide which camp a player carries into the
 * square — and the one-time act of opening the sessions themselves.
 *
 * The "translate content to English / Arabic" control belongs on this screen
 * once the `translateGame` callable lands.
 */
export default function AgoraTab({
	islands,
	islandsMeta,
	agoraSessions,
	agoraOrigin,
	script,
	busy,
	flash,
	gameId,
	run,
}: {
	islands: IslandContent[];
	islandsMeta: OdysseyIsland[];
	agoraSessions: Record<string, OdysseyIslandAgoraSession>;
	agoraOrigin: string;
	script: OdysseyGameScript | undefined;
	busy: boolean;
	flash: Flash;
	gameId: string;
	run: Run;
}) {
	const { t } = useT();
	const [meta, setMeta] = useState<OdysseyIsland[]>(islandsMeta);

	function patchIsland(statementId: string, patch: Partial<OdysseyIsland>): void {
		setMeta((current) =>
			current.map((island) =>
				island.statementId === statementId ? { ...island, ...patch } : island,
			),
		);
	}

	/**
	 * Persist only the anchors this tab edits. `meta` is a snapshot taken when
	 * the tab mounted; writing the whole array back would clobber island edits
	 * (texts, order, enabled) saved elsewhere since — so the anchors are merged
	 * into a freshly-read islands array at save time instead.
	 */
	async function saveAnchors(): Promise<void> {
		await saveIslandAnchors(
			gameId,
			Object.fromEntries(
				meta.map((island) => [
					island.statementId,
					{
						leftAnchorStanceId: island.leftAnchorStanceId ?? null,
						rightAnchorStanceId: island.rightAnchorStanceId ?? null,
					},
				]),
			),
		);
	}

	const enabled = islands.filter((island) => island.enabled);
	const missingAnchors = enabled.filter((island) => {
		const entry = meta.find((candidate) => candidate.statementId === island.statementId);

		return !entry?.leftAnchorStanceId || !entry?.rightAnchorStanceId;
	});
	const origin = agoraOrigin.replace(/\/$/, '');

	return (
		<>
			<ScriptSection
				script={script}
				hasOpenSessions={Object.keys(agoraSessions).length > 0}
				busy={busy}
				flash={flash}
				gameId={gameId}
				run={run}
			/>
			<section className="panel flex flex-col gap-4">
				<div>
					<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">
						{t('admin.agora.title')}
					</h2>
					<p className="text-[14px] opacity-80 m-0">{t('admin.agora.intro')}</p>
					{!origin ? (
						<p className="text-[14px] text-[var(--gold-strong)] mt-2 mb-0">
							{t('admin.agora.originMissing')}
						</p>
					) : null}
				</div>

				<div className="flex flex-col gap-3">
					{enabled.map((island) => {
						const entry = meta.find((candidate) => candidate.statementId === island.statementId);
						const session = agoraSessions[island.statementId];

						return (
							<div
								key={island.statementId}
								className="border-t border-[rgba(232,185,88,0.25)] pt-3 flex flex-col gap-2"
							>
								<strong className="text-[var(--cream)]">{island.title}</strong>
								<div className="flex flex-wrap gap-2">
									<label className="flex flex-col gap-1 text-[13px] opacity-85 flex-1 min-w-[240px]">
										{t('admin.agora.anchorA')}
										<select
											className="input"
											value={entry?.leftAnchorStanceId ?? ''}
											onChange={(event) =>
												patchIsland(island.statementId, {
													leftAnchorStanceId: event.target.value || null,
												})
											}
										>
											<option value="">{t('admin.agora.notChosen')}</option>
											{island.stances.map((stance) => (
												<option key={stance.statementId} value={stance.statementId}>
													{stance.statement}
												</option>
											))}
										</select>
									</label>
									<label className="flex flex-col gap-1 text-[13px] opacity-85 flex-1 min-w-[240px]">
										{t('admin.agora.anchorB')}
										<select
											className="input"
											value={entry?.rightAnchorStanceId ?? ''}
											onChange={(event) =>
												patchIsland(island.statementId, {
													rightAnchorStanceId: event.target.value || null,
												})
											}
										>
											<option value="">{t('admin.agora.notChosen')}</option>
											{island.stances.map((stance) => (
												<option key={stance.statementId} value={stance.statementId}>
													{stance.statement}
												</option>
											))}
										</select>
									</label>
								</div>
								{session ? (
									<p className="text-[13px] opacity-75 m-0">
										{t('admin.agora.sessionOpen')} <strong>{session.code}</strong>
										{origin ? (
											<>
												{' · '}
												<a
													className="underline"
													href={`${origin}/#!/join/${session.code}?theme=odyssey&lang=${voyageLang()}`}
													target="_blank"
													rel="noreferrer"
												>
													{t('admin.agora.openSession')}
												</a>
											</>
										) : null}
									</p>
								) : (
									<p className="text-[13px] opacity-60 m-0">{t('admin.agora.noSession')}</p>
								)}
							</div>
						);
					})}
				</div>

				{missingAnchors.length ? (
					<p className="text-[13px] opacity-75 m-0">
						{t('admin.agora.missingAnchors', { count: missingAnchors.length })}
					</p>
				) : null}

				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className="btn"
						disabled={busy}
						onClick={() => void run(() => saveAnchors())}
					>
						{t('admin.agora.saveAnchors')}
					</button>
					<button
						type="button"
						className="btn-outline"
						disabled={busy || !origin}
						onClick={() =>
							void run(async () => {
								// Anchors are saved first: the session carries them, and a
								// session opened without them places everyone in the centre.
								await saveAnchors();
								const result = await provisionCivicSessions(gameId);
								flash(
									t('admin.agora.provisioned', { count: result.sessions.length }) +
										(result.alreadyOpen.length
											? ` · ${t('admin.agora.alreadyOpen', { count: result.alreadyOpen.length })}`
											: ''),
								);
							})
						}
					>
						{t('admin.agora.provision')}
					</button>
				</div>
			</section>
			<ConductorSection
				islands={enabled}
				agoraSessions={agoraSessions}
				votingEnabled={
					resolveSessionFlow({
						sessionMode: AgoraSessionMode.civic,
						flow: scriptToFlow(script),
					}).voting
				}
				busy={busy}
				flash={flash}
				run={run}
			/>
		</>
	);
}
