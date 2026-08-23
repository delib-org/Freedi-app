import Phaser from 'phaser';
import {
	ATTITUDE_GLYPHS,
	COLOR_CREAM,
	COLOR_CYAN,
	COLOR_GOLD,
	BOAT_SCALE,
	BOAT_SCALE_NARROW,
	NARROW_STAGE_WIDTH,
	PARTICLES_SPLASH,
	TWEEN_ISLAND_MS,
	TWEEN_SHIP_MS,
	TWEEN_STAMP_MS,
} from '../lib/stageConstants';
import { dayPhaseForIsland, partyShipPlacement, rangeRings, seaFan } from '../lib/seaLayout';
import type { StageCommand } from '../lib/stageBus';
import { stageBus } from '../lib/stageBus';
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
	private rings?: Phaser.GameObjects.Graphics;
	private mark?: Phaser.GameObjects.Graphics;
	private boatIsNarrow = false;
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
		this.drawRings();
		this.boat = this.spawnPlayerBoat();
		// Open water dismisses whatever the last tap opened — the card is an
		// answer to a question, and tapping away is how a person stops asking.
		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			if (stageState.seaTappable && this.input.hitTestPointer(pointer).length === 0) {
				stageBus.emit({ type: 'waterTapped' });
			}
		});
		this.buildShips();
		if (stageState.voyage) this.showIsland(false);
		for (const [stanceIndex, attitude] of Object.entries(stageState.voyageAttitudes)) {
			this.placeBuoy(Number(stanceIndex), attitude, false);
		}
		for (let i = 0; i < stageState.stampedIslandIds.length; i++) this.addStamp(i, false);
	}

	protected layout(): void {
		this.drawRings();
		// crossing the phone/desktop breakpoint changes the boat's size, and its
		// halo and name are laid out from that size — cheaper and safer to build
		// it again than to re-measure three objects
		if (this.boat && this.boatIsNarrow !== this.narrow()) {
			this.boat.destroy();
			this.boat = undefined;
			// the party names come and go with the same breakpoint
			this.buildShips();
		}
		if (this.boat) {
			const fan = seaFan(this.W, this.H);
			this.moveBoat(this.boat, fan.cx, fan.cy);
		} else this.boat = this.spawnPlayerBoat();
		this.vignette?.setPosition(this.vignetteX(), this.vignetteY());
		this.applyShipLayout(false);
		this.stamps.forEach((stamp, index) => stamp.setPosition(this.stampX(index), this.H - 30));
		this.drawMark();
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
			case 'markShip':
				this.drawMark();
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
		const art = this.islandArtImage(info.imageUrl, this.narrow() ? 190 : 280);
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

		this.vignette = this.add.container(this.vignetteX(), this.vignetteY(), children).setDepth(60);
		if (art) {
			this.addIsletLife(this.vignette, art.displayWidth, art.displayHeight);
			this.addVignetteGulls(art.displayHeight);
			if (!this.reducedMotion) {
				this.tweens.add({
					targets: this.vignette,
					y: this.vignetteY() + 5,
					angle: 0.8,
					duration: 3000,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.inOut',
				});
			}
		}
		if (animate && !this.reducedMotion) {
			// next island approaches from the left, growing
			this.vignette.setX(-this.W * 0.2).setScale(0.4);
			this.tweens.add({
				targets: this.vignette,
				x: this.vignetteX(),
				scale: 1,
				duration: TWEEN_ISLAND_MS,
				ease: 'Sine.out',
			});
		}
	}

	/** Two gulls slowly circling above the island — pure ambience. */
	private addVignetteGulls(artHeight: number): void {
		if (!this.vignette || this.reducedMotion) return;
		for (let i = 0; i < 2; i++) {
			const gull = this.add.image(0, 0, i === 0 ? 'gull0' : 'gull1').setScale(0.8);
			this.vignette.add(gull);
			const radiusX = artHeight * (0.9 + i * 0.25);
			const radiusY = 18 + i * 8;
			const baseY = -artHeight * 0.55 - i * 16;
			const offset = Math.random() * Math.PI * 2;
			this.tweens.addCounter({
				from: 0,
				to: Math.PI * 2,
				duration: 9000 + i * 2600,
				repeat: -1,
				onUpdate: (tween) => {
					if (!gull.active) return;
					const angle = (tween.getValue() ?? 0) + offset;
					gull.setPosition(Math.cos(angle) * radiusX, baseY + Math.sin(angle) * radiusY);
				},
			});
			this.time.addEvent({
				delay: 240 + i * 60,
				loop: true,
				callback: () => {
					if (gull.active) {
						gull.setTexture(gull.texture.key === 'gull0' ? 'gull1' : 'gull0');
					}
				},
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

	// ---------- reading the sea ----------

	/**
	 * The player's berth is the origin of everything else on this sea: the
	 * range rings are drawn around it and every party ship is placed at its own
	 * distance from it, so the nearest ship is simply the one nearest the hull.
	 */
	private spawnPlayerBoat(): Phaser.GameObjects.Container {
		this.boatIsNarrow = this.narrow();
		const fan = seaFan(this.W, this.H);
		const boat = this.spawnBoat(fan.cx, fan.cy, this.narrow() ? BOAT_SCALE_NARROW : BOAT_SCALE, {
			named: true,
		});
		this.makeTappable(boat, 130, 230, () => stageBus.emit({ type: 'myShipTapped' }));

		return boat;
	}

	private narrow(): boolean {
		return this.W < NARROW_STAGE_WIDTH;
	}

	/**
	 * The island sits outside the fan, up the leading (left, in Hebrew) side —
	 * the direction the voyage sails toward. Inside the rings it would read as
	 * one more thing at a distance from the player, which it is not.
	 */
	private vignetteX(): number {
		return this.W * (this.narrow() ? 0.3 : 0.19);
	}

	private vignetteY(): number {
		return this.H * 0.28;
	}

	/**
	 * Range rings: thirds of the distance scale, drawn as ellipses because that
	 * is the shape a circle on the water takes seen from a boat sitting on it.
	 * Deliberately unlabelled — a tap gives the number in words, and captions
	 * across open water read as chrome.
	 */
	private drawRings(): void {
		this.rings?.destroy();
		const fan = seaFan(this.W, this.H);
		const graphics = this.add.graphics().setDepth(-18);
		rangeRings(this.W, this.H).forEach((ring, index) => {
			graphics.lineStyle(index === 2 ? 1 : 1.5, COLOR_CREAM, index === 2 ? 0.14 : 0.22);
			graphics.strokeEllipse(fan.cx, fan.cy, ring.rx * 2, ring.ry * 2);
		});
		this.rings = graphics;
	}

	/**
	 * The reach between the player and the ship they just asked about.
	 *
	 * A card naming a party is only half an answer on a sea of twelve hulls —
	 * the other half is which one it is. The line IS the distance the card puts
	 * in words, drawn between the two boats it is measured across, and it lasts
	 * exactly as long as the question does.
	 */
	private drawMark(): void {
		this.mark?.destroy();
		this.mark = undefined;
		const marked = this.ships.find((ship) => ship.party.id === stageState.markedPartyId);
		if (!marked || !this.boat) return;

		const graphics = this.add.graphics().setDepth(80);
		graphics.lineStyle(2, COLOR_GOLD, 0.55);
		graphics.lineBetween(this.boat.x, this.boat.y, marked.container.x, marked.container.y);
		graphics.lineStyle(2, COLOR_GOLD, 0.9);
		graphics.strokeEllipse(
			marked.container.x,
			marked.container.y + marked.image.displayHeight * 0.34,
			marked.image.displayWidth * 1.7,
			marked.image.displayHeight * 0.42,
		);
		this.mark = graphics;
	}

	/**
	 * Taps are live only while the sea is reacting.
	 *
	 * Distances are recomputed from the attitudes as they are marked, so a
	 * tappable ship during the question would let a player check which party
	 * an answer moves them toward before committing to it — the same nudge the
	 * mid-evaluation indicator rule forbids. Between islands, when the marking
	 * is done, it is just information about where they already stand.
	 */
	private makeTappable(
		target: Phaser.GameObjects.Container,
		width: number,
		height: number,
		onTap: () => void,
	): void {
		// An explicit hit area rather than one derived from setSize(): a
		// container has no origin, so Phaser's default rectangle starts at the
		// container's own position and runs down-right, leaving the upper half of
		// a hull dead to the touch. Sized to the sprite plus its name, which is
		// the thing a finger is aiming at.
		target.setInteractive(
			new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
			Phaser.Geom.Rectangle.Contains,
		);
		target.input!.cursor = 'pointer';
		target.on('pointerdown', () => {
			if (stageState.seaTappable) onTap();
		});
	}

	// ---------- party ships ----------

	private buildShips(): void {
		for (const ship of this.ships) ship.container.destroy();
		this.ships = stageState.parties.map((party) => {
			const ship = this.spawnPartyShip(party, 0.1, { named: !this.narrow() });
			this.makeTappable(ship.container, this.narrow() ? 64 : 92, this.narrow() ? 96 : 150, () =>
				stageBus.emit({ type: 'shipTapped', partyId: party.id }),
			);

			return ship;
		});
		this.applyShipLayout(false);
	}

	/** Ships move ONLY here — i.e. when React sends distances (reaction phase). */
	private applyShipLayout(animate: boolean): void {
		const count = this.ships.length || 1;
		this.ships.forEach((ship, index) => {
			const placement = partyShipPlacement(
				stageState.distances[ship.party.id],
				index,
				count,
				this.W,
				this.H,
			);
			// a phone's fan is a third the width: full-size hulls would overlap
			// into one mass, and every ship still reads as a ship at this size
			const scale = placement.scale * (this.narrow() ? 0.7 : 1);
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
					scale,
					duration: TWEEN_SHIP_MS,
					ease: 'Sine.inOut',
				});
			} else {
				ship.container.setPosition(placement.x, placement.y).setAlpha(placement.alpha);
				ship.image.setScale(scale);
			}
		});
		// a tween would leave the reach line pointing at where a ship used to be
		if (!animate) this.drawMark();
		else this.time.delayedCall(TWEEN_SHIP_MS, () => this.drawMark());
	}
}
