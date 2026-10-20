import { Link } from 'react-router-dom';
import { useT } from '../i18n/useT';
import GameChrome from './GameChrome';

/** Shown when no game has been seeded yet (odysseyGames/default missing). */
export default function NoGameYet() {
	const { t } = useT();

	return (
		<>
			<GameChrome />
			<div className="page justify-center">
				<section className="panel text-center max-w-md">
					<h2 className="text-xl font-bold text-[var(--cream)] mt-0">{t('noGame.title')}</h2>
					<p className="text-[15px] opacity-85">
						{t('noGame.bodyA')}{' '}
						<Link className="underline" to="/admin">
							{t('noGame.adminLink')}
						</Link>{' '}
						{t('noGame.bodyB')}
					</p>
				</section>
			</div>
		</>
	);
}
