import { useState } from 'react';
import type {
	OdysseyCompassQuestion,
	OdysseyGameScript,
	OdysseyIsland,
	OdysseyIslandAgoraSession,
	OdysseyParty,
	OdysseyValue,
} from '@freedi/shared-types';
import {
	AgoraSessionMode,
	ODYSSEY_EVENT_SCRIPT,
	resolveSessionFlow,
	scriptToFlow,
} from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import { useGame } from '../state/GameContext';
import { toFreediUser, useUser } from '../lib/user';
import { IslandContent, isGameAdmin } from '../lib/game';
import { seedGame } from '../lib/seed';
import { currentGameId } from '../state/GameContext';
import { advanceCivicStage, updateCivicFlow } from '../lib/callables';
import {
	addIslandStatement,
	addStance,
	deleteStance,
	saveGamePatch,
	saveStatementText,
	uploadImage,
} from '../lib/admin';
import { provisionCivicSessions } from '../lib/callables';

const TEXT_LABELS: Record<string, string> = {
	gameTitle: 'שם המשחק',
	gameSubtitle: 'כותרת משנה',
	introMotto: 'מוטו הפתיחה',
	introWelcome: 'משפט קבלת פנים',
	introBody: 'פסקת ההסבר במסך הפתיחה',
	introLine1: 'שורת סיום 1',
	introLine2: 'שורת סיום 2',
	startButton: 'כיתוב כפתור ההתחלה',
	compassTitle: 'כותרת מסך המצפן',
	compassIntro: 'משפט פתיחה למצפן',
	mapTitle: 'כותרת מסך המפה',
	mapIntro: 'משפט פתיחה למפה',
	voyageShipsNote: 'כיתוב תגובת הים',
	summaryTitle: 'כותרת מסך הסיכום',
	summaryIntro: 'משפט פתיחה לסיכום',
	agoraQuestion: 'שאלת שער האגורה',
	agoraButton: 'כיתוב כפתור האגורה',
	agoraOrigin: 'כתובת אפליקציית האגורה (Origin)',
	destinationName: 'שם היעד על המפה',
};

const TABS = [
	{ key: 'texts', label: '🛠️ טקסטים והגדרות' },
	{ key: 'compass', label: '🧭 רוחות המצפון' },
	{ key: 'values', label: '⚖️ ערכים' },
	{ key: 'islands', label: '🏝️ איים' },
	{ key: 'parties', label: '🚢 ספינות (מפלגות)' },
	{ key: 'agora', label: '🏛️ אגורה' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Admin console. Game config edits go to the odysseyGames doc; island and
 * stance texts are Statement edits (they are real Freedi statements, so the
 * whole ecosystem — consensus pipeline, other apps — sees the same content).
 */
export default function Admin() {
	const { user } = useUser();
	const { content, loading, reload } = useGame();
	const [tab, setTab] = useState<TabKey>('texts');
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function flash(message: string): void {
		setStatus(message);
		setTimeout(() => setStatus(null), 3000);
	}

	async function run(action: () => Promise<void>): Promise<void> {
		setBusy(true);
		try {
			await action();
			flash('✓ נשמר');
			await reload();
		} catch (error) {
			console.error('[Odyssey admin]', error);
			flash('שגיאה בשמירה');
		} finally {
			setBusy(false);
		}
	}

	if (loading) {
		return (
			<>
				<GameChrome stage="ניהול" />
				<div className="page justify-center">
					<p className="panel">טוען…</p>
				</div>
			</>
		);
	}

	if (!content) {
		return (
			<>
				<GameChrome stage="ניהול" />
				<div className="page justify-center">
					<section className="panel text-center max-w-md flex flex-col items-center gap-3">
						<h2 className="text-xl font-bold text-[var(--cream)] m-0">הקמת המשחק</h2>
						<p className="text-[15px] opacity-85 m-0">
							המשחק עדיין לא קיים. יצירת המשחק תבנה את עץ ההיגדים (אי = שאלה, חוף = אופציה) ואת
							הגדרות המשחק, עם תוכן ברירת המחדל מהאפיון.
						</p>
						{status ? <p className="text-[var(--gold-strong)] m-0">{status}</p> : null}
						<button
							type="button"
							className="btn"
							disabled={busy || !user}
							onClick={() =>
								void run(async () => {
									// Seeds the game this URL is pointing at, not always the
									// default one — otherwise "?game=<event>" on an empty
									// event would silently create the shared default instead.
									await seedGame(toFreediUser(user!), currentGameId());
								})
							}
						>
							{busy ? 'יוצר…' : '⚓ יצירת המשחק'}
						</button>
					</section>
				</div>
			</>
		);
	}

	if (!isGameAdmin(content.game, user?.uid)) {
		return (
			<>
				<GameChrome stage="ניהול" />
				<div className="page justify-center">
					<p className="panel">אין לך הרשאת ניהול למשחק הזה.</p>
				</div>
			</>
		);
	}

	const gameId = content.game.gameId;

	return (
		<>
			<GameChrome stage="עריכת תוכן המשחק" />
			<div className="page">
				<div className="w-full max-w-4xl flex flex-col gap-4">
					<div className="flex flex-wrap gap-2 justify-center">
						{TABS.map((entry) => (
							<button
								key={entry.key}
								type="button"
								className={`btn-outline ${tab === entry.key ? '!bg-[rgba(216,170,75,0.25)] !border-[var(--gold-strong)]' : ''}`}
								onClick={() => setTab(entry.key)}
							>
								{entry.label}
							</button>
						))}
					</div>

					{status ? (
						<p className="text-center text-[var(--gold-strong)] m-0" role="status">
							{status}
						</p>
					) : null}

					{tab === 'texts' ? (
						<TextsTab
							texts={content.game.texts}
							busy={busy}
							onSave={(texts) => void run(() => saveGamePatch(gameId, { texts }))}
						/>
					) : null}
					{tab === 'compass' ? (
						<CompassTab
							questions={content.game.compassQuestions}
							busy={busy}
							onSave={(compassQuestions) =>
								void run(() => saveGamePatch(gameId, { compassQuestions }))
							}
						/>
					) : null}
					{tab === 'values' ? (
						<ValuesTab
							values={content.game.values}
							busy={busy}
							onSave={(values) => void run(() => saveGamePatch(gameId, { values }))}
						/>
					) : null}
					{tab === 'islands' ? (
						<IslandsTab
							islands={content.islands}
							busy={busy}
							flash={flash}
							gameId={gameId}
							rootStatementId={content.game.rootStatementId}
							islandsMeta={content.game.islands}
							run={run}
						/>
					) : null}
					{tab === 'parties' ? (
						<PartiesTab
							parties={content.game.parties}
							islands={content.islands}
							busy={busy}
							flash={flash}
							gameId={gameId}
							run={run}
						/>
					) : null}
					{tab === 'agora' ? (
						<AgoraTab
							islands={content.islands}
							islandsMeta={content.game.islands}
							agoraSessions={content.game.agoraSessions ?? {}}
							agoraOrigin={content.game.texts.agoraOrigin ?? ''}
							script={content.game.script}
							busy={busy}
							flash={flash}
							gameId={gameId}
							run={run}
						/>
					) : null}
				</div>
			</div>
		</>
	);
}

/* ---------- Texts ---------- */

function TextsTab({
	texts,
	busy,
	onSave,
}: {
	texts: Record<string, string>;
	busy: boolean;
	onSave: (texts: Record<string, string>) => void;
}) {
	const [draft, setDraft] = useState<Record<string, string>>({ ...texts });
	const keys = [...new Set([...Object.keys(TEXT_LABELS), ...Object.keys(draft)])];

	return (
		<section className="panel flex flex-col gap-3">
			{keys.map((key) => (
				<label key={key} className="flex flex-col gap-1">
					<span className="text-[13px] text-[var(--gold-strong)]">{TEXT_LABELS[key] ?? key}</span>
					{(draft[key] ?? '').length > 60 ? (
						<textarea
							rows={2}
							value={draft[key] ?? ''}
							onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
						/>
					) : (
						<input
							type="text"
							value={draft[key] ?? ''}
							onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
						/>
					)}
				</label>
			))}
			<button
				type="button"
				className="btn self-center"
				disabled={busy}
				onClick={() => onSave(draft)}
			>
				שמירת הגדרות
			</button>
		</section>
	);
}

/* ---------- Compass ---------- */

function CompassTab({
	questions,
	busy,
	onSave,
}: {
	questions: OdysseyCompassQuestion[];
	busy: boolean;
	onSave: (questions: OdysseyCompassQuestion[]) => void;
}) {
	const [draft, setDraft] = useState<OdysseyCompassQuestion[]>([...questions]);

	function update(index: number, patch: Partial<OdysseyCompassQuestion>): void {
		setDraft(draft.map((item, i) => (i === index ? { ...item, ...patch } : item)));
	}

	return (
		<section className="flex flex-col gap-4">
			{draft.map((question, index) => (
				<div key={question.questionId} className="panel flex flex-col gap-2">
					<div className="flex gap-2">
						<input
							type="text"
							value={question.title}
							placeholder="כותרת (למשל: רוח האהבה)"
							onChange={(event) => update(index, { title: event.target.value })}
						/>
						<input
							type="number"
							className="!w-24"
							value={question.sortOrder}
							title="סדר"
							onChange={(event) => update(index, { sortOrder: Number(event.target.value) })}
						/>
					</div>
					<textarea
						rows={2}
						value={question.prompt}
						placeholder="השאלה"
						onChange={(event) => update(index, { prompt: event.target.value })}
					/>
					<input
						type="text"
						value={question.chips.join(', ')}
						placeholder="כפתורי השראה, מופרדים בפסיקים"
						onChange={(event) =>
							update(index, {
								chips: event.target.value
									.split(',')
									.map((chip) => chip.trim())
									.filter(Boolean),
							})
						}
					/>
					<label className="flex items-center gap-1.5 text-[14px]">
						<input
							type="checkbox"
							checked={question.enabled}
							onChange={(event) => update(index, { enabled: event.target.checked })}
						/>
						פעיל
					</label>
				</div>
			))}
			<div className="flex justify-center gap-3">
				<button
					type="button"
					className="btn-outline"
					onClick={() =>
						setDraft([
							...draft,
							{
								questionId: `q-${Date.now()}`,
								title: '',
								prompt: '',
								chips: [],
								sortOrder: draft.length + 1,
								enabled: true,
							},
						])
					}
				>
					+ הוספת רוח
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => onSave(draft.filter((question) => question.title.trim()))}
				>
					שמירה
				</button>
			</div>
		</section>
	);
}

/* ---------- Values ---------- */

function ValuesTab({
	values,
	busy,
	onSave,
}: {
	values: OdysseyValue[];
	busy: boolean;
	onSave: (values: OdysseyValue[]) => void;
}) {
	const [draft, setDraft] = useState<OdysseyValue[]>([...values]);

	return (
		<section className="panel flex flex-col gap-2">
			<p className="text-[13px] opacity-75 m-0">
				הערכים של ״רוח ההכרעה״ — המשתמשים בוחרים ומדרגים חמישה.
			</p>
			{draft.map((value, index) => (
				<div key={value.valueId} className="flex items-center gap-2">
					<input
						type="text"
						value={value.label}
						onChange={(event) =>
							setDraft(
								draft.map((item, i) =>
									i === index ? { ...item, label: event.target.value } : item,
								),
							)
						}
					/>
					<input
						type="number"
						className="!w-20"
						value={value.sortOrder}
						title="סדר"
						onChange={(event) =>
							setDraft(
								draft.map((item, i) =>
									i === index ? { ...item, sortOrder: Number(event.target.value) } : item,
								),
							)
						}
					/>
					<button
						type="button"
						className="btn-outline shrink-0 !border-[#ff8a96] !text-[#ff8a96]"
						title="הסרה"
						onClick={() => setDraft(draft.filter((_, i) => i !== index))}
					>
						✕
					</button>
				</div>
			))}
			<div className="flex justify-center gap-3 mt-2">
				<button
					type="button"
					className="btn-outline"
					onClick={() =>
						setDraft([
							...draft,
							{
								valueId: `value-${Date.now()}`,
								label: '',
								sortOrder: draft.length + 1,
								enabled: true,
							},
						])
					}
				>
					+ הוספת ערך
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => onSave(draft.filter((value) => value.label.trim()))}
				>
					שמירה
				</button>
			</div>
		</section>
	);
}

/* ---------- Image field ---------- */

function ImageField({
	label,
	value,
	gameId,
	onChange,
	flash,
}: {
	label: string;
	value: string | null | undefined;
	gameId: string;
	onChange: (url: string | null) => void;
	flash: (message: string) => void;
}) {
	async function upload(file: File): Promise<void> {
		try {
			const url = await uploadImage(gameId, file);
			onChange(url);
			flash('✓ התמונה הועלתה — לא לשכוח לשמור');
		} catch (error) {
			console.error('[Odyssey admin] upload failed', error);
			flash('ההעלאה נכשלה — אפשר להדביק כתובת תמונה במקום');
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-[13px] text-[var(--gold-strong)] shrink-0">{label}</span>
			{value ? (
				<img
					src={value}
					alt=""
					className="w-10 h-10 rounded-lg object-cover border border-[rgba(232,185,88,0.6)]"
				/>
			) : null}
			<input
				type="text"
				value={value ?? ''}
				placeholder="כתובת תמונה (URL) או העלאה ←"
				onChange={(event) => onChange(event.target.value || null)}
			/>
			<label className="btn-outline shrink-0 cursor-pointer">
				העלאה
				<input
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void upload(file);
					}}
				/>
			</label>
		</div>
	);
}

/* ---------- Islands ---------- */

function IslandsTab({
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
	flash: (message: string) => void;
	gameId: string;
	rootStatementId: string;
	run: (action: () => Promise<void>) => Promise<void>;
}) {
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
			<p className="panel !py-3 text-[13px] opacity-85 m-0">
				כל אי הוא היגד-שאלה וכל חוף הוא היגד-אופציה במערכת ההיגדים של Freedi — עריכת הטקסטים כאן
				מעדכנת את ההיגדים עצמם.
			</p>
			{meta
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
									{islandMeta.title} {islandMeta.enabled ? '' : '(מוסתר)'}
								</span>
								<span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
							</button>

							{isOpen ? (
								<div className="flex flex-col gap-2 mt-3">
									<div className="flex gap-2">
										<input
											type="text"
											value={islandMeta.title}
											placeholder="שם האי"
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
											title="סדר"
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
										placeholder="הסוגיה האזרחית"
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												issue: event.target.value,
											})
										}
									/>
									<textarea
										rows={2}
										value={islandMeta.shortExplain}
										placeholder="הסבר קצר"
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												shortExplain: event.target.value,
											})
										}
									/>
									<textarea
										rows={2}
										value={islandMeta.opening}
										placeholder="פתיחה סיפורית"
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												opening: event.target.value,
											})
										}
									/>
									<label className="flex flex-col gap-1">
										<span className="text-[13px] text-[var(--gold-strong)]">
											השאלה המרכזית (היגד)
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
										placeholder="שאלת עומק (רשות)"
										onChange={(event) =>
											updateMeta(islandMeta.statementId, {
												depthQuestion: event.target.value,
											})
										}
									/>
									<ImageField
										label="תמונת האי"
										value={islandMeta.imageUrl}
										gameId={gameId}
										onChange={(url) => updateMeta(islandMeta.statementId, { imageUrl: url })}
										flash={flash}
									/>
									<div className="flex items-center gap-2">
										<span className="text-[13px] text-[var(--gold-strong)]">מיקום על המפה (%)</span>
										<input
											type="number"
											className="!w-24"
											value={islandMeta.posX}
											title="אופקי (0-100)"
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
											title="אנכי (0-100)"
											onChange={(event) =>
												updateMeta(islandMeta.statementId, {
													posY: Number(event.target.value),
												})
											}
										/>
										<label className="flex items-center gap-1.5 text-[14px] mr-auto">
											<input
												type="checkbox"
												checked={islandMeta.enabled}
												onChange={(event) =>
													updateMeta(islandMeta.statementId, {
														enabled: event.target.checked,
													})
												}
											/>
											מוצג במשחק
										</label>
									</div>

									<p className="eyebrow m-0 mt-2">החופים (היגדי אופציה)</p>
									{island.stances.map((stance, stanceIndex) => (
										<div key={stance.statementId} className="flex items-center gap-2">
											<span className="text-[13px] opacity-70 shrink-0">חוף {stanceIndex + 1}</span>
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
												title="מחיקת החוף (ההיגד)"
												onClick={() => {
													if (confirm('למחוק את החוף הזה?')) {
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
										placeholder="+ חוף חדש (יישמר בלחיצה על שמירת האי)"
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
										שמירת האי
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
							centralQuestion: 'שאלה חדשה — ערכו אותי',
							order: meta.length + 1,
							creator: toFreediUser(user!),
						});
						const nextMeta: OdysseyIsland[] = [
							...meta,
							{
								statementId,
								title: 'אי חדש',
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
				+ הוספת אי חדש
			</button>
		</section>
	);
}

/* ---------- Parties ---------- */

function PartiesTab({
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
	flash: (message: string) => void;
	gameId: string;
	run: (action: () => Promise<void>) => Promise<void>;
}) {
	const [draft, setDraft] = useState<OdysseyParty[]>([...parties]);
	const [open, setOpen] = useState<string | null>(null);

	function update(partyId: string, patch: Partial<OdysseyParty>): void {
		setDraft(draft.map((party) => (party.partyId === partyId ? { ...party, ...patch } : party)));
	}

	return (
		<section className="flex flex-col gap-3">
			<p className="panel !py-3 text-[13px] opacity-85 m-0">
				מסלול הספינה של כל מפלגה = ההיגד (החוף) שאליו היא הכי קרובה בכל אי. הנתונים שנטענו הם דוגמה
				בלבד — יש לעדכן לפי הצהרות ומצע בפועל. מהם נגזר חישוב המרחק.
			</p>
			{draft
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
									{party.name || 'ספינה חדשה'} {party.enabled ? '' : '(מוסתרת)'}
								</span>
								<span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
							</button>

							{isOpen ? (
								<div className="flex flex-col gap-2 mt-3">
									<div className="flex gap-2 items-center">
										<input
											type="text"
											value={party.name}
											placeholder="שם המפלגה"
											onChange={(event) => update(party.partyId, { name: event.target.value })}
										/>
										<input
											type="text"
											className="!w-28"
											value={party.color}
											title="צבע (hex)"
											onChange={(event) => update(party.partyId, { color: event.target.value })}
										/>
										<input
											type="number"
											className="!w-20"
											value={party.sortOrder}
											title="סדר"
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
										placeholder="תיאור (רשות)"
										onChange={(event) => update(party.partyId, { description: event.target.value })}
									/>
									<ImageField
										label="סמל/תמונה"
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
										מוצגת במשחק
									</label>

									<p className="eyebrow m-0 mt-2">מסלול הספינה — העמדה הקרובה בכל אי</p>
									{islands.map((island) => (
										<label key={island.statementId} className="flex items-center gap-2">
											<span className="w-40 shrink-0 text-[14px]">{island.title}</span>
											<select
												value={party.positions[island.statementId] ?? ''}
												onChange={(event) => {
													const positions = { ...party.positions };
													if (event.target.value) {
														positions[island.statementId] = event.target.value;
													} else {
														delete positions[island.statementId];
													}
													update(party.partyId, { positions });
												}}
											>
												<option value="">— אין נתונים —</option>
												{island.stances.map((stance, stanceIndex) => (
													<option key={stance.statementId} value={stance.statementId}>
														חוף {stanceIndex + 1}: {stance.statement.slice(0, 60)}
													</option>
												))}
											</select>
										</label>
									))}

									<button
										type="button"
										className="btn-outline self-start !border-[#ff8a96] !text-[#ff8a96]"
										onClick={() => {
											if (confirm(`למחוק את "${party.name}"?`)) {
												setDraft(draft.filter((candidate) => candidate.partyId !== party.partyId));
											}
										}}
									>
										הסרת הספינה (נשמר בלחיצה על שמירה)
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
								positions: {},
								sortOrder: draft.length + 1,
								enabled: true,
							},
						]);
						setOpen(partyId);
					}}
				>
					+ הוספת ספינה
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
					שמירת הספינות
				</button>
			</div>
		</section>
	);
}

/* ---------- The event script ---------- */

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
function ScriptSection({
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
	flash(message: string): void;
	gameId: string;
	run(action: () => Promise<void>): Promise<void>;
}) {
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
			flash('התסריט נשמר');

			return;
		}
		const result = await updateCivicFlow(gameId);
		flash(`התסריט נשמר · ${result.updated.length} דיונים עודכנו`);
	}

	return (
		<section className="panel flex flex-col gap-4">
			<div>
				<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">תסריט האירוע</h2>
				<p className="text-[14px] opacity-80 m-0">
					מה עובר משתתף בדיון. שינוי כאן חל גם על דיונים שכבר נפתחו — קוד ההצטרפות וההצעות שנכתבו
					נשמרים.
				</p>
			</div>

			<div className="flex flex-col gap-3">
				<ScriptToggle
					label="עמדות ומחנות"
					hint={
						resolved.stances
							? 'המשתתפים משובצים לשני מחנות לפי העמדות שסימנו באי, והציון נמדד בגישור ביניהם.'
							: 'בלי מחנות. במקום ציון גישור, נמדד כמה הדעות בחדר התקרבו זו לזו במהלך הדיון.'
					}
					checked={resolved.stances}
					onChange={(next) => patch({ stancesEnabled: next })}
				/>
				<ScriptToggle
					label="לוח הצרכים"
					hint="מציג את הצרכים שמאחורי שתי העמדות במהלך הכתיבה."
					checked={resolved.needs}
					onChange={(next) => patch({ needsEnabled: next })}
				/>
				<ScriptToggle
					label="זקני הדור"
					hint="דמויות בינה מלאכותית בהשראת מנהיגים היסטוריים מפליגות לצד המשתתפים: ספינות זקנים בים, ומועצת זקנים שמגיבה על הצעות בדיון. כיבוי מסתיר גם את שאלת הדמויות."
					checked={resolved.elders}
					onChange={(next) => patch({ eldersEnabled: next })}
				/>
				<ScriptToggle
					label="מסך פתיחה"
					hint="מסך קצר בתחילת הדיון, בנוי מהטקסט של האי עצמו."
					checked={resolved.framing}
					onChange={(next) => patch({ framingEnabled: next })}
				/>
				<ScriptToggle
					label="הצבעה בסיום"
					hint="הדיון נחתם בהצבעה על ההצעות לפני מסך התוצאות."
					checked={resolved.voting}
					onChange={(next) => patch({ votingEnabled: next })}
				/>

				<div className="flex flex-wrap gap-4">
					<label className="flex flex-col gap-1">
						<span className="text-[13px] opacity-80">מספר סבבים</span>
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
						<span className="text-[13px] opacity-80">דירוגים בכל סבב</span>
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
					שמירת התסריט
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
					מצב אירוע
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
					חזרה לברירת המחדל
				</button>
			</div>
		</section>
	);
}

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
function ConductorSection({
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
	flash(message: string): void;
	run(action: () => Promise<void>): Promise<void>;
}) {
	const open = islands
		.map((island) => ({ island, session: agoraSessions[island.statementId] }))
		.filter((entry): entry is { island: IslandContent; session: OdysseyIslandAgoraSession } =>
			Boolean(entry.session),
		);

	if (!open.length) return null;

	async function advance(sessionId: string, stage: string, label: string): Promise<void> {
		await advanceCivicStage(sessionId, stage);
		flash(`${label} · הדיון עודכן`);
	}

	return (
		<section className="panel flex flex-col gap-4">
			<div>
				<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">ניהול האירוע</h2>
				<p className="text-[14px] opacity-80 m-0">
					דיון נשאר פתוח כל עוד לא נסגר. סגירה מעבירה את המשתתפים לשאלת הסיום ולתוצאות — ואי אפשר
					לחזור אחורה.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				{open.map(({ island, session }) => (
					<div
						key={island.statementId}
						className="flex flex-wrap items-center gap-2 justify-between"
					>
						<span className="text-[14px] text-[var(--cream)]">
							{island.title} · קוד {session.code}
						</span>
						<span className="flex gap-2">
							{votingEnabled ? (
								<button
									type="button"
									className="btn-outline"
									disabled={busy}
									onClick={() => void run(() => advance(session.sessionId, 'voting', island.title))}
								>
									להצבעה
								</button>
							) : null}
							<button
								type="button"
								className="btn-outline"
								disabled={busy}
								onClick={() => void run(() => advance(session.sessionId, 'results', island.title))}
							>
								לתוצאות
							</button>
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

/* ---------- Agora ---------- */

/**
 * Opening the deliberations. Two decisions live here: which two stances are
 * the poles of each island — they decide which camp a player carries into the
 * square — and the one-time act of opening the sessions themselves.
 */
function AgoraTab({
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
	flash(message: string): void;
	gameId: string;
	run(action: () => Promise<void>): Promise<void>;
}) {
	const [meta, setMeta] = useState<OdysseyIsland[]>(islandsMeta);

	function patchIsland(statementId: string, patch: Partial<OdysseyIsland>): void {
		setMeta((current) =>
			current.map((island) =>
				island.statementId === statementId ? { ...island, ...patch } : island,
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
					<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-1">שערי האגורה</h2>
					<p className="text-[14px] opacity-80 m-0">
						לכל אי נפתח דיון קבוע באגורה. בחרו לכל אי שני חופים מנוגדים — הם קובעים לאיזה מחנה ישובץ
						מפליג שנכנס לדיון, ולכן חשוב לבחור חופים שבאמת חלוקים זה על זה.
					</p>
					{!origin ? (
						<p className="text-[14px] text-[var(--gold-strong)] mt-2 mb-0">
							⚠️ יש להגדיר תחילה את כתובת אפליקציית האגורה בלשונית הטקסטים.
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
										חוף א׳ (קוטב אחד)
										<select
											className="input"
											value={entry?.leftAnchorStanceId ?? ''}
											onChange={(event) =>
												patchIsland(island.statementId, {
													leftAnchorStanceId: event.target.value || null,
												})
											}
										>
											<option value="">— לא נבחר —</option>
											{island.stances.map((stance) => (
												<option key={stance.statementId} value={stance.statementId}>
													{stance.statement}
												</option>
											))}
										</select>
									</label>
									<label className="flex flex-col gap-1 text-[13px] opacity-85 flex-1 min-w-[240px]">
										חוף ב׳ (הקוטב הנגדי)
										<select
											className="input"
											value={entry?.rightAnchorStanceId ?? ''}
											onChange={(event) =>
												patchIsland(island.statementId, {
													rightAnchorStanceId: event.target.value || null,
												})
											}
										>
											<option value="">— לא נבחר —</option>
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
										✓ דיון פתוח · קוד הצטרפות <strong>{session.code}</strong>
										{origin ? (
											<>
												{' · '}
												<a
													className="underline"
													href={`${origin}/#!/join/${session.code}`}
													target="_blank"
													rel="noreferrer"
												>
													פתיחת הדיון
												</a>
											</>
										) : null}
									</p>
								) : (
									<p className="text-[13px] opacity-60 m-0">טרם נפתח דיון לאי הזה.</p>
								)}
							</div>
						);
					})}
				</div>

				{missingAnchors.length ? (
					<p className="text-[13px] opacity-75 m-0">
						שימו לב: ל־{missingAnchors.length} איים עדיין אין שני חופים מנוגדים. אפשר לפתוח להם
						דיון, אך כל המפליגים בהם ישובצו למרכז.
					</p>
				) : null}

				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className="btn"
						disabled={busy}
						onClick={() => void run(() => saveGamePatch(gameId, { islands: meta }))}
					>
						שמירת החופים המנוגדים
					</button>
					<button
						type="button"
						className="btn-outline"
						disabled={busy || !origin}
						onClick={() =>
							void run(async () => {
								// Anchors are saved first: the session carries them, and a
								// session opened without them places everyone in the centre.
								await saveGamePatch(gameId, { islands: meta });
								const result = await provisionCivicSessions(gameId);
								flash(
									`נפתחו ${result.sessions.length} דיונים` +
										(result.alreadyOpen.length
											? ` · ${result.alreadyOpen.length} כבר היו פתוחים`
											: ''),
								);
							})
						}
					>
						🏛️ פתיחת דיוני האגורה
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
