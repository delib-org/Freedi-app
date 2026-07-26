import { Link } from 'react-router-dom';
import GameChrome from './GameChrome';

/** Shown when no game has been seeded yet (odysseyGames/default missing). */
export default function NoGameYet() {
	return (
		<>
			<GameChrome />
			<div className="page justify-center">
				<section className="panel text-center max-w-md">
					<h2 className="text-xl font-bold text-[var(--cream)] mt-0">הים עדיין ריק</h2>
					<p className="text-[15px] opacity-85">
						המשחק עדיין לא הוקם. אם את/ה מנהל/ת — היכנסו למסך{' '}
						<Link className="underline" to="/admin">
							הניהול
						</Link>{' '}
						וצרו את המשחק.
					</p>
				</section>
			</div>
		</>
	);
}
