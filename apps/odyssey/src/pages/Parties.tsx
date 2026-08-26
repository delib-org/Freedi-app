import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';

/**
 * Where the ships' courses come from.
 *
 * The map tells a player how near each party sails to them, which is a strong
 * claim to make silently. It is also the claim that is hardest to make about
 * this particular election: half the field is new. ביחד did not exist to have
 * a platform; ישר! has a leader's record and no party record at all. Saying so
 * is not a disclaimer — it is the difference between a reading a player can
 * argue with and a number they have to take on faith.
 */
export default function Parties() {
	const { content } = useGame();

	if (!content) return <NoGameYet />;

	const parties = content.game.parties
		.filter((party) => party.enabled)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	return (
		<>
			<GameChrome stage="הספינות" />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4 pb-8">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">איך נקבע מסלול של ספינה</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">
							הקרבה שאתם רואים היא חישוב, לא דעה. זה מה שנכנס לתוכו.
						</p>
					</header>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">השיטה</h2>
						<p className="text-[15px] m-0 mb-2">
							לכל מפלגה נקבע ציון על <strong>כל חוף בנפרד</strong> — עד כמה היא תומכת או מתנגדת לו —
							על בסיס חומר מפורסם: מצע, הצבעות בכנסת והתבטאויות מתועדות. הקרבה שלכם לספינה היא המרחק
							הממוצע בין הציונים שלכם לשלה, על החופים שסימנתם בלבד.
						</p>
						<p className="text-[15px] m-0">
							לכל ציון נשמרים גם מקורות ורמת ודאות. ציון שלא נמצאה לו עמדה מפורסמת מסומן כהערכה
							ומקבל ודאות נמוכה — הוא נספר, אבל לא מתחזה לידיעה.
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							ומה עושים עם מפלגה חדשה?
						</h2>
						<p className="text-[15px] m-0 mb-2">
							חלק מהמפלגות בבחירות האלה צעירות מהשאלות שהמסע שואל. לכל מקרה כלל אחר:
						</p>
						<ul className="text-[15px] m-0 pr-5 flex flex-col gap-1.5">
							<li>
								<strong>אותו גוף בשם חדש</strong> — המסלול נשמר כפי שהוא.
							</li>
							<li>
								<strong>איחוד של מפלגות קיימות</strong> — המסלול נגזר מן הרכיב בעל התיעוד הרציף
								והמשקל הגדול ביותר.
							</li>
							<li>
								<strong>מפלגה חדשה לגמרי</strong> — המסלול נגזר מהתבטאויות מתועדות של מנהיגיה
								ומהזדהותם המפלגתית והצבעותיהם בעבר. כאן הוודאות נמוכה יותר, ולעיתים קרובות מסומנת
								כהערכה.
							</li>
						</ul>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">הספינות על המפה</h2>
						<div className="flex flex-col gap-3">
							{parties.map((party) => (
								<div key={party.partyId} className="flex items-start gap-3">
									<span
										className="inline-block w-3.5 h-3.5 rounded-full shrink-0 mt-1"
										style={{ background: party.color }}
										aria-hidden="true"
									/>
									<span>
										<strong className="text-[var(--cream)] text-[15px]">{party.name}</strong>
										<span className="block text-[13px] opacity-80 mt-0.5">{party.description}</span>
									</span>
								</div>
							))}
						</div>
						<p className="text-[13px] opacity-70 mt-4 mb-0">
							המפה מציגה את המפלגות המתמודדות היום. מפלגה שהתפרקה או התאחדה אינה שטה כאן בשמה הישן,
							ורשימות שייסגרו סופית רק עם סגירת הרשימות יתווספו כשיהיה מה לומר עליהן.
						</p>
					</section>

					<div className="flex justify-center gap-3">
						<Link className="btn" to="/summary">
							חזרה למפת ההפלגה
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
