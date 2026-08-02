import Phaser from 'phaser';
import { COLOR_CREAM, COLOR_CYAN, COLOR_GOLD } from '../lib/stageConstants';
import { islandDepth, islandPosition } from '../lib/seaLayout';
import { stageBus, type StageCommand, type StageIsland } from '../lib/stageBus';
import { stageState } from './stageState';
import { SeaScene } from './SeaScene';

interface IslandNode {
	island: StageIsland;
	container: Phaser.GameObjects.Container;
	rim: Phaser.GameObjects.Image;
	anchor: Phaser.GameObjects.Text;
	lantern: Phaser.GameObjects.Image | null;
	/** true when the node shows the island illustration (rim = selection ring only) */
	hasArt: boolean;
}

/**
 * Map — morning, the sea as a nautical chart. Phaser owns the islands: tap
 * to anchor (selection lives in React; taps go out over the bus, selection
 * comes back). A dashed gold route line threads the harbor through the
 * islands in selection order. docs/phaser-game-design.md §2.3
 */
export class ChartScene extends SeaScene {
	private boat?: Phaser.GameObjects.Container;
	private frame?: Phaser.GameObjects.Graphics;
	private route?: Phaser.GameObjects.Graphics;
	private castle?: Phaser.GameObjects.Text;
	private castleLabel?: Phaser.GameObjects.Text;
	private nodes: IslandNode[] = [];
	private dashOffset = 0;
	private marchTimer?: Phaser.Time.TimerEvent;

	constructor() {
		super('ChartScene');
	}

	create(): void {
		this.createSea(0.35);
		this.nodes = [];
		this.frame = this.add.graphics().setDepth(-10);
		this.route = this.add.graphics().setDepth(20);
		this.castle = this.glyph(this.W * 0.08, this.H * 0.12, '🏰', 28).setDepth(30);
		this.castleLabel = this.hebrewLabel(this.W * 0.08, this.H * 0.12 + 30, 'ממלכת ההגעה', 13);
		this.boat = this.spawnBoat(this.W * 0.9, this.H * 0.86, 0.1);
		this.drawFrame();
		this.buildIslands();
		this.drawRoute();

		if (!this.reducedMotion) {
			this.marchTimer = this.time.addEvent({
				delay: 80,
				loop: true,
				callback: () => {
					this.dashOffset = (this.dashOffset + 2) % 16;
					this.drawRoute();
				},
			});
		}
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.marchTimer?.destroy());
	}

	protected layout(): void {
		this.drawFrame();
		this.castle?.setPosition(this.W * 0.08, this.H * 0.12);
		this.castleLabel?.setPosition(this.W * 0.08, this.H * 0.12 + 30);
		this.boat?.setPosition(this.W * 0.9, this.H * 0.86);
		for (const node of this.nodes) {
			const { x, y } = islandPosition(node.island.posX, node.island.posY, this.W, this.H);
			node.container.setPosition(x, y);
		}
		this.drawRoute();
	}

	onCommand(command: StageCommand): void {
		switch (command.type) {
			case 'setIslands':
				this.buildIslands();
				this.drawRoute();
				break;
			case 'setSelection':
				this.syncSelection(true);
				this.drawRoute();
				break;
			default:
				break;
		}
	}

	private drawFrame(): void {
		if (!this.frame) return;
		this.frame.clear();
		const margin = Math.min(this.W, this.H) * 0.03;
		this.frame.lineStyle(2, COLOR_GOLD, 0.6);
		this.frame.strokeRect(margin, margin, this.W - margin * 2, this.H - margin * 2);
		// faint rhumb lines radiating from the harbor corner
		this.frame.lineStyle(1, COLOR_CREAM, 0.06);
		for (const target of [
			{ x: 0, y: 0 },
			{ x: this.W * 0.5, y: 0 },
			{ x: 0, y: this.H * 0.5 },
			{ x: this.W * 0.25, y: 0 },
		]) {
			this.frame.lineBetween(this.W * 0.9, this.H * 0.86, target.x, target.y);
		}
	}

	private buildIslands(): void {
		for (const node of this.nodes) node.container.destroy();
		this.nodes = [];

		stageState.islands.forEach((island, index) => {
			const { x, y } = islandPosition(island.posX, island.posY, this.W, this.H);
			const children: Phaser.GameObjects.GameObject[] = [];

			// illustration when loaded; generated disc + number as fallback
			const art = this.islandArtImage(island.imageUrl, 124);
			const rim = this.add.image(0, 0, 'discRim').setTint(COLOR_CYAN);
			let labelY = 42;
			if (art) {
				labelY = art.displayHeight / 2 + 14;
				rim
					.setDisplaySize(art.displayHeight * 1.5, art.displayHeight * 1.5)
					.setTint(COLOR_GOLD)
					.setAlpha(0.9)
					.setVisible(false);
				children.push(rim, art);
			} else {
				const disc = this.add.image(0, 0, 'disc');
				const indexText = this.add
					.text(0, 0, String(index + 1), {
						fontFamily: 'Arial',
						fontSize: '22px',
						color: '#fff4d3',
						fontStyle: 'bold',
					})
					.setOrigin(0.5);
				children.push(disc, rim, indexText);
			}

			const anchor = this.glyph(0, -24, '⚓', 22).setAlpha(0);
			const label = this.add
				.text(0, labelY, island.title, {
					fontFamily: 'Arial',
					fontSize: '13px',
					color: '#fff4d3',
					backgroundColor: 'rgba(6,26,48,0.88)',
					padding: { x: 9, y: 3 },
				})
				.setOrigin(0.5);
			const lantern = island.visited
				? this.add.image(0, -8, 'glow').setScale(1.1).setAlpha(0.7)
				: null;

			children.push(anchor, label);
			if (lantern) children.push(lantern);
			// Atmospheric perspective: near islands large and crisp, far ones
			// smaller, hazier, drawn behind (painter's order by y).
			const depth = islandDepth(island.posY);
			const container = this.add
				.container(x, y, children)
				.setScale(depth.scale)
				.setAlpha(1 - depth.haze * 0.8)
				.setDepth(40 + Math.round((y / this.H) * 20));
			if (art) {
				this.addIsletLife(container, art.displayWidth, art.displayHeight);
				if (!this.reducedMotion) {
					this.tweens.add({
						targets: art,
						angle: { from: -0.7, to: 0.7 },
						duration: 3200 + index * 260,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.inOut',
					});
				}
			}
			// ≥60px effective hit area even after the perspective scale
			const hit = Math.max(72, 84 / depth.scale);
			container.setSize(hit, hit);
			container.setInteractive({ useHandCursor: true });
			container.on('pointerdown', () => {
				stageBus.emit({ type: 'islandTapped', islandId: island.id });
			});

			if (!this.reducedMotion) {
				this.tweens.add({
					targets: container,
					y: y + 2,
					duration: 2600 + index * 230,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.inOut',
				});
			}

			this.nodes.push({ island, container, rim, anchor, lantern, hasArt: !!art });
		});
		this.syncSelection(false);

		// illustrations still downloading → rebuild once they land
		this.ensureIslandTextures(
			stageState.islands.map((island) => island.imageUrl),
			() => {
				this.buildIslands();
				this.drawRoute();
			},
		);
	}

	/** Anchor stamps drop in on select, float away on deselect — symmetric. */
	private syncSelection(animate: boolean): void {
		const selected = new Set(stageState.selection);
		for (const node of this.nodes) {
			const isSelected = selected.has(node.island.id);
			const wasSelected = node.anchor.alpha > 0.5;
			if (node.hasArt) {
				// with art the rim is a pure selection ring
				node.rim.setVisible(isSelected);
			} else {
				node.rim.setTint(isSelected ? COLOR_GOLD : COLOR_CYAN);
			}
			if (isSelected === wasSelected) continue;

			if (!animate || this.reducedMotion) {
				node.anchor.setAlpha(isSelected ? 1 : 0).setY(isSelected ? 0 : -24);
				continue;
			}
			if (isSelected) {
				node.anchor.setAlpha(1).setY(-24).setScale(1);
				this.tweens.add({
					targets: node.anchor,
					y: 0,
					duration: 250,
					ease: 'Cubic.in',
					onComplete: () => {
						this.tweens.add({
							targets: node.anchor,
							scale: { from: 1.15, to: 1 },
							duration: 80,
						});
						this.ripple(node.container.x, node.container.y, node.container.scaleX);
					},
				});
				const angle = Phaser.Math.Angle.Between(
					this.W * 0.9,
					this.H * 0.86,
					node.container.x,
					node.container.y,
				);
				if (this.boat) {
					this.tweens.add({
						targets: this.boat,
						rotation: angle * 0.1,
						duration: 300,
					});
				}
			} else {
				this.tweens.add({
					targets: node.anchor,
					y: -24,
					alpha: 0,
					duration: 300,
					ease: 'Sine.out',
				});
			}
		}
	}

	private ripple(x: number, y: number, factor = 1): void {
		if (this.reducedMotion) return;
		const ring = this.add
			.image(x, y, 'ring')
			.setTint(COLOR_CYAN)
			.setScale(0.2 * factor)
			.setDepth(35);
		this.tweens.add({
			targets: ring,
			scale: 2 * factor,
			alpha: 0,
			duration: 500,
			ease: 'Cubic.out',
			onComplete: () => ring.destroy(),
		});
	}

	/** Dashed gold polyline: harbor → islands in selection order. */
	private drawRoute(): void {
		if (!this.route) return;
		this.route.clear();
		const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(this.W * 0.9, this.H * 0.86)];
		for (const id of stageState.selection) {
			const node = this.nodes.find((candidate) => candidate.island.id === id);
			if (node) points.push(new Phaser.Math.Vector2(node.container.x, node.container.y));
		}
		if (points.length < 2) return;

		this.route.lineStyle(2, COLOR_GOLD, 0.7);
		const dash = 10;
		const gap = 6;
		for (let i = 0; i < points.length - 1; i++) {
			const from = points[i];
			const to = points[i + 1];
			const length = Phaser.Math.Distance.BetweenPoints(from, to);
			const step = (dash + gap) / length;
			for (let t = (this.dashOffset % (dash + gap)) / length; t < 1; t += step) {
				const end = Math.min(1, t + dash / length);
				this.route.lineBetween(
					from.x + (to.x - from.x) * t,
					from.y + (to.y - from.y) * t,
					from.x + (to.x - from.x) * end,
					from.y + (to.y - from.y) * end,
				);
			}
		}
	}
}
