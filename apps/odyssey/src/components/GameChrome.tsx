import { Link } from 'react-router-dom';
import { logOut, useUser } from '../lib/user';
import { toggleMode, useMode } from '../lib/mode';
import { useGame } from '../state/GameContext';
import { isGameAdmin } from '../lib/game';

/** Fixed top bar: brand, stage indicator, direct-mode toggle, user menu. */
export default function GameChrome({ stage }: { stage?: string }) {
	const { user } = useUser();
	const mode = useMode();
	const { content, text } = useGame();
	const admin = content ? isGameAdmin(content.game, user?.uid) : false;

	return (
		<nav className="topnav" dir="rtl">
			<div className="flex items-center gap-3">
				<span aria-hidden="true" className="text-xl">
					⚓
				</span>
				<div>
					<div className="font-bold text-[15px] text-[var(--cream)]">{text('gameTitle')}</div>
					{stage ? <div className="text-[12px] opacity-75">{stage}</div> : null}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="btn-outline !py-1.5 !px-3 !text-[13px]"
					onClick={toggleMode}
				>
					{mode === 'direct' ? 'חזרה למצב הפלגה' : 'מעדיפים שאלון ישיר?'}
				</button>
				{user ? (
					<>
						{admin ? (
							<Link className="btn-outline !py-1.5 !px-3 !text-[13px]" to="/admin">
								ניהול
							</Link>
						) : null}
						<span className="text-[13px] opacity-85 hidden sm:inline">
							{user.displayName ?? user.email}
						</span>
						<button
							type="button"
							className="btn-outline !py-1.5 !px-3 !text-[13px]"
							onClick={() => void logOut()}
						>
							יציאה
						</button>
					</>
				) : null}
			</div>
		</nav>
	);
}
