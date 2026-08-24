import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OdysseyCompassAnswer } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import { useGame } from '../state/GameContext';
import NoGameYet from '../components/NoGameYet';
import { useMode } from '../lib/mode';
import { stageBus } from '../lib/stageBus';

const TOP_VALUES = 3;

/**
 * ארבע רוחות המצפון: three open questions with inspiration chips, then the
 * fourth wind — ranking the top values. Personal/reflective, stored on the
 * journey doc (not statements). In game mode the compass rose on the sea
 * stage reacts: answered winds light petals, ranked values hoist pennants.
 */
export default function Compass() {
	const navigate = useNavigate();
	const mode = useMode();
	const { content, journey, text, updateJourney } = useGame();
	const [answers, setAnswers] = useState<Record<string, OdysseyCompassAnswer>>(() => ({
		...(journey?.compassAnswers ?? {}),
	}));
	const [ranked, setRanked] = useState<string[]>(() =>
		Object.entries(journey?.valueRankings ?? {})
			.sort((a, b) => a[1] - b[1])
			.map(([valueId]) => valueId),
	);
	const [saving, setSaving] = useState(false);

	const questions = useMemo(
		() =>
			(content?.game.compassQuestions ?? [])
				.filter((question) => question.enabled)
				.sort((a, b) => a.sortOrder - b.sortOrder),
		[content],
	);

	/** One boolean per wind: the 3 questions + the values wind. */
	const windsLit = useMemo(
		() => [
			...questions.map((question) => {
				const entry = answers[question.questionId] ?? { answer: '', chips: [] };

				return entry.answer.trim() !== '' || entry.chips.length > 0;
			}),
			ranked.length === TOP_VALUES,
		],
		[questions, answers, ranked],
	);

	const previousWinds = useRef<boolean[]>([]);
	useEffect(() => {
		if (mode !== 'game') return;
		windsLit.forEach((lit, index) => {
			if (previousWinds.current[index] !== lit) {
				stageBus.send({ type: 'compassWind', index, lit });
			}
		});
		previousWinds.current = windsLit;
		if (windsLit.length > 1 && windsLit.every(Boolean)) {
			stageBus.send({ type: 'compassComplete' });
		}
	}, [mode, windsLit]);

	useEffect(() => {
		if (mode === 'game') stageBus.send({ type: 'setPennants', count: ranked.length });
	}, [mode, ranked.length]);

	if (!content || !journey) return <NoGameYet />;

	const values = content.game.values
		.filter((value) => value.enabled)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	function answerOf(questionId: string): OdysseyCompassAnswer {
		return answers[questionId] ?? { answer: '', chips: [] };
	}

	function setAnswer(questionId: string, patch: Partial<OdysseyCompassAnswer>): void {
		setAnswers((current) => ({
			...current,
			[questionId]: { ...answerOf(questionId), ...patch },
		}));
	}

	function toggleChip(questionId: string, chip: string): void {
		const current = answerOf(questionId);
		setAnswer(questionId, {
			chips: current.chips.includes(chip)
				? current.chips.filter((item) => item !== chip)
				: [...current.chips, chip],
		});
	}

	function toggleValue(valueId: string): void {
		setRanked((current) => {
			if (current.includes(valueId)) {
				return current.filter((id) => id !== valueId);
			}
			if (current.length >= TOP_VALUES) return current;

			return [...current, valueId];
		});
	}

	const complete =
		questions.every((question) => {
			const entry = answerOf(question.questionId);

			return entry.answer.trim() !== '' || entry.chips.length > 0;
		}) && ranked.length === TOP_VALUES;

	async function save(): Promise<void> {
		setSaving(true);
		try {
			await updateJourney({
				compassAnswers: answers,
				valueRankings: Object.fromEntries(ranked.map((valueId, index) => [valueId, index + 1])),
			});
			navigate('/map');
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<GameChrome stage={text('compassTitle')} />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-5">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{text('compassTitle')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2">{text('compassIntro')}</p>
					</header>

					{mode === 'game' ? (
						// breathing room for the compass rose on the sea stage
						<div className="h-[30vh]" aria-hidden="true" />
					) : null}

					{questions.map((question, index) => (
						<section key={question.questionId} className="panel fade-in">
							<p className="eyebrow m-0">
								רוח {index + 1} מתוך {questions.length + 1}
							</p>
							<h2 className="text-xl font-bold text-[var(--cream)] mt-1 mb-1">{question.title}</h2>
							<p className="text-[15px] text-[#dcecf7] mt-0 mb-3">{question.prompt}</p>
							<textarea
								rows={3}
								value={answerOf(question.questionId).answer}
								onChange={(event) => setAnswer(question.questionId, { answer: event.target.value })}
								placeholder="כתבו במילים שלכם…"
							/>
							{question.chips.length > 0 ? (
								<div className="flex flex-wrap gap-2 mt-3" aria-label="כפתורי השראה">
									{question.chips.map((chip) => (
										<button
											key={chip}
											type="button"
											className={`chip ${answerOf(question.questionId).chips.includes(chip) ? 'active' : ''}`}
											onClick={() => toggleChip(question.questionId, chip)}
										>
											{chip}
										</button>
									))}
								</div>
							) : null}
						</section>
					))}

					<section className="panel fade-in">
						<p className="eyebrow m-0">
							רוח {questions.length + 1} מתוך {questions.length + 1}
						</p>
						<div className="flex items-center justify-between gap-3 mt-1 mb-1">
							<h2 className="text-xl font-bold text-[var(--cream)] m-0">רוח ההכרעה</h2>
							<span
								className="flex items-center gap-2 rounded-full border border-[rgba(232,185,88,0.5)] bg-[rgba(6,24,44,0.7)] px-3 py-1"
								role="status"
								aria-label={`נבחרו ${ranked.length} ערכים מתוך ${TOP_VALUES}`}
							>
								<span className="flex gap-1" aria-hidden="true">
									{Array.from({ length: TOP_VALUES }, (_, dot) => (
										<span
											key={dot}
											className={`inline-block h-2.5 w-2.5 rounded-full ${
												dot < ranked.length
													? 'bg-[var(--gold-strong)]'
													: 'border border-[rgba(232,185,88,0.5)]'
											}`}
										/>
									))}
								</span>
								<strong
									className={`text-[14px] ${
										ranked.length === TOP_VALUES
											? 'text-[var(--gold-strong)]'
											: 'text-[var(--cream)]'
									}`}
								>
									{ranked.length}/{TOP_VALUES}
								</strong>
							</span>
						</div>
						<p className="text-[15px] text-[#dcecf7] mt-0 mb-3">
							כשאין פתרון טוב, מה בכל זאת צריך להנחות אותך? בחרו {TOP_VALUES} ערכים מובילים, לפי
							הסדר.
						</p>
						<div className="flex flex-wrap gap-2">
							{values.map((value) => {
								const position = ranked.indexOf(value.valueId);

								return (
									<button
										key={value.valueId}
										type="button"
										className={`chip ${position >= 0 ? 'active' : ''}`}
										onClick={() => toggleValue(value.valueId)}
									>
										{position >= 0 ? `${position + 1}. ` : ''}
										{value.label}
									</button>
								);
							})}
						</div>
						{ranked.length > TOP_VALUES ? (
							// A ranking saved before the cap dropped to 3 loads with more —
							// say exactly what unblocks the way onward.
							<p className="text-[13px] text-[var(--gold-strong)] mt-3 mb-0">
								בחרתם {ranked.length} ערכים — הסירו {ranked.length - TOP_VALUES} בלחיצה עליהם כדי
								להמשיך.
							</p>
						) : (
							<p className="text-[13px] opacity-75 mt-3 mb-0">
								{ranked.length === TOP_VALUES
									? 'נבחרו כל הערכים. לחיצה נוספת מסירה ערך.'
									: `נבחרו ${ranked.length} מתוך ${TOP_VALUES}. לחיצה נוספת מסירה ערך.`}
							</p>
						)}
					</section>

					<div className="flex flex-col items-center gap-2 pb-4">
						<button
							type="button"
							className="btn"
							disabled={!complete || saving}
							onClick={() => void save()}
						>
							{saving ? 'שומר…' : 'המצפן שלך כויל — לפתיחת המפה'}
						</button>
						{!complete ? (
							<p className="text-[13px] opacity-75 m-0">
								ענו על כל רוח (בטקסט או בבחירת השראה) ובחרו {TOP_VALUES} ערכים.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}
