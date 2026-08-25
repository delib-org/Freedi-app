import { useState } from 'react';
import { Link } from 'react-router-dom';
import { logOut, useUser } from '../lib/user';
import { toggleMode, useMode } from '../lib/mode';
import { useGame } from '../state/GameContext';
import { isGameAdmin } from '../lib/game';
import DigestSettings from './DigestSettings';

/** Fixed top bar: brand, stage indicator, direct-mode toggle, user menu. */
export default function GameChrome({ stage }: { stage?: string }) {
	const { user } = useUser();
	const mode = useMode();
	const { content, text } = useGame();
	const admin = content ? isGameAdmin(content.game, user?.uid) : false;
	// The email-digest opt-in lives here, on every screen — buried at the foot
	// of the Summary page nobody scrolled to, it may as well not have existed.
	const [digestOpen, setDigestOpen] = useState(false);

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
						<button
							type="button"
							className="btn-outline !py-1.5 !px-3 !text-[13px]"
							onClick={() => setDigestOpen(true)}
							aria-haspopup="dialog"
							title="סיפור המסע שלכם למייל"
						>
							📬 <span className="hidden sm:inline">מייל</span>
						</button>
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
			{user && digestOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
					dir="rtl"
					role="dialog"
					aria-modal="true"
					aria-label="סיפור המסע שלכם למייל"
					onClick={(event) => {
						if (event.target === event.currentTarget) setDigestOpen(false);
					}}
				>
					<div className="w-full max-w-md">
						<DigestSettings uid={user.uid} onClose={() => setDigestOpen(false)} />
					</div>
				</div>
			) : null}
		</nav>
	);
}
