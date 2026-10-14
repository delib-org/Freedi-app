import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OdysseyCompassAnswer } from '@freedi/shared-types';
import GameChrome from '../components/GameChrome';
import WindArt from '../components/WindArt';
import WindProgress from '../components/WindProgress';
import { useGame } from '../state/GameContext';
import { DECIDE_WIND_ID } from '../lib/compassArt';
import NoGameYet from '../components/NoGameYet';
import { useMode } from '../lib/mode';
import { stageBus } from '../lib/stageBus';
// One cap, read by the compass and by the strip that reports it as a lit wind.
import { TOP_VALUES } from '../lib/voyageSteps';

/**
 * Chips that make a wind read as answered, and earn the ✓.
 *
 * One chip already unblocks the way onward — the gate has always been "said
 * something". Three is when an answer stops being a shrug, so that is what the
 * wind asks for, out loud and from the start: a player who has picked nothing
 * is shown "0/3" so they never discover the target by accident. Before the
 * indicator, the screen said nothing until three, and players learned the rule
 * only when the ✓ appeared.
 */
const CHIPS_ENOUGH = 3;

/**
 * Enough said on a question wind — three chips, or words of your own.
 *
 * One rule, in one place, because three things ask the question and they must
 * not disagree: the indicator on the card, the button at the foot of the
 * screen, and the petals on the compass rose out at sea. They did disagree.
 * The indicator asked for three while the button opened at one, so a player
 * could be told "1/3" and walk on anyway — which taught them the count was
 * decoration.
 *
 * Words are a whole answer at any length: someone who wrote a paragraph and
 * picked nothing must not be held at the gate for being short of three.
 */
function windAnswered(entry: OdysseyCompassAnswer | undefined): boolean {
	return (entry?.chips.length ?? 0) >= CHIPS_ENOUGH || (entry?.answer ?? '').trim() !== '';
}

/**
 * Inspiration chips are deliberately uncapped.
 *
 * A cap of three was tried, on the theory that it forces the honest question —
 * not what matters, but what matters most. In practice it made a player argue
 * with the interface instead of with themselves: someone who genuinely fears
 * four things had to pretend they feared three. The ranking that the compass
 * really needs is asked once, properly, in רוח ההכרעה, where the order is
 * visible and meant. The chips stay what they look like: everything that
 * speaks to you.
 */

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
			.map(([valueId]) => valueId)
			// A ranking saved under an older, larger cap keeps its top picks and
			// lets the rest go — returning voyagers must never be locked out by
			// yesterday's rules.
			.slice(0, TOP_VALUES),
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
			...questions.map((question) => windAnswered(answers[question.questionId])),
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

	function answered(questionId: string): boolean {
		return windAnswered(answerOf(questionId));
	}

	function setAnswer(questionId: string, patch: Partial<OdysseyCompassAnswer>): void {
		setAnswers((current) => ({
			...current,
			[questionId]: { ...answerOf(questionId), ...patch },
		}));
	}

	function toggleChip(questionId: string, chip: string): void {
		const current = answerOf(questionId);
		if (current.chips.includes(chip)) {
			setAnswer(questionId, { chips: current.chips.filter((item) => item !== chip) });

			return;
		}
		setAnswer(questionId, { chips: [...current.chips, chip] });
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
		questions.every((question) => answered(question.questionId)) && ranked.length === TOP_VALUES;

	async function save(): Promise<void> {
		setSaving(true);
		try {
			await updateJourney({
				compassAnswers: answers,
				valueRankings: Object.fromEntries(ranked.map((valueId, index) => [valueId, index + 1])),
			});
			// The Elders are asked for between calibrating the compass and
			// choosing islands: after the player knows what the game is about,
			// before anyone starts talking to them on the water.
			navigate('/elders');
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
							<div className="flex items-center justify-between gap-3 mt-1 mb-1">
								<span className="wind-head">
									<WindArt questionId={question.questionId} />
									<h2 className="text-xl font-bold text-[var(--cream)] m-0">{question.title}</h2>
								</span>
								<WindProgress
									count={answerOf(question.questionId).chips.length}
									target={CHIPS_ENOUGH}
									done={answered(question.questionId)}
								/>
							</div>
							<p className="text-[15px] text-[#dcecf7] mt-0 mb-3">{question.prompt}</p>

							{/*
							  Chips first, then the writing box. Side by side and unlabelled
							  they read as two ways to answer the same question, and a reader
							  could not tell whether picking one meant skipping the other.
							  In this order they are one instruction: choose your few, then
							  say the part no chip says.
							*/}
							{question.chips.length > 0 ? (
								<>
									<p className="text-[13px] opacity-75 m-0 mb-2">
										בחרו לפחות {CHIPS_ENOUGH} — כל מה שמדבר אליכם:
									</p>
									<div className="flex flex-wrap gap-2" aria-label="כפתורי השראה">
										{question.chips.map((chip) => {
											const active = answerOf(question.questionId).chips.includes(chip);

											return (
												<button
													key={chip}
													type="button"
													className={`chip ${active ? 'active' : ''}`}
													aria-pressed={active}
													onClick={() => toggleChip(question.questionId, chip)}
												>
													{chip}
												</button>
											);
										})}
									</div>
									<div className="mb-3" />
								</>
							) : null}

							<p className="text-[13px] opacity-75 m-0 mb-2">
								ובמילים שלכם{question.chips.length > 0 ? ' (לא חובה)' : ''}:
							</p>
							<textarea
								rows={3}
								value={answerOf(question.questionId).answer}
								onChange={(event) => setAnswer(question.questionId, { answer: event.target.value })}
								placeholder="כתבו במילים שלכם…"
							/>
						</section>
					))}

					<section className="panel fade-in">
						<p className="eyebrow m-0">
							רוח {questions.length + 1} מתוך {questions.length + 1}
						</p>
						<div className="flex items-center justify-between gap-3 mt-1 mb-1">
							<span className="wind-head">
								<WindArt questionId={DECIDE_WIND_ID} />
								<h2 className="text-xl font-bold text-[var(--cream)] m-0">רוח ההכרעה</h2>
							</span>
							<WindProgress
								count={ranked.length}
								target={TOP_VALUES}
								done={ranked.length === TOP_VALUES}
							/>
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
						) : null}
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
								ענו על כל רוח — {CHIPS_ENOUGH} בחירות השראה או במילים שלכם — ובחרו {TOP_VALUES}{' '}
								ערכים מובילים.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}
