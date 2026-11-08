import { useState } from 'react';
import type { OdysseyIsland } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';
import { toFreediUser, useUser } from '../../lib/user';
import type { IslandContent } from '../../lib/game';
import {
	addIslandStatement,
	addStance,
	deleteStance,
	saveGamePatch,
	saveStatementText,
} from '../../lib/admin';
import ImageField from './ImageField';
import type { Flash, Run } from './types';

/**
 * Seed text for a freshly added island. Content stays Hebrew whatever the
 * admin's UI language — Hebrew is every game's canonical content language,
 * and the other languages are produced from it.
 */
const NEW_ISLAND_QUESTION = 'שאלה חדשה — ערכו אותי';
const NEW_ISLAND_TITLE = 'אי חדש';

export default function IslandsTab({
	islands,
	islandsMeta,
	busy,
	flash,
	gameId,
	rootStatementId,
	run,
}: {
	islands: IslandContent[];
	islandsMeta: OdysseyIsland[];
	busy: boolean;
	flash: Flash;
	gameId: string;
	rootStatementId: string;
	run: Run;
}) {
	const { t } = useT();
	const { user } = useUser();
	const [open, setOpen] = useState<string | null>(null);
	const [meta, setMeta] = useState<OdysseyIsland[]>([...islandsMeta]);
	const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>(() =>
		Object.fromEntries(islands.map((island) => [island.statementId, island.statement.statement])),
	);
	const [stanceDrafts, setStanceDrafts] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			islands.flatMap((island) =>
				island.stances.map((stance) => [stance.statementId, stance.statement]),
			),
		),
	);
	const [newStance, setNewStance] = useState<Record<string, string>>({});

	function updateMeta(statementId: string, patch: Partial<OdysseyIsland>): void {
		setMeta(meta.map((item) => (item.statementId === statementId ? { ...item, ...patch } : item)));
	}

	async function saveIsland(island: IslandContent): Promise<void> {
		await run(async () => {
			// 1. Statement texts (island question + stances)
			const questionText = questionDrafts[island.statementId];
			if (questionText && questionText !== island.statement.statement) {
				await saveStatementText(island.statementId, questionText);
			}
			for (const stance of island.stances) {
				const draft = stanceDrafts[stance.statementId];
				if (draft !== undefined && draft !== stance.statement) {
					await saveStatementText(stance.statementId, draft);
				}
			}
			// 2. New stance
			const addition = newStance[island.statementId]?.trim();
			if (addition && user) {
				await addStance({
					rootStatementId,
					islandStatementId: island.statementId,
					text: addition,
					order: island.stances.length + 1,
					creator: toFreediUser(user),
				});
				setNewStance((current) => ({ ...current, [island.statementId]: '' }));
			}
			// 3. Game meta
			await saveGamePatch(gameId, { islands: meta });
		});
	}

	return (
		<section className="flex flex-col gap-3">
			<p className="panel !py-3 text-[13px] opacity-85 m-0">{t('admin.islands.intro')}</p>
			{[...meta]
				.sort((a, b) => a.sortOrder - b.sortOrder)
				.map((islandMeta) => {
					const island = islands.find(
						(candidate) => candidate.statementId === islandMeta.statementId,
					);
					if (!island) return null;
					const isOpen = open === islandMeta.statementId;

					return (
						<div key={islandMeta.statementId} className="panel !py-3">
							<button
								type="button"
								className="w-full flex items-center justify-between bg-transparent border-none text-inherit cursor-pointer p-0"
								onClick={() => setOpen(isOpen ? null : islandMeta.statementId)}
							>
								<span className="font-bold text-[16px] text-[var(--cream)]">
									{islandMeta.title} {islandMeta.enabled ? '' : t('admin.islands.hidden')}
								</span>
								<span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
							</button>

							{isOpen ? (
								<div className="flex flex-col gap-2 mt-3">
									<div className="flex gap-2">
										<input
											type="text"
											value={islandMeta.title}
											placeholder={t('admin.islands.namePlaceholder')}
											onChange={(event) =>
												updateMeta(islandMeta.statementId, {
													title: event.target.value,
												})
											}
										/>
										<input
											type="number"
											className="!w-20"
											value={islandMeta.sortOrder}
											title={t('admin.common.order')}
											onChange={(event) =>
												updateMeta(islandMeta.statementId, {
													sortOrder: Number(event.target.value),
												})
											}
										/>
									</div>
									<input
										type="text"
										value={islandMeta.issue}
										placeholder={t('admin.islands.issuePlaceholder')}
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												issue: event.target.value,
											})
										}
									/>
									<textarea
										rows={2}
										value={islandMeta.shortExplain}
										placeholder={t('admin.islands.shortExplainPlaceholder')}
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												shortExplain: event.target.value,
											})
										}
									/>
									<textarea
										rows={2}
										value={islandMeta.opening}
										placeholder={t('admin.islands.openingPlaceholder')}
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												opening: event.target.value,
											})
										}
									/>
									<label className="flex flex-col gap-1">
										<span className="text-[13px] text-[var(--gold-strong)]">
											{t('admin.islands.centralQuestion')}
										</span>
										<textarea
											rows={2}
											value={questionDrafts[islandMeta.statementId] ?? ''}
											onChange={(event) =>
												setQuestionDrafts({
													...questionDrafts,
													[islandMeta.statementId]: event.target.value,
												})
											}
										/>
									</label>
									<textarea
										rows={2}
										value={islandMeta.depthQuestion}
										placeholder={t('admin.islands.depthQuestionPlaceholder')}
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												depthQuestion: event.target.value,
											})
										}
									/>
									<ImageField
										label={t('admin.islands.image')}
										value={islandMeta.imageUrl}
										gameId={gameId}
										onChange={(url) => updateMeta(islandMeta.statementId, { imageUrl: url })}
										flash={flash}
									/>
									<div className="flex items-center gap-2">
										<span className="text-[13px] text-[var(--gold-strong)]">
											{t('admin.islands.position')}
										</span>
										<input
											type="number"
											className="!w-24"
											value={islandMeta.posX}
											title={t('admin.islands.posX')}
											onChange={(event) =>
												updateMeta(islandMeta.statementId, {
													posX: Number(event.target.value),
												})
											}
										/>
										<input
											type="number"
											className="!w-24"
											value={islandMeta.posY}
											title={t('admin.islands.posY')}
											onChange={(event) =>
												updateMeta(islandMeta.statementId, {
													posY: Number(event.target.value),
												})
											}
										/>
										<label className="flex items-center gap-1.5 text-[14px] ms-auto">
											<input
												type="checkbox"
												checked={islandMeta.enabled}
												onChange={(event) =>
													updateMeta(islandMeta.statementId, {
														enabled: event.target.checked,
													})
												}
											/>
											{t('admin.islands.enabled')}
										</label>
									</div>

									<p className="eyebrow m-0 mt-2">{t('admin.islands.shores')}</p>
									{island.stances.map((stance, stanceIndex) => (
										<div key={stance.statementId} className="flex items-center gap-2">
											<span className="text-[13px] opacity-70 shrink-0">
												{t('admin.islands.shore', { n: stanceIndex + 1 })}
											</span>
											<textarea
												rows={1}
												value={stanceDrafts[stance.statementId] ?? ''}
												onChange={(event) =>
													setStanceDrafts({
														...stanceDrafts,
														[stance.statementId]: event.target.value,
													})
												}
											/>
											<button
												type="button"
												className="btn-outline shrink-0 !border-[#ff8a96] !text-[#ff8a96]"
												title={t('admin.islands.deleteShore')}
												onClick={() => {
													if (confirm(t('admin.islands.confirmDeleteShore'))) {
														void run(() => deleteStance(stance.statementId));
													}
												}}
											>
												✕
											</button>
										</div>
									))}
									<input
										type="text"
										value={newStance[islandMeta.statementId] ?? ''}
										placeholder={t('admin.islands.newShorePlaceholder')}
										onChange={(event) =>
											setNewStance({
												...newStance,
												[islandMeta.statementId]: event.target.value,
											})
										}
									/>

									<button
										type="button"
										className="btn self-center mt-2"
										disabled={busy}
										onClick={() => void saveIsland(island)}
									>
										{t('admin.islands.save')}
									</button>
								</div>
							) : null}
						</div>
					);
				})}
			<button
				type="button"
				className="btn-outline self-center"
				disabled={busy || !user}
				onClick={() =>
					void run(async () => {
						const statementId = await addIslandStatement({
							rootStatementId,
							centralQuestion: NEW_ISLAND_QUESTION,
							order: meta.length + 1,
							creator: toFreediUser(user!),
						});
						const nextMeta: OdysseyIsland[] = [
							...meta,
							{
								statementId,
								title: NEW_ISLAND_TITLE,
								issue: '',
								shortExplain: '',
								opening: '',
								depthQuestion: '',
								imageUrl: null,
								posX: 50,
								posY: 50,
								sortOrder: meta.length + 1,
								enabled: false,
							},
						];
						setMeta(nextMeta);
						await saveGamePatch(gameId, { islands: nextMeta });
					})
				}
			>
				{t('admin.islands.add')}
			</button>
		</section>
	);
}
