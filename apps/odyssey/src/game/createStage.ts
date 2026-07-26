import Phaser from 'phaser';
import { stageBus, type StageCommand } from '../lib/stageBus';
import { TWEEN_FADE_MS } from '../lib/stageConstants';
import { applyToStageState, stageState } from './stageState';
import { SCENE_KEY_MAP } from './sceneKeys';
import { SeaScene } from './SeaScene';
import { BootScene } from './BootScene';
import { HarborScene } from './HarborScene';
import { CompassScene } from './CompassScene';
import { ChartScene } from './ChartScene';
import { VoyageScene } from './VoyageScene';
import { HomecomingScene } from './HomecomingScene';

/**
 * Boots the single persistent Phaser game (docs/phaser-game-design.md §6):
 * one canvas for all five player scenes, full-bleed RESIZE scaling, command
 * routing from the stage bus, crossfade scene handoffs, pause when hidden.
 * This module is only ever loaded via dynamic import — direct-mode users
 * never download Phaser.
 */
export function createStage(parent: HTMLElement): Phaser.Game {
	const game = new Phaser.Game({
		type: Phaser.AUTO,
		parent,
		backgroundColor: '#071a2a',
		scale: {
			mode: Phaser.Scale.RESIZE,
			autoCenter: Phaser.Scale.CENTER_BOTH,
			width: parent.clientWidth || window.innerWidth,
			height: parent.clientHeight || window.innerHeight,
		},
		render: { antialias: true },
		scene: [BootScene, HarborScene, CompassScene, ChartScene, VoyageScene, HomecomingScene],
	});

	const activeSeaScene = (): SeaScene | null => {
		for (const scene of game.scene.getScenes(true)) {
			if (scene instanceof SeaScene) return scene;
		}

		return null;
	};

	const handleCommand = (command: StageCommand): void => {
		const previousScene = stageState.scene;
		applyToStageState(command);

		if (command.type === 'goTo') {
			if (command.scene === previousScene) return;
			const current = activeSeaScene();
			const targetKey = SCENE_KEY_MAP[command.scene];
			if (!current) return; // BootScene will start the right scene itself
			const camera = current.cameras.main;
			camera.fadeOut(TWEEN_FADE_MS, 4, 18, 34);
			camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
				current.scene.start(targetKey);
			});

			return;
		}

		activeSeaScene()?.onCommand(command);
	};

	stageBus.attach(handleCommand);

	const onVisibility = (): void => {
		if (document.hidden) game.loop.sleep();
		else game.loop.wake();
	};
	document.addEventListener('visibilitychange', onVisibility);

	game.events.once(Phaser.Core.Events.DESTROY, () => {
		document.removeEventListener('visibilitychange', onVisibility);
		stageBus.detach();
	});

	return game;
}
