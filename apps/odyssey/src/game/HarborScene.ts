import Phaser from 'phaser';
import { COLOR_CYAN, GULL_COUNT, STAR_COUNT, STAR_COUNT_SMALL } from '../lib/stageConstants';
import { SeaScene } from './SeaScene';

/**
 * Intro — pre-dawn harbor. Still water, twinkling stars, moored boat with
 * anchor line, lantern flicker, drifting gulls. Pure ambience; the DOM panel
 * carries the content. docs/phaser-game-design.md §2.1
 */
export class HarborScene extends SeaScene {
	private boat?: Phaser.GameObjects.Container;
	private anchorLine?: Phaser.GameObjects.Line;
	private anchor?: Phaser.GameObjects.Text;
	private lantern?: Phaser.GameObjects.Image;
	private stars: Phaser.GameObjects.Image[] = [];
	private gulls: Phaser.GameObjects.Image[] = [];

	constructor() {
		super('HarborScene');
	}

	create(): void {
		this.createSea(0.05);
		this.stars = [];
		this.gulls = [];
		this.buildStars();
		this.buildHarbor();
		this.buildGulls();
	}

	protected layout(): void {
		this.boat?.setPosition(this.W * 0.68, this.H * 0.78);
		this.anchor?.setPosition(this.W * 0.68 - 40, this.H * 0.88);
		this.anchorLine?.setTo(this.W * 0.68 - 20, this.H * 0.8, this.W * 0.68 - 40, this.H * 0.88);
		this.lantern?.setPosition(this.W * 0.68, this.H * 0.78 - 70);
	}

	private buildStars(): void {
		if (this.reducedMotion) return;
		const small = this.W < 480 && window.devicePixelRatio > 2;
		const count = small ? STAR_COUNT_SMALL : STAR_COUNT;
		for (let i = 0; i < count; i++) {
			const star = this.add
				.image(Math.random() * this.W, Math.random() * this.H * 0.45, 'dot')
				.setScale(0.3)
				.setAlpha(0.3)
				.setDepth(-15);
			this.stars.push(star);
			this.tweens.add({
				targets: star,
				alpha: 0.9,
				duration: 1400 + Math.random() * 1600,
				delay: Math.random() * 1200,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.inOut',
			});
		}
	}

	private buildHarbor(): void {
		this.boat = this.spawnBoat(this.W * 0.68, this.H * 0.78, 0.16);

		this.anchorLine = this.add
			.line(0, 0, this.W * 0.68 - 20, this.H * 0.8, this.W * 0.68 - 40, this.H * 0.88, COLOR_CYAN)
			.setOrigin(0, 0)
			.setAlpha(0.5)
			.setLineWidth(1.5)
			.setDepth(90);
		this.anchor = this.glyph(this.W * 0.68 - 40, this.H * 0.88, '⚓', 20).setDepth(95);

		this.lantern = this.add
			.image(this.W * 0.68, this.H * 0.78 - 70, 'glow')
			.setScale(1.4)
			.setDepth(99);
		if (!this.reducedMotion) {
			this.tweens.add({
				targets: this.lantern,
				alpha: { from: 1, to: 0.75 },
				duration: 900,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.inOut',
			});
		}
	}

	private buildGulls(): void {
		if (this.reducedMotion) return;
		for (let i = 0; i < GULL_COUNT; i++) {
			const gull = this.add
				.image(this.W + 30 + i * 160, this.H * (0.12 + i * 0.08), 'gull0')
				.setDepth(-10);
			this.gulls.push(gull);
			this.tweens.add({
				targets: gull,
				x: -40,
				duration: ((this.W + 80) / 18) * 1000,
				delay: i * 2600,
				repeat: -1,
				onRepeat: () => gull.setX(this.W + 30),
			});
			this.time.addEvent({
				delay: 260,
				loop: true,
				callback: () => {
					if (gull.active) {
						gull.setTexture(gull.texture.key === 'gull0' ? 'gull1' : 'gull0');
					}
				},
			});
		}
	}
}
