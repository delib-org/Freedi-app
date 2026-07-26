import Phaser from 'phaser';
import { stageState } from './stageState';
import { SCENE_KEY_MAP } from './sceneKeys';

/**
 * Loads the two real assets and generates every other texture in code
 * (docs/phaser-game-design.md §5 — zero new art), then starts the scene
 * matching the current route (deep-link friendly).
 */
export class BootScene extends Phaser.Scene {
	constructor() {
		super('boot');
	}

	preload(): void {
		this.load.image('ocean', '/assets/mediterranean-ocean.png');
		this.load.image('ship', '/assets/ship.png');
	}

	create(): void {
		this.generateTextures();
		this.scene.start(SCENE_KEY_MAP[stageState.scene]);
	}

	private generateTextures(): void {
		const g = this.add.graphics();

		// dot — soft round particle (splash, wake, buoy body, stars)
		g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
		g.generateTexture('dot', 8, 8);
		g.clear();

		// spark — 4-point star
		g.fillStyle(0xffffff, 1);
		g.fillTriangle(4, 0, 5.5, 2.5, 2.5, 2.5);
		g.fillTriangle(4, 8, 5.5, 5.5, 2.5, 5.5);
		g.fillTriangle(0, 4, 2.5, 2.5, 2.5, 5.5);
		g.fillTriangle(8, 4, 5.5, 2.5, 5.5, 5.5);
		g.fillRect(2.5, 2.5, 3, 3);
		g.generateTexture('spark', 8, 8);
		g.clear();

		// pennant — small triangle flag (tinted per rank)
		g.fillStyle(0xffffff, 1).fillTriangle(0, 0, 26, 8, 0, 16);
		g.generateTexture('pennant', 26, 16);
		g.clear();

		// flag — small rectangle (arrival celebration, tinted cream)
		g.fillStyle(0xffffff, 1).fillRect(0, 0, 18, 12);
		g.generateTexture('flag', 18, 12);
		g.clear();

		// ring — stroked circle (log stamp, ripple)
		g.lineStyle(3, 0xffffff, 1).strokeCircle(24, 24, 21);
		g.generateTexture('ring', 48, 48);
		g.clear();

		// island disc + rim (rim tinted cyan/gold for selection)
		g.fillStyle(0x0a2a48, 1).fillCircle(32, 32, 30);
		g.generateTexture('disc', 64, 64);
		g.clear();
		g.lineStyle(3, 0xffffff, 1).strokeCircle(32, 32, 30);
		g.generateTexture('discRim', 64, 64);
		g.clear();

		// petal — elongated diamond (compass rose winds)
		g.fillStyle(0xffffff, 1).fillTriangle(9, 0, 18, 30, 9, 40);
		g.fillTriangle(9, 0, 0, 30, 9, 40);
		g.generateTexture('petal', 18, 40);
		g.clear();

		// needle — gold north half, cream south half
		g.fillStyle(0xe8b958, 1).fillTriangle(6, 0, 12, 60, 0, 60);
		g.fillStyle(0xfff4d3, 1).fillTriangle(0, 60, 12, 60, 6, 120);
		g.generateTexture('needle', 12, 120);
		g.clear();

		// jetty — three planks + post (stance shore marker)
		g.fillStyle(0xffffff, 1);
		g.fillRect(0, 0, 24, 3);
		g.fillRect(2, 6, 20, 3);
		g.fillRect(4, 12, 16, 3);
		g.fillRect(10, 0, 4, 18);
		g.generateTexture('jetty', 24, 18);
		g.clear();

		// sail — small white triangle (fellow sailors, unfurl beat)
		g.fillStyle(0xffffff, 1).fillTriangle(0, 16, 12, 16, 12, 0);
		g.generateTexture('sail', 12, 16);
		g.clear();

		// gull — two wing frames (∨ / ∧)
		g.lineStyle(2, 0xffffff, 0.85);
		g.beginPath();
		g.moveTo(0, 2);
		g.lineTo(12, 8);
		g.lineTo(24, 2);
		g.strokePath();
		g.generateTexture('gull0', 24, 10);
		g.clear();
		g.lineStyle(2, 0xffffff, 0.85);
		g.beginPath();
		g.moveTo(0, 8);
		g.lineTo(12, 2);
		g.lineTo(24, 8);
		g.strokePath();
		g.generateTexture('gull1', 24, 10);
		g.clear();

		// lighthouse — tapered tower + gallery (the Agora gate)
		g.fillStyle(0xfff4d3, 1).fillTriangle(10, 0, 34, 0, 44, 78);
		g.fillTriangle(10, 0, 0, 78, 44, 78);
		g.fillStyle(0x06192c, 1).fillRect(0, 26, 44, 10);
		g.fillRect(0, 52, 44, 10);
		g.fillStyle(0xe8b958, 1).fillRect(12, 0, 20, 12);
		g.generateTexture('lighthouse', 44, 90);
		g.clear();

		g.destroy();

		// glow — radial gradient needs a canvas texture
		if (!this.textures.exists('glow')) {
			const canvas = this.textures.createCanvas('glow', 64, 64);
			if (canvas) {
				const ctx = canvas.context;
				const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
				gradient.addColorStop(0, 'rgba(255, 217, 160, 0.95)');
				gradient.addColorStop(0.5, 'rgba(255, 217, 160, 0.35)');
				gradient.addColorStop(1, 'rgba(255, 217, 160, 0)');
				ctx.fillStyle = gradient;
				ctx.fillRect(0, 0, 64, 64);
				canvas.refresh();
			}
		}
	}
}
