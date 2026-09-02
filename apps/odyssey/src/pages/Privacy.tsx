import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import { useGame } from '../state/GameContext';

/**
 * What we know about you, and who can see it.
 *
 * A political questionnaire that asks for a Google account and says nothing
 * about what happens next is a questionnaire people close. Every claim on this
 * page is a claim about code in this repository — the journey rules in
 * firestore.rules, `voyageIdentity()` in lib/evaluations.ts, the first-name
 * split in lib/distance.ts — so if one of them stops being true, this page has
 * to change with it.
 */
export default function Privacy() {
	const { text } = useGame();
	const contact = text('privacyContact');
	const controller = text('privacyController');

	return (
		<>
			<GameChrome stage="פרטיות" />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4 pb-8">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">הפרטיות שלך במסע</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">
							שאלון פוליטי הוא דבר אישי. זה מה שנשמר, מי רואה מה, ומה אפשר למחוק.
						</p>
					</header>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">למה צריך להתחבר</h2>
						<p className="text-[15px] m-0 mb-2">
							ההתחברות עושה שלושה דברים: היא שומרת את המסע שלך כך שאפשר לחזור אליו ממכשיר אחר, היא
							מונעת מאותו אדם למלא את השאלון פעמים רבות — מה שהופך את הממצאים לחסרי ערך — והיא
							מעבירה את העמדות שלך לאגורה, כדי שלא תגיעו לדיון כזרים בלי דעה.
						</p>
						<p className="text-[15px] m-0">
							אפשר גם להיכנס ללא חשבון. אז לא נדע מי אתם כלל, אבל המסע נשמר רק בדפדפן הזה: ניקוי
							היסטוריה, חלון פרטי או מכשיר אחר — והמסע מתחיל מחדש.
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">מה נשמר</h2>
						<ul className="text-[15px] m-0 pr-5 flex flex-col gap-1.5">
							<li>העמדות שסימנתם על כל חוף — תומכ/ת, יכול/ה לחיות עם זה, מתנגד/ת.</li>
							<li>תשובות המצפן, דירוג הערכים ויומן הקברניט שכתבתם.</li>
							<li>האיים שבחרתם, ומתי נכנסתם לדיון באגורה.</li>
							<li>מזהה משתמש, והשם הפרטי בלבד. אם התחברתם עם Google — גם כתובת המייל.</li>
						</ul>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">מי רואה מה</h2>
						<p className="text-[15px] m-0 mb-2">
							<strong className="text-[var(--gold-strong)]">פרטי לחלוטין:</strong> תשובות המצפן,
							דירוג הערכים ויומן הקברניט. הם נשמרים במסמך המסע שלכם, ורק אתם יכולים לקרוא אותו.
						</p>
						<p className="text-[15px] m-0 mb-2">
							<strong className="text-[var(--gold-strong)]">נראה למפליגים אחרים:</strong> העמדות
							שסימנתם על החופים, לצד <strong>השם הפרטי בלבד</strong>. כך נבנות רשימת ״מפליגים לצידך״
							ומפת ים הדעות — הן מודדות מרחק בין תשובות, ולשם כך צריך לקרוא את התשובות.
						</p>
						<p className="text-[15px] m-0">
							<strong className="text-[var(--gold-strong)]">לא נחשף לאיש:</strong> כתובת המייל
							ותמונת הפרופיל. הן אינן נשמרות על התשובות ואינן מוצגות בשום מסך.
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">למה זה משמש</h2>
						<p className="text-[15px] m-0">
							המסע הוא כלי אזרחי ומחקרי. התשובות משמשות להצגת המפה האישית שלכם, לדיון באגורה, ולמחקר
							על שיח ציבורי — במצטבר. אין מכירה של המידע, אין העברה למפרסמים, ואין שימוש בו כדי
							לפנות אליכם בתעמולה.
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">מה בידיים שלכם</h2>
						<p className="text-[15px] m-0">
							אפשר לשנות כל עמדה בכל רגע — חוזרים לאי ומסמנים מחדש. אפשר לבקש לקבל את כל המידע שנשמר
							עליכם, ואפשר לבקש למחוק אותו; במקרה כזה נמחק גם את התשובות מן המאגר המחקרי.
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">אחריות ופנייה</h2>
						{controller ? <p className="text-[15px] m-0 mb-2">{controller}</p> : null}
						<p className="text-[15px] m-0">
							{contact ? (
								<>
									לשאלות בנושא המידע, בקשת עותק או בקשת מחיקה:{' '}
									<a className="underline" href={`mailto:${contact}`}>
										{contact}
									</a>
								</>
							) : (
								'לשאלות בנושא המידע, בקשת עותק או בקשת מחיקה — פנו למפעילי המשחק.'
							)}
						</p>
					</section>

					<div className="flex justify-center">
						<Link className="btn" to="/">
							חזרה לפתח המסע
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
