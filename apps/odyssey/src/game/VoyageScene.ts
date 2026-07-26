import Phaser from 'phaser';
import {
	ATTITUDE_GLYPHS,
	COLOR_CREAM,
	COLOR_CYAN,
	COLOR_GOLD,
	PARTICLES_SPLASH,
	TWEEN_ISLAND_MS,
	TWEEN_SHIP_MS,
	TWEEN_STAMP_MS,
} from '../lib/stageConstants';
import { dayPhaseForIsland, shipLayout } from '../lib/seaLayout';
import type { StageCommand } from '../lib/stageBus';
import { stageState } from './stageState';
import { SeaScene, type PartyShip } from './SeaScene';

/**
 * Voyage — the core loop. One island vignette at a time with jetty shore
 * markers; marking an attitude plants a buoy (equal juice for all three
 * attitudes — hard rule §8.1). Party ships are visible throughout but move
 * ONLY during the reaction phase, never while the player is choosing.
 * docs/phaser-game-design.md §2.4
 */
export class VoyageScene extends SeaScene {
	private boat?: Phaser.GameObjects.Container;
	private vignette?: Phaser.GameObjects.Container;
	private buoys = new Map<number, Phaser.GameObjects.Container>();
	private ships: PartyShip[] = [];
	private stamps: Phaser.GameObjects.Container[] = [];
	private currentIslandId: string | null = null;

	constructor() {
		super('VoyageScene');
	}

	create(): void {
		this.createSea(dayPhaseForIsland(stageState.voyage?.index ?? 0, stageState.voyage?.count ?? 1));
		this.buoys = new Map();
		this.ships = [];
		this.stamps = [];
		this.currentIslandId = null;
		this.boat = this.spawnBoat(this.W * 0.72, this.H * 0.74, 0.14);
		this.buildShips();
		if (stageState.voyage) this.showIsland(false);
		for (const [stanceIndex, attitude] of Object.entries(stageState.voyageAttitudes)) {
			this.placeBuoy(Number(stanceIndex), attitude, false);
		}
		for (let i = 0; i < stageState.stampedIslandIds.length; i++) this.addStamp(i, false);
	}

	protected layout(): void {
		this.boat?.setPosition(this.W * 0.72, this.H * 0.74);
		this.vignette?.setPosition(this.W * 0.3, this.H * 0.3);
		this.applyShipLayout(false);
		this.stamps.forEach((stamp, index) => stamp.setPosition(this.stampX(index), this.H - 30));
	}

	onCommand(command: StageCommand): void {
		switch (command.type) {
			case 'voyageIsland':
				this.showIsland(true);
				this.setDayPhase(dayPhaseForIsland(command.island.index, command.island.count), true);
				break;
			case 'attitudeMarked':
				this.placeBuoy(command.stanceIndex, command.attitude, true);
				break;
			case 'islandCompleted':
				this.playStampBeat();
				break;
			case 'setParties':
				this.buildShips();
				break;
			case 'updateDistances':
				this.applyShipLayout(command.animate && !this.reducedMotion);
				break;
			default:
				break;
		}
	}

	// ---------- island vignette ----------

	private showIsland(animate: boolean): void {
		const info = stageState.voyage;
		if (!info || info.islandId === this.currentIslandId) return;
		const previous = this.vignette;
		this.currentIslandId = info.islandId;

		if (previous) {
			// current island slides off to the right; the sea sails on
			this.tweens.add({
				targets: previous,
				x: this.W + 220,
				alpha: 0.4,
				duration: animate && !this.reducedMotion ? 700 : 0,
				ease: 'Sine.in',
				onComplete: () => previous.destroy(),
			});
		}
		this.buoys.forEach((buoy) => buoy.destroy());
		this.buoys.clear();

		const children: Phaser.GameObjects.GameObject[] = [];
		const art = this.islandArtImage(info.imageUrl, 250);
		let titleY = 92;
		if (art) {
			titleY = art.displayHeight / 2 + 22;
			children.push(art);
		} else {
			children.push(
				this.add.image(0, 0, 'disc').setScale(2.2),
				this.add.image(0, 0, 'discRim').setTint(COLOR_GOLD).setScale(2.2),
			);
			// illustration still downloading → rebuild the vignette once ready
			this.ensureIslandTextures([info.imageUrl], () => this.rebuildVignette());
		}
		const title = this.add
			.text(0, titleY, info.title, {
				fontFamily: 'Arial',
				fontSize: '16px',
				color: '#fff4d3',
				fontStyle: 'bold',
				backgroundColor: 'rgba(6,26,48,0.88)',
				padding: { x: 10, y: 4 },
			})
			.setOrigin(0.5);
		children.push(title);

		// shore jetties on the lower arc, one per stance, 32° apart
		for (let i = 0; i < info.stanceCount; i++) {
			const angle = this.jettyAngle(i, info.stanceCount);
			const jetty = this.add
				.image(Math.cos(angle) * 78, Math.sin(angle) * 78, 'jetty')
				.setTint(COLOR_CREAM)
				.setAlpha(0.9);
			children.push(jetty);
		}

		this.vignette = this.add.container(this.W * 0.3, this.H * 0.3, children).setDepth(60);
		if (animate && !this.reducedMotion) {
			// next island approaches from the left, growing
			this.vignette.setX(-this.W * 0.2).setScale(0.4);
			this.tweens.add({
				targets: this.vignette,
				x: this.W * 0.3,
				scale: 1,
				duration: TWEEN_ISLAND_MS,
				ease: 'Sine.out',
			});
		}
	}

	/** Re-show the current island (e.g. after its art finished loading),
	 *  restoring the buoys already planted there. */
	private rebuildVignette(): void {
		this.currentIslandId = null;
		this.showIsland(false);
		for (const [stanceIndex, attitude] of Object.entries(stageState.voyageAttitudes)) {
			this.placeBuoy(Number(stanceIndex), attitude, false);
		}
	}

	private jettyAngle(index: number, count: number): number {
		const spread = ((count - 1) * 32 * Math.PI) / 180;

		return Math.PI / 2 - spread / 2 + ((32 * Math.PI) / 180) * index;
	}

	// ---------- the core moment: marking an attitude ----------

	/**
	 * EQUAL-JUICE RULE (§8.1): pop scale, durations, particle count and colors
	 * are byte-identical for all three attitudes. Only the neutral nautical
	 * glyph differs, and all three glyphs render in the same cream.
	 */
	private placeBuoy(
		stanceIndex: number,
		attitude: keyof typeof ATTITUDE_GLYPHS,
		animate: boolean,
	): void {
		if (!this.vignette) return;
		const angle = this.jettyAngle(stanceIndex, stageState.voyage?.stanceCount ?? 1);
		const x = this.vignette.x + Math.cos(angle) * 104;
		const y = this.vignette.y + Math.sin(angle) * 104;

		const existing = this.buoys.get(stanceIndex);
		if (existing) {
			const glyphText = existing.getAt(2);
			if (glyphText instanceof Phaser.GameObjects.Text) {
				if (animate && !this.reducedMotion) {
					this.tweens.add({
						targets: glyphText,
						alpha: 0,
						duration: 75,
						yoyo: true,
						onYoyo: () => glyphText.setText(ATTITUDE_GLYPHS[attitude]),
					});
				} else {
					glyphText.setText(ATTITUDE_GLYPHS[attitude]);
				}
			}

			return;
		}

		const body = this.add.image(0, 6, 'dot').setScale(1.4).setTint(COLOR_CYAN);
		const pole = this.add.rectangle(0, -4, 2, 16, COLOR_CREAM);
		const glyphText = this.glyph(0, -16, ATTITUDE_GLYPHS[attitude], 14);
		const buoy = this.add.container(x, y, [body, pole, glyphText]).setDepth(70);
		this.buoys.set(stanceIndex, buoy);

		if (animate && !this.reducedMotion) {
			buoy.setScale(0);
			this.tweens.add({
				targets: buoy,
				scale: { from: 0, to: 1 },
				duration: 200,
				ease: 'Back.out',
			});
			this.burst(x, y + 6, 'dot', PARTICLES_SPLASH, 0xbfe6ff, {
				speed: [30, 70],
				life: 350,
				gravity: 60,
			});
		}
	}

	// ---------- completing an island ----------

	private playStampBeat(): void {
		const index = Math.max(0, stageState.stampedIslandIds.length - 1);
		if (this.reducedMotion) {
			this.addStamp(index, false);

			return;
		}
		const ring = this.add.image(0, 0, 'ring').setTint(COLOR_GOLD).setScale(1.6);
		const anchor = this.glyph(0, 0, '⚓', 22);
		const stamp = this.add
			.container(this.W / 2, this.H / 2, [ring, anchor])
			.setDepth(600)
			.setScale(1.4)
			.setAngle(-5);
		this.tweens.add({
			targets: stamp,
			scale: 1,
			angle: 0,
			duration: TWEEN_STAMP_MS,
			ease: 'Cubic.in',
			onComplete: () => {
				// a 4px camera "swell" — a dip, not a shake (§8: shake is banned)
				const camera = this.cameras.main;
				this.tweens.add({
					targets: camera,
					scrollY: camera.scrollY + 4,
					duration: 120,
					yoyo: true,
				});
				this.tweens.add({
					targets: stamp,
					x: this.stampX(index),
					y: this.H - 30,
					scale: 0.45,
					duration: 400,
					ease: 'Sine.inOut',
					onComplete: () => {
						stamp.destroy();
						this.addStamp(index, false);
					},
				});
			},
		});
	}

	/** The voyage-log strip: equal stamps, bottom corner, max 12. */
	private addStamp(index: number, animate: boolean): void {
		if (index >= 12 || this.stamps.length > index) return;
		const ring = this.add.image(0, 0, 'ring').setTint(COLOR_GOLD).setScale(0.45);
		const anchor = this.glyph(0, 0, '⚓', 10);
		const stamp = this.add
			.container(this.stampX(index), this.H - 30, [ring, anchor])
			.setDepth(90)
			.setAlpha(animate ? 0 : 0.9);
		if (animate) this.tweens.add({ targets: stamp, alpha: 0.9, duration: 300 });
		this.stamps.push(stamp);
	}

	private stampX(index: number): number {
		return 30 + index * 30;
	}

	// ---------- party ships ----------

	private buildShips(): void {
		for (const ship of this.ships) ship.container.destroy();
		this.ships = stageState.parties.map((party) => this.spawnPartyShip(party, 0.1));
		this.applyShipLayout(false);
	}

	/** Ships move ONLY here — i.e. when React sends distances (reaction phase). */
	private applyShipLayout(animate: boolean): void {
		const count = this.ships.length || 1;
		this.ships.forEach((ship, index) => {
			const placement = shipLayout(
				stageState.distances[ship.party.id],
				index,
				count,
				this.W,
				this.H,
			);
			ship.container.setDepth(Math.round(placement.y));
			if (animate) {
				this.tweens.add({
					targets: ship.container,
					x: placement.x,
					y: placement.y,
					alpha: placement.alpha,
					duration: TWEEN_SHIP_MS,
					ease: 'Sine.inOut',
				});
				this.tweens.add({
					targets: ship.image,
					scale: placement.scale,
					duration: TWEEN_SHIP_MS,
					ease: 'Sine.inOut',
				});
			} else {
				ship.container.setPosition(placement.x, placement.y).setAlpha(placement.alpha);
				ship.image.setScale(placement.scale);
			}
		});
	}
}
