import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OdysseyElder } from '@freedi/shared-types';
import type { IslandContent } from '../lib/game';
import { SILENT_LINE, crewCounsel } from '../lib/counsel';

interface CrewCounselProps {
	crew: OdysseyElder[];
	island: IslandContent;
}

/**
 * להתייעץ עם המלחים — the crew's counsel on the island under your feet.
 *
 * The sailors are the conscience of the game: they are here so the player
 * chooses more consciously, not so they choose the same. So the panel is
 * folded by default (the island's question stays first on a phone), every
 * sailor is offered the same way, nothing is said until one is tapped, and
 * what is said is a value lens — the shore their record leans to and a
 * question in their voice — never a verdict. One sailor speaks at a time;
 * a chorus would read as a majority.
 */
export default function CrewCounsel({ crew, island }: CrewCounselProps) {
	const [openId, setOpenId] = useState<string | null>(null);

	// Islands change under the panel; what Golda said on the last island must
	// not stay open over this one's question. Keying by island (see the
	// caller) resets this state — it is here only for the first render.
	const counsels = crewCounsel(crew, island);
	const open = counsels.find((entry) => entry.elder.elderId === openId) ?? null;

	return (
		<details className="counsel fade-in">
			<summary className="counsel__summary">
				📜 להתייעץ עם המלחים
				{crew.length > 0 ? <span className="counsel__count">({crew.length})</span> : null}
			</summary>
			<div className="counsel__body">
				{crew.length === 0 ? (
					<p className="counsel__note">
						עדיין אין מלחים על הסיפון.{' '}
						<Link className="underline" to="/elders">
							לבחירת צוות
						</Link>
					</p>
				) : (
					<>
						<p className="counsel__note">
							הקישו על מלח כדי לשמוע מאיזו זווית הוא מסתכל על האי הזה. המלחים לא מצביעים במקומכם.
						</p>
						<div className="counsel__crew" role="group" aria-label="המלחים שאיתכם">
							{counsels.map(({ elder }) => {
								const active = openId === elder.elderId;

								return (
									<button
										key={elder.elderId}
										type="button"
										className={`counsel__sailor ${active ? 'counsel__sailor--open' : ''}`}
										aria-pressed={active}
										aria-controls={`counsel-${island.statementId}`}
										onClick={() => setOpenId(active ? null : elder.elderId)}
									>
										<span
											className="counsel__portrait"
											style={{ background: elder.color }}
											aria-hidden="true"
										>
											{elder.portraitUrl ? <img src={elder.portraitUrl} alt="" /> : '⚓'}
										</span>
										<span className="counsel__name">{elder.name}</span>
									</button>
								);
							})}
						</div>
						{open ? (
							<div
								className="counsel__card"
								id={`counsel-${island.statementId}`}
								aria-live="polite"
							>
								<p className="counsel__who">
									<strong>{open.elder.name}</strong>
									{open.elder.role ? (
										<span className="opacity-75"> · {open.elder.role}</span>
									) : null}
								</p>
								{open.silent ? (
									<p className="counsel__line">{SILENT_LINE}</p>
								) : (
									<>
										{open.leansTo ? (
											<p className="counsel__lean">
												<span className="counsel__lean-label">נוטה אל חוף {open.shoreNumber}:</span>{' '}
												{open.leansTo.statement}
											</p>
										) : null}
										{open.line ? <p className="counsel__line">{open.line}</p> : null}
									</>
								)}
								<p className="counsel__disclaimer">
									📜 דמות בינה מלאכותית — שחזור משוער מתוך דבריה, לא ציטוט ולא המלצת הצבעה.
								</p>
							</div>
						) : null}
					</>
				)}
			</div>
		</details>
	);
}
