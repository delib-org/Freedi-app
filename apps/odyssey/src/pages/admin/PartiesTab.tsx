import { useState } from 'react';
import type { OdysseyParty } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';
import type { IslandContent } from '../../lib/game';
import { saveGamePatch } from '../../lib/admin';
import ImageField from './ImageField';
import type { Flash, Run } from './types';

const SCORE_STEPS = [-1, -0.5, 0, 0.5, 1];

function setPartyScore(
	party: OdysseyParty,
	stanceId: string,
	value: number | null,
	update: (partyId: string, patch: Partial<OdysseyParty>) => void,
): void {
	const attitudes = { ...(party.attitudes ?? {}) };
	if (value === null || Number.isNaN(value)) {
		delete attitudes[stanceId];
	} else {
		attitudes[stanceId] = Math.max(-1, Math.min(1, value));
	}
	update(party.partyId, { attitudes });
}

export default function PartiesTab({
	parties,
	islands,
	busy,
	flash,
	gameId,
	run,
}: {
	parties: OdysseyParty[];
	islands: IslandContent[];
	busy: boolean;
	flash: Flash;
	gameId: string;
	run: Run;
}) {
	const { t } = useT();
	const [draft, setDraft] = useState<OdysseyParty[]>([...parties]);
	const [open, setOpen] = useState<string | null>(null);

	function update(partyId: string, patch: Partial<OdysseyParty>): void {
		setDraft(draft.map((party) => (party.partyId === partyId ? { ...party, ...patch } : party)));
	}

	return (
		<section className="flex flex-col gap-3">
			<p className="panel !py-3 text-[13px] opacity-85 m-0">{t('admin.parties.intro')}</p>
			{[...draft]
				.sort((a, b) => a.sortOrder - b.sortOrder)
				.map((party) => {
					const isOpen = open === party.partyId;

					return (
						<div key={party.partyId} className="panel !py-3">
							<button
								type="button"
								className="w-full flex items-center justify-between bg-transparent border-none text-inherit cursor-pointer p-0"
								onClick={() => setOpen(isOpen ? null : party.partyId)}
							>
								<span className="font-bold text-[16px] text-[var(--cream)] flex items-center gap-2">
									<span
										className="inline-block w-3 h-3 rounded-full"
										style={{ background: party.color }}
										aria-hidden="true"
									/>
									{party.name || t('admin.parties.newShip')}{' '}
									{party.enabled ? '' : t('admin.parties.hidden')}
								</span>
								<span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
							</button>

							{isOpen ? (
								<div className="flex flex-col gap-2 mt-3">
									<div className="flex gap-2 items-center">
										<input
											type="text"
											value={party.name}
											placeholder={t('admin.parties.namePlaceholder')}
											onChange={(event) => update(party.partyId, { name: event.target.value })}
										/>
										<input
											type="text"
											className="!w-28"
											value={party.color}
											title={t('admin.parties.color')}
											onChange={(event) => update(party.partyId, { color: event.target.value })}
										/>
										<input
											type="number"
											className="!w-20"
											value={party.sortOrder}
											title={t('admin.common.order')}
											onChange={(event) =>
												update(party.partyId, {
													sortOrder: Number(event.target.value),
												})
											}
										/>
									</div>
									<textarea
										rows={2}
										value={party.description}
										placeholder={t('admin.parties.descriptionPlaceholder')}
										onChange={(event) => update(party.partyId, { description: event.target.value })}
									/>
									<ImageField
										label={t('admin.parties.image')}
										value={party.imageUrl}
										gameId={gameId}
										onChange={(url) => update(party.partyId, { imageUrl: url })}
										flash={flash}
									/>
									<label className="flex items-center gap-1.5 text-[14px]">
										<input
											type="checkbox"
											checked={party.enabled}
											onChange={(event) => update(party.partyId, { enabled: event.target.checked })}
										/>
										{t('admin.parties.enabled')}
									</label>

									<p className="eyebrow m-0 mt-2">{t('admin.parties.courseHeading')}</p>
									{islands.map((island) => (
										<div key={island.statementId} className="flex flex-col gap-1">
											<span className="text-[14px] font-bold">{island.title}</span>
											{island.stances.map((stance, stanceIndex) => {
												const score = party.attitudes?.[stance.statementId];

												return (
													<div key={stance.statementId} className="flex items-center gap-2">
														<span className="flex-1 text-[13px] opacity-85">
															{t('admin.parties.shoreLine', {
																n: stanceIndex + 1,
																text: stance.statement.slice(0, 70),
															})}
														</span>
														<span
															className="flex gap-1"
															role="group"
															aria-label={t('admin.parties.quickScore')}
														>
															{SCORE_STEPS.map((step) => (
																<button
																	key={step}
																	type="button"
																	className={`btn-outline !px-2 !py-0.5 text-[12px] ${
																		score === step ? '!bg-[var(--cream)] !text-[#0b1f33]' : ''
																	}`}
																	onClick={() =>
																		setPartyScore(party, stance.statementId, step, update)
																	}
																>
																	{step > 0 ? `+${step}` : step}
																</button>
															))}
														</span>
														<input
															type="number"
															className="!w-20"
															min={-1}
															max={1}
															step={0.05}
															value={score ?? ''}
															title={t('admin.parties.exactScore')}
															onChange={(event) =>
																setPartyScore(
																	party,
																	stance.statementId,
																	event.target.value === '' ? null : Number(event.target.value),
																	update,
																)
															}
														/>
													</div>
												);
											})}
										</div>
									))}

									<button
										type="button"
										className="btn-outline self-start !border-[#ff8a96] !text-[#ff8a96]"
										onClick={() => {
											if (confirm(t('admin.parties.confirmRemove', { name: party.name }))) {
												setDraft(draft.filter((candidate) => candidate.partyId !== party.partyId));
											}
										}}
									>
										{t('admin.parties.remove')}
									</button>
								</div>
							) : null}
						</div>
					);
				})}
			<div className="flex justify-center gap-3">
				<button
					type="button"
					className="btn-outline"
					onClick={() => {
						const partyId = `party-${Date.now()}`;
						setDraft([
							...draft,
							{
								partyId,
								name: '',
								color: '#28418f',
								imageUrl: null,
								description: '',
								attitudes: {},
								positions: {},
								sortOrder: draft.length + 1,
								enabled: true,
							},
						]);
						setOpen(partyId);
					}}
				>
					{t('admin.parties.add')}
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() =>
						void run(() =>
							saveGamePatch(gameId, {
								parties: draft.filter((party) => party.name.trim()),
							}),
						)
					}
				>
					{t('admin.parties.save')}
				</button>
			</div>
		</section>
	);
}
