import Phaser from 'phaser';
import {
	COLOR_CYAN,
	COLOR_GOLD,
	PARTICLES_SPARKLE,
	PENNANT_COLORS,
	TWEEN_NEEDLE_MS,
	TWEEN_SWEEP_MS,
} from '../lib/stageConstants';
import type { StageCommand } from '../lib/stageBus';
import { stageState } from './stageState';
import { SeaScene } from './SeaScene';

/**
 * Compass — dawn at anchor. A hero compass rose: each answered "wind" swings
 * the needle and lights a petal; ranked values hoist signal pennants that fly
 * for the whole voyage. docs/phaser-game-design.md §2.2
 */
export class CompassScene extends SeaScene {
	private boat?: Phaser.GameObjects.Container;
	private rose?: Phaser.GameObjects.Container;
	private needle?: Phaser.GameObjects.Image;
	private petals: Phaser.GameObjects.Image[] = [];
	private pennants: Phaser.GameObjects.Image[] = [];
	private northText?: Phaser.GameObjects.Text;
	private sweepPlayed = false;

	constructor() {
		super('CompassScene');
	}

	create(): void {
		this.createSea(0.18);
		this.petals = [];
		this.pennants = [];
		this.sweepPlayed = false;
		this.boat = this.spawnBoat(this.W * 0.82, this.H * 0.8, 0.12);
		this.buildRose();
		stageState.compassLit.forEach((lit, index) => {
			if (lit) this.lightPetal(index, false);
		});
		this.syncPennants(false);
	}

	protected layout(): void {
		if (this.boat) this.moveBoat(this.boat, this.W * 0.82, this.H * 0.8);
		this.rose?.setPosition(this.roseX(), this.roseY());
	}

	private roseX(): number {
		return this.W * 0.5;
	}

	private roseY(): number {
		return this.H < this.W ? this.H * 0.42 : this.H * 0.24;
	}

	private roseRadius(): number {
		return Math.min(this.W * 0.22, 180);
	}

	private buildRose(): void {
		const radius = this.roseRadius();
		const ring = this.add.graphics();
		ring.lineStyle(3, COLOR_GOLD, 1).strokeCircle(0, 0, radius);
		ring.lineStyle(1, COLOR_GOLD, 0.5).strokeCircle(0, 0, radius * 0.72);

		const children: Phaser.GameObjects.GameObject[] = [ring];

		// 4 petals, one per wind, dim until earned; at N/E/S/W bearings.
		for (let i = 0; i < 4; i++) {
			const angle = (i * Math.PI) / 2;
			const petal = this.add
				.image(Math.sin(angle) * radius * 0.5, -Math.cos(angle) * radius * 0.5, 'petal')
				.setRotation(angle)
				.setTint(COLOR_CYAN)
				.setAlpha(0.25)
				.setScale(radius / 220);
			this.petals.push(petal);
			children.push(petal);
		}

		this.needle = this.add
			.image(0, 0, 'needle')
			.setScale(radius / 140)
			.setOrigin(0.5);
		children.push(this.needle);

		this.rose = this.add.container(this.roseX(), this.roseY(), children).setDepth(50);
	}

	onCommand(command: StageCommand): void {
		switch (command.type) {
			case 'compassWind':
				if (command.lit) this.lightPetal(command.index, true);
				else this.dimPetal(command.index);
				break;
			case 'setPennants':
				this.syncPennants(true);
				break;
			case 'compassComplete':
				this.playSweep();
				break;
			default:
				break;
		}
	}

	private lightPetal(index: number, animate: boolean): void {
		const petal = this.petals[index];
		if (!petal || !this.rose) return;
		petal.setTint(COLOR_GOLD);
		if (!animate || this.reducedMotion) {
			petal.setAlpha(1);

			return;
		}
		petal.setAlpha(0.4);
		this.tweens.add({ targets: petal, alpha: 1, duration: 300 });
		if (this.needle) {
			this.tweens.add({
				targets: this.needle,
				rotation: (index * Math.PI) / 2,
				duration: TWEEN_NEEDLE_MS,
				ease: 'Back.out',
			});
		}
		this.burst(
			this.rose.x + petal.x,
			this.rose.y + petal.y,
			'spark',
			PARTICLES_SPARKLE,
			COLOR_GOLD,
		);
	}

	/** Un-answering just dims — a calm fade, never a "loss" animation. */
	private dimPetal(index: number): void {
		const petal = this.petals[index];
		if (!petal) return;
		petal.setTint(COLOR_CYAN);
		this.tweens.add({ targets: petal, alpha: 0.25, duration: 300 });
	}

	/** Value pennants hoist on a halyard from the rose toward the boat. */
	private syncPennants(animate: boolean): void {
		const target = Math.min(stageState.pennants, PENNANT_COLORS.length);
		while (this.pennants.length > target) {
			const removed = this.pennants.pop();
			if (!removed) break;
			this.tweens.add({
				targets: removed,
				y: removed.y + 40,
				alpha: 0,
				duration: 250,
				onComplete: () => removed.destroy(),
			});
		}
		for (let i = this.pennants.length; i < target; i++) {
			const x = this.roseX() + this.roseRadius() + 30 + i * 34;
			const y = this.H * 0.3 + i * 10;
			const pennant = this.add
				.image(x, y - (animate && !this.reducedMotion ? 40 : 0), 'pennant')
				.setTint(PENNANT_COLORS[i])
				.setDepth(60);
			this.pennants.push(pennant);
			if (animate && !this.reducedMotion) {
				this.tweens.add({ targets: pennant, y, duration: 350, ease: 'Bounce.out' });
			}
		}
	}

	/** All four winds answered: one full sweep, settle north, "הצפון שלך". */
	private playSweep(): void {
		if (this.sweepPlayed || !this.needle || !this.rose) return;
		this.sweepPlayed = true;
		if (this.reducedMotion) {
			this.needle.setRotation(0);

			return;
		}
		this.tweens.add({
			targets: this.needle,
			rotation: this.needle.rotation + Math.PI * 2,
			duration: TWEEN_SWEEP_MS,
			ease: 'Cubic.inOut',
			onComplete: () => this.needle?.setRotation(0),
		});
		this.northText = this.hebrewLabel(
			this.rose.x,
			this.rose.y + this.roseRadius() + 28,
			'הצפון שלך',
			16,
			'#e8b958',
		)
			.setAlpha(0)
			.setDepth(60);
		this.tweens.add({ targets: this.northText, alpha: 1, duration: 600, delay: TWEEN_SWEEP_MS });
		this.setDayPhase(0.3, true);
	}
}
