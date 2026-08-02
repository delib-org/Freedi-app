import { useState } from 'react';
import type {
	OdysseyCompassQuestion,
	OdysseyIsland,
	OdysseyParty,
	OdysseyValue,
} from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import { useGame } from '../state/GameContext';
import { toFreediUser, useUser } from '../lib/user';
import { IslandContent, isGameAdmin } from '../lib/game';
import { seedGame } from '../lib/seed';
import {
	addIslandStatement,
	addStance,
	deleteStance,
	saveGamePatch,
	saveStatementText,
	uploadImage,
} from '../lib/admin';

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
	agoraUrl: 'קישור לאגורה (URL)',
	destinationName: 'שם היעד על המפה',
};

const TABS = [
	{ key: 'texts', label: '🛠️ טקסטים והגדרות' },
	{ key: 'compass', label: '🧭 רוחות המצפון' },
	{ key: 'values', label: '⚖️ ערכים' },
	{ key: 'islands', label: '🏝️ איים' },
	{ key: 'parties', label: '🚢 ספינות (מפלגות)' },
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
									await seedGame(toFreediUser(user!));
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
