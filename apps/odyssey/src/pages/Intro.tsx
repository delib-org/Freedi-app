import { useState } from 'react';
import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import { signInAnonymous, signInWithGoogle, useUser } from '../lib/user';
import { useGame } from '../state/GameContext';

/**
 * The door.
 *
 * It used to be one Google button with nothing beside it. On a pre-election
 * political questionnaire that reads as: give us your name, then answer where
 * you stand, and we will not say which of those we keep. The two things added
 * here are the two things a person needs before deciding — what the account is
 * for, and a way in without one.
 */
export default function Intro() {
	const { user, loading } = useUser();
	const { text } = useGame();
	const [boarding, setBoarding] = useState(false);

	async function board(method: 'google' | 'anonymous'): Promise<void> {
		setBoarding(true);
		try {
			await (method === 'google' ? signInWithGoogle() : signInAnonymous());
		} catch (error) {
			console.error('[Odyssey] Sign-in failed:', error);
		} finally {
			setBoarding(false);
		}
	}

	return (
		<>
			<GameChrome stage="הקדמה" />
			<div className="page justify-center">
				<section className="panel fade-in w-full max-w-2xl text-center flex flex-col items-center gap-4 !py-10">
					<p className="eyebrow">{text('introMotto')}</p>
					<h1 className="text-4xl font-bold text-[var(--cream)] m-0">{text('gameTitle')}</h1>
					<p className="text-lg text-[#cfe6f5] m-0">{text('gameSubtitle')}</p>

					<p className="max-w-xl leading-relaxed text-[15px] text-[#e8f3fb] m-0">
						{text('introWelcome')} {text('introBody')}
					</p>

					<div className="text-[var(--gold-strong)] text-lg leading-relaxed">
						<div>{text('introLine1')}</div>
						<div>{text('introLine2')}</div>
					</div>

					{loading ? null : user ? (
						<>
							<Link className="btn mt-2" to="/compass">
								⚓ {text('startButton')}
							</Link>
							<p className="text-[13px] opacity-75 m-0">
								{/* An anonymous sailor has neither name nor email — the line read
								    "מחוברים כ־" and then stopped. */}
								{user.isAnonymous
									? 'מפליגים ללא חשבון — המסע נשמר בדפדפן הזה'
									: `מחוברים כ־${user.displayName ?? user.email}`}
							</p>
						</>
					) : (
						<div className="flex flex-col items-center gap-3 mt-2 w-full max-w-md">
							<button
								type="button"
								className="btn"
								disabled={boarding}
								onClick={() => void board('google')}
							>
								התחברות עם Google כדי להפליג
							</button>
							<p className="text-[13px] opacity-80 m-0 text-center">
								החשבון שומר את המסע שלכם ומאפשר לחזור אליו ממכשיר אחר.
							</p>

							<div className="flex items-center gap-3 w-full opacity-40" aria-hidden="true">
								<span className="h-px flex-1 bg-[var(--cream)]" />
								<span className="text-[13px]">או</span>
								<span className="h-px flex-1 bg-[var(--cream)]" />
							</div>

							<button
								type="button"
								className="btn-outline"
								disabled={boarding}
								onClick={() => void board('anonymous')}
							>
								כניסה ללא חשבון
							</button>
							<p className="text-[13px] opacity-80 m-0 text-center">
								לא נדע מי אתם. המסע נשמר רק בדפדפן הזה — ניקוי היסטוריה או מכשיר אחר מתחילים מחדש.
							</p>

							<p className="text-[13px] opacity-85 m-0 text-center mt-1">
								תשובות המצפן ויומן הקברניט פרטיים לכם. העמדות שתסמנו נראות למפליגים אחרים לצד השם
								הפרטי בלבד — לעולם לא המייל.{' '}
								<Link className="underline" to="/privacy">
									מה נשמר ומי רואה מה
								</Link>
							</p>
						</div>
					)}
				</section>
			</div>
		</>
	);
}
