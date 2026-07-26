import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import { signInWithGoogle, useUser } from '../lib/user';
import { useGame } from '../state/GameContext';

export default function Intro() {
	const { user, loading } = useUser();
	const { text } = useGame();

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
								מחוברים כ־{user.displayName ?? user.email}
							</p>
						</>
					) : (
						<button type="button" className="btn mt-2" onClick={() => void signInWithGoogle()}>
							התחברות עם Google כדי להפליג
						</button>
					)}
				</section>
			</div>
		</>
	);
}
