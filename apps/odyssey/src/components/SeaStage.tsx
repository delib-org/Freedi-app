import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type Phaser from 'phaser';
import { stageBus, type SceneKey } from '../lib/stageBus';
import { useMode } from '../lib/mode';

/** Player routes → stage scenes. Admin (and unknown routes) get no canvas. */
const ROUTE_SCENES: Record<string, SceneKey> = {
	'/': 'harbor',
	'/compass': 'compass',
	'/map': 'chart',
	'/voyage': 'voyage',
	'/summary': 'homecoming',
};

/**
 * The persistent Phaser canvas behind all player screens (game mode only).
 * Phaser loads via dynamic import, so direct-mode users never download it.
 * Pointer events reach the canvas only on the chart (island-tapping) route;
 * everywhere else the canvas is pure backdrop and the page scrolls freely.
 */
export default function SeaStage() {
	const mode = useMode();
	const location = useLocation();
	const scene = ROUTE_SCENES[location.pathname] ?? null;
	const active = mode === 'game' && scene !== null;
	const host = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!active || !host.current) return;
		let cancelled = false;
		let game: Phaser.Game | undefined;

		void import('../game/createStage')
			.then(({ createStage }) => {
				if (cancelled || !host.current) return;
				game = createStage(host.current);
			})
			.catch((error: unknown) => {
				console.error('[Odyssey] sea stage failed to boot:', error);
			});

		return () => {
			cancelled = true;
			game?.destroy(true);
			stageBus.detach();
		};
	}, [active]);

	useEffect(() => {
		if (active && scene) stageBus.send({ type: 'goTo', scene });
	}, [active, scene]);

	if (!active) return null;

	return (
		<div
			ref={host}
			className="sea-stage"
			style={{ pointerEvents: scene === 'chart' ? 'auto' : 'none' }}
			aria-hidden="true"
		/>
	);
}
