import Phaser from 'phaser';
import {
	BOAT_SCALE,
	BOAT_SCALE_NARROW,
	COLOR_CREAM,
	COLOR_GOLD,
	NARROW_STAGE_WIDTH,
	PARTICLES_ARRIVAL,
	PARTICLES_SPARKLE,
	STAGGER_FLAGS_MS,
	STAGGER_LANTERN_MS,
	TWEEN_SHIP_MS,
} from '../lib/stageConstants';
import {
	type FanFrame,
	islandDepth,
	islandPosition,
	partyShipPlacement,
	rangeRings,
	sailorPlacement,
	seaFan,
} from '../lib/seaLayout';
import type { StageCommand } from '../lib/stageBus';
import { stageState } from './stageState';
import { SeaScene, type PartyShip } from './SeaScene';

/**
 * Summary — golden-hour homecoming tableau: lanterns light on every visited
 * island (equal glow regardless of answers), the wake trail is complete,
 * party ships ride the same rings around the player's boat as they did on the
 * voyage — near the boat, far toward the horizon — and the lighthouse, the
 * Agora gate, is the most-lit object on screen.
 * docs/phaser-game-design.md §2.5
 */

/**
 * The fan sits lower than on the voyage: the lit islands take the top of the
 * frame, and the ships must not ride in among them.
 */
const HOMECOMING_FAN: FanFrame = { berth: 0.6, horizon: 0.27 };
/** The band of the frame the visited islands are drawn in. */
const ISLANDS_TOP = 0.04;
const ISLANDS_HEIGHT = 0.2;
export class HomecomingScene extends SeaScene {
	private boat?: Phaser.GameObjects.Container;
	private wake?: Phaser.GameObjects.Graphics;
	private lighthouse?: Phaser.GameObjects.Image;
	private beam?: Phaser.GameObjects.Triangle;
	private islandNodes: Phaser.GameObjects.Container[] = [];
	private sailorNodes: Phaser.GameObjects.Image[] = [];
	private ships: PartyShip[] = [];
	private rings?: Phaser.GameObjects.Graphics;
	private boatIsNarrow = false;
	private celebrated = false;

	constructor() {
		super('HomecomingScene');
	}

	create(): void {
		this.celebrated = false;
		this.islandNodes = [];
		this.sailorNodes = [];
		this.ships = [];
		this.createSea(0.92);
		this.wake = this.add.graphics().setDepth(10);
		this.buildLighthouse();
		this.drawRings();
		this.boat = this.spawnPlayerBoat();
		this.buildIslands();
		this.buildShips();
		this.buildSailors();
	}

	protected layout(): void {
		this.drawRings();
		// the boat's size, and the party names on the water, change at the
		// phone/desktop breakpoint — rebuild rather than re-measure
		if (this.boat && this.boatIsNarrow !== this.narrow()) {
			this.boat.destroy();
			this.boat = this.spawnPlayerBoat();
			this.buildShips();
		} else if (this.boat) {
			const fan = seaFan(this.W, this.H, HOMECOMING_FAN);
			this.moveBoat(this.boat, fan.cx, fan.cy);
		}
		this.lighthouse?.setPosition(this.W * 0.06, this.H * 0.3);
		this.beam?.setPosition(this.W * 0.06, this.H * 0.26);
		this.positionIslands();
		this.positionSailors();
		this.applyShipLayout(false);
		this.drawWake();
	}

	onCommand(command: StageCommand): void {
		switch (command.type) {
			case 'setIslands':
				this.buildIslands();
				break;
			case 'setParties':
				this.buildShips();
				break;
			case 'updateDistances':
				this.applyShipLayout(command.animate && !this.reducedMotion);
				break;
			case 'setSailors':
				this.buildSailors();
				break;
			case 'celebrateArrival':
				this.celebrate(command.islandCount);
				break;
			case 'sailToLighthouse':
				this.sailToLighthouse();
				break;
			default:
				break;
		}
	}

	/** Visited islands in the upper chart band, each gaining its lantern. */
	private buildIslands(): void {
		for (const node of this.islandNodes) node.destroy();
		this.islandNodes = [];

		stageState.islands
			.filter((island) => island.visited)
			.forEach((island, index) => {
				const children: Phaser.GameObjects.GameObject[] = [];
				const art = this.islandArtImage(island.imageUrl, 78);
				let labelY = 30;
				if (art) {
					labelY = art.displayHeight / 2 + 12;
					children.push(art);
				} else {
					children.push(
						this.add.image(0, 0, 'disc').setScale(0.7),
						this.add.image(0, 0, 'discRim').setScale(0.7).setTint(COLOR_GOLD),
					);
				}
				const lantern = this.add.image(0, -6, 'glow').setScale(0).setAlpha(0);
				const label = this.add
					.text(0, labelY, island.title, {
						fontFamily: 'Arial',
						fontSize: '12px',
						color: '#fff4d3',
						backgroundColor: 'rgba(6,26,48,0.85)',
						padding: { x: 7, y: 2 },
					})
					.setOrigin(0.5);
				children.push(lantern, label);
				const container = this.add.container(0, 0, children).setDepth(30);
				if (art) this.addIsletLife(container, art.displayWidth, art.displayHeight);
				this.islandNodes.push(container);

				// lanterns light one by one — equal glow for every island
				const delay = this.reducedMotion ? 0 : 400 + index * STAGGER_LANTERN_MS;
				this.time.delayedCall(delay, () => {
					if (!lantern.active) return;
					if (this.reducedMotion) {
						lantern.setScale(1.2).setAlpha(0.85);

						return;
					}
					this.tweens.add({ targets: lantern, scale: 1.2, alpha: 0.85, duration: 300 });
					this.burst(container.x, container.y - 6, 'spark', 6, COLOR_GOLD, {
						speed: [20, 50],
						life: 400,
					});
				});
			});
		this.positionIslands();
		this.drawWake();

		// illustrations still downloading → rebuild once they land
		this.ensureIslandTextures(
			stageState.islands.filter((island) => island.visited).map((island) => island.imageUrl),
			() => this.buildIslands(),
		);
	}

	private positionIslands(): void {
		const visited = stageState.islands.filter((island) => island.visited);
		visited.forEach((island, index) => {
			const node = this.islandNodes[index];
			if (!node) return;
			const base = islandPosition(island.posX, island.posY, this.W, this.H);
			// compress the chart into the upper band so the DOM sections scroll below
			node.setPosition(
				this.W * 0.18 + base.x * 0.7,
				this.H * ISLANDS_TOP + (base.y / this.H) * this.H * ISLANDS_HEIGHT,
			);
			// same atmospheric perspective as the chart, gentler at tableau size
			const depth = islandDepth(island.posY);
			node.setScale(0.55 + 0.45 * depth.scale);
			node.setAlpha(1 - depth.haze * 0.7);
			node.setDepth(30 + Math.round((node.y / this.H) * 10));
		});
	}

	/** The completed wake trail: boat → visited islands in voyage order. */
	private drawWake(): void {
		if (!this.wake || !this.boat) return;
		this.wake.clear();
		if (this.islandNodes.length === 0) return;
		this.wake.lineStyle(2, 0xbfe6ff, 0.45);
		let previous = { x: this.islandNodes[0].x, y: this.islandNodes[0].y };
		for (const node of this.islandNodes.slice(1)) {
			this.wake.lineBetween(previous.x, previous.y, node.x, node.y);
			previous = { x: node.x, y: node.y };
		}
		this.wake.lineBetween(previous.x, previous.y, this.boat.x, this.boat.y);
	}

	/** The player's boat at the centre of the rings, named and haloed exactly
	 *  as on the voyage, so the distances read from the same hull. */
	private spawnPlayerBoat(): Phaser.GameObjects.Container {
		this.boatIsNarrow = this.narrow();
		const fan = seaFan(this.W, this.H, HOMECOMING_FAN);

		return this.spawnBoat(fan.cx, fan.cy, this.narrow() ? BOAT_SCALE_NARROW : BOAT_SCALE, {
			named: true,
		});
	}

	private narrow(): boolean {
		return this.W < NARROW_STAGE_WIDTH;
	}

	/** The voyage's range rings — near / middle / far — around the boat. */
	private drawRings(): void {
		this.rings?.destroy();
		const fan = seaFan(this.W, this.H, HOMECOMING_FAN);
		const graphics = this.add.graphics().setDepth(-18);
		rangeRings(this.W, this.H, HOMECOMING_FAN).forEach((ring, index) => {
			graphics.lineStyle(index === 2 ? 1 : 1.5, COLOR_CREAM, index === 2 ? 0.14 : 0.22);
			graphics.strokeEllipse(fan.cx, fan.cy, ring.rx * 2, ring.ry * 2);
		});
		this.rings = graphics;
	}

	private buildShips(): void {
		for (const ship of this.ships) ship.container.destroy();
		this.ships = stageState.parties.map((party) =>
			this.spawnPartyShip(party, 0.1, { named: !this.narrow() }),
		);
		this.applyShipLayout(false);
	}

	private applyShipLayout(animate: boolean): void {
		const count = this.ships.length || 1;
		this.ships.forEach((ship, index) => {
			const base = partyShipPlacement(
				stageState.distances[ship.party.id],
				index,
				count,
				this.W,
				this.H,
				HOMECOMING_FAN,
			);
			// same trim as the voyage: a phone's fan cannot hold full-size hulls
			const placement = { ...base, scale: base.scale * (this.narrow() ? 0.7 : 1) };
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

	/** Fellow sailors: ambient distant sails, never labeled on-canvas. */
	private buildSailors(): void {
		for (const node of this.sailorNodes) node.destroy();
		this.sailorNodes = stageState.sailors.slice(0, 8).map((_, index) =>
			this.add
				.image(0, 0, 'sail')
				.setAlpha(0.75)
				.setDepth(20 + index),
		);
		this.positionSailors();
	}

	private positionSailors(): void {
		const sailors = stageState.sailors.slice(0, 8);
		sailors.forEach((distance, index) => {
			const node = this.sailorNodes[index];
			if (!node) return;
			const placement = sailorPlacement(distance, index, sailors.length, this.W, this.H * 0.85);
			node.setPosition(placement.x, placement.y);
		});
	}

	private buildLighthouse(): void {
		this.lighthouse = this.add.image(this.W * 0.06, this.H * 0.3, 'lighthouse').setDepth(25);
		this.add
			.image(this.W * 0.06, this.H * 0.22, 'glow')
			.setScale(1.6)
			.setAlpha(0.9)
			.setDepth(24);
		this.beam = this.add
			.triangle(this.W * 0.06, this.H * 0.26, 0, 0, 260, -34, 260, 34, 0xfff4d3, 0.12)
			.setOrigin(0, 0.5)
			.setDepth(23);
		if (!this.reducedMotion) {
			this.tweens.add({
				targets: this.beam,
				angle: { from: -18, to: 18 },
				duration: 3000,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.inOut',
			});
		}
	}

	/** One-time, ~2.5s, skippable by scrolling past — never replayed (§8.4). */
	private celebrate(islandCount: number): void {
		if (this.celebrated || !this.boat) return;
		this.celebrated = true;
		if (this.reducedMotion) return;

		const flags = Math.min(islandCount, 8);
		for (let i = 0; i < flags; i++) {
			const flag = this.add
				.image(this.boat.x + 14, this.boat.y - 30, 'flag')
				.setTint(0xfff4d3)
				.setAlpha(0)
				.setDepth(110);
			this.tweens.add({
				targets: flag,
				y: this.boat.y - 46 - i * 15,
				alpha: 0.95,
				duration: 320,
				delay: 500 + i * STAGGER_FLAGS_MS,
				ease: 'Bounce.out',
			});
		}
		this.time.delayedCall(500 + flags * STAGGER_FLAGS_MS, () => {
			if (this.boat) {
				this.burst(this.boat.x, this.boat.y - 60, 'spark', PARTICLES_ARRIVAL, COLOR_GOLD, {
					speed: [50, 110],
					life: 700,
				});
			}
		});
	}

	/** The Agora gate: the boat sails into the beam. Fire-and-go — never
	 *  blocks the actual navigation. */
	private sailToLighthouse(): void {
		if (!this.boat || !this.lighthouse) return;
		if (this.reducedMotion) return;
		this.tweens.add({
			targets: this.boat,
			x: this.lighthouse.x + 60,
			y: this.lighthouse.y + 60,
			duration: 1000,
			ease: 'Sine.inOut',
		});
		this.burst(this.lighthouse.x, this.lighthouse.y, 'spark', PARTICLES_SPARKLE, COLOR_GOLD);
	}
}
