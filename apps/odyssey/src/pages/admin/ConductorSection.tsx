import type { OdysseyIslandAgoraSession } from '@freedi/shared-types';
import { AgoraStage } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';
import type { IslandContent } from '../../lib/game';
import { advanceCivicStage } from '../../lib/callables';
import type { Flash, Run } from './types';

/**
 * Closing the event.
 *
 * A civic square has no bell and no teacher, which is exactly what lets people
 * wander in all afternoon — but an event that is scored on how far the room
 * moved has to end somewhere, because the closing question cannot be asked of
 * a deliberation that is still running. The organizer is already the session's
 * teacher (provisioning records them as one), so this reuses the classroom's
 * own stage machinery rather than inventing a second way to advance a session.
 */
export default function ConductorSection({
	islands,
	agoraSessions,
	votingEnabled,
	busy,
	flash,
	run,
}: {
	islands: IslandContent[];
	agoraSessions: Record<string, OdysseyIslandAgoraSession>;
	votingEnabled: boolean;
	busy: boolean;
	flash: Flash;
	run: Run;
}) {
	const { t } = useT();
	const open = islands
		.map((island) => ({ island, session: agoraSessions[island.statementId] }))
		.filter((entry): entry is { island: IslandContent; session: OdysseyIslandAgoraSession } =>
			Boolean(entry.session),
		);

	if (!open.length) return null;

	async function advance(sessionId: string, stage: AgoraStage, label: string): Promise<void> {
		await advanceCivicStage(sessionId, stage);
		flash(t('admin.conductor.advanced', { label }));
	}

	return (
		<section className="panel flex flex-col gap-4">
			<div>
				<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">
					{t('admin.conductor.title')}
				</h2>
				<p className="text-[14px] opacity-80 m-0">{t('admin.conductor.intro')}</p>
			</div>

			<div className="flex flex-col gap-2">
				{open.map(({ island, session }) => (
					<div
						key={island.statementId}
						className="flex flex-wrap items-center gap-2 justify-between"
					>
						<span className="text-[14px] text-[var(--cream)]">
							{t('admin.conductor.code', { title: island.title, code: session.code })}
						</span>
						<span className="flex gap-2">
							{votingEnabled ? (
								<button
									type="button"
									className="btn-outline"
									disabled={busy}
									onClick={() =>
										void run(() => advance(session.sessionId, AgoraStage.voting, island.title))
									}
								>
									{t('admin.conductor.toVoting')}
								</button>
							) : null}
							<button
								type="button"
								className="btn-outline"
								disabled={busy}
								onClick={() =>
									void run(() => advance(session.sessionId, AgoraStage.results, island.title))
								}
							>
								{t('admin.conductor.toResults')}
							</button>
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
