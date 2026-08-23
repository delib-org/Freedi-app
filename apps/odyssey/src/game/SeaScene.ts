import Phaser from 'phaser';
import {
	BOB_MS,
	BOAT_DEPTH,
	BOAT_DEPTH_FRONT,
	COLOR_CREAM,
	COLOR_GOLD,
	COLOR_LANTERN,
	COLOR_NAVY,
	DAYPHASE_MS,
	PARTICLES_MAX_LIVE,
	MY_SHIP_LABEL,
	PENNANT_COLORS,
	TINT_DAWN,
	TINT_GOLDEN,
	TINT_NOON,
	TWEEN_FADE_MS,
} from '../lib/stageConstants';
import type { StageCommand, StageParty } from '../lib/stageBus';
import { stageState } from './stageState';

export interface PartyShip {
	party: StageParty;
	container: Phaser.GameObjects.Container;
	image: Phaser.GameObjects.Image;
}

/**
 * Shared base for all sea scenes: continuous ocean, progress-driven day
 * phase, the player's boat avatar (with its value pennants), reduced-motion
 * handling and small burst effects (hand-rolled — no particle-system
 * dependency, deterministic across Phaser versions).
 */
export abstract class SeaScene extends Phaser.Scene {
	protected ocean!: Phaser.GameObjects.Image;
	protected shade!: Phaser.GameObjects.Rectangle;
	protected reducedMotion = false;
	private dayPhase = 0;
	private boatBob?: Phaser.Tweens.Tween;
	private liveParticles = 0;
	private resizeHandler?: () => void;

	protected get W(): number {
		return this.scale.width;
	}

	protected get H(): number {
		return this.scale.height;
	}

	/** Every concrete scene re-anchors its objects here (also runs on resize). */
	protected abstract layout(): void;

	/** Live commands routed from the stage bus while this scene is active. */
	onCommand(_command: StageCommand): void {
		// scenes override what they care about
	}

	/** Call first in create(): ocean, shade, fade-in, resize wiring. */
	protected createSea(dayPhase: number): void {
		this.reducedMotion =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		this.ocean = this.add.image(0, 0, 'ocean').setDepth(-20);
		this.shade = this.add.rectangle(0, 0, 10, 10, COLOR_NAVY, 0.35).setOrigin(0, 0).setDepth(-19);
		this.coverFitOcean();
		this.dayPhase = dayPhase;
		this.ocean.setTint(this.tintFor(dayPhase));

		this.cameras.main.fadeIn(TWEEN_FADE_MS, 4, 18, 34);

		this.resizeHandler = () => {
			this.coverFitOcean();
			this.layout();
		};
		this.scale.on('resize', this.resizeHandler);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			if (this.resizeHandler) this.scale.off('resize', this.resizeHandler);
		});
	}

	private coverFitOcean(): void {
		const source = this.textures.get('ocean').getSourceImage();
		const scale = Math.max(this.W / source.width, this.H / source.height);
		this.ocean
			.setPosition(this.W / 2, this.H / 2)
			.setDisplaySize(source.width * scale, source.height * scale);
		this.shade.setSize(this.W, this.H);
	}

	private tintFor(phase: number): number {
		const clamped = Math.min(1, Math.max(0, phase));
		const from = clamped < 0.5 ? TINT_DAWN : TINT_NOON;
		const to = clamped < 0.5 ? TINT_NOON : TINT_GOLDEN;
		const t = clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2;
		const a = Phaser.Display.Color.IntegerToColor(from);
		const b = Phaser.Display.Color.IntegerToColor(to);
		const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, t * 100);

		return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
	}

	/** Progress-driven time of day (never wall-clock — ethics §8.3). */
	protected setDayPhase(phase: number, animate: boolean): void {
		const start = this.dayPhase;
		this.dayPhase = phase;
		if (!animate || this.reducedMotion) {
			this.ocean.setTint(this.tintFor(phase));

			return;
		}
		this.tweens.addCounter({
			from: 0,
			to: 1,
			duration: DAYPHASE_MS,
			ease: 'Sine.inOut',
			onUpdate: (tween) => {
				const t = tween.getValue() ?? 1;
				this.ocean.setTint(this.tintFor(start + (phase - start) * t));
			},
		});
	}

	/**
	 * The player's boat avatar with its value pennants flying on the mast.
	 * Pennant count mirrors stageState (identity, not score).
	 *
	 * `named` is for any sea that also carries party ships: the same sprite
	 * flies for everyone, so without a lantern halo and a name on the water the
	 * player cannot tell which hull is theirs — and every distance the scene
	 * draws is measured from a boat they cannot find. Depth is above every
	 * party ship (those are depth-sorted by y, which can exceed the plain 100).
	 */
	protected spawnBoat(
		x: number,
		y: number,
		shipScale: number,
		options?: { named?: boolean },
	): Phaser.GameObjects.Container {
		const image = this.add.image(0, 0, 'ship').setScale(shipScale);
		const container = this.add
			.container(x, y, [image])
			.setDepth(options?.named ? BOAT_DEPTH_FRONT : BOAT_DEPTH);

		if (options?.named) {
			const halo = this.add
				.image(0, image.displayHeight * 0.34, 'glow')
				.setDisplaySize(image.displayWidth * 2.1, image.displayHeight * 0.75)
				.setTint(COLOR_LANTERN)
				.setAlpha(0.55);
			container.addAt(halo, 0);
			// A ring drawn on the water around the hull, in the same hand as the
			// range rings: it says the player is the centre those are measured
			// from, before any word is read.
			const berth = this.add
				.image(0, image.displayHeight * 0.34, 'ring')
				.setDisplaySize(image.displayWidth * 1.8, image.displayHeight * 0.5)
				.setTint(COLOR_GOLD)
				.setAlpha(0.75);
			container.addAt(berth, 1);
			const label = this.add
				.text(0, image.displayHeight * 0.62, MY_SHIP_LABEL, {
					fontFamily: 'Arial',
					fontSize: '14px',
					color: '#ffe9b0',
					fontStyle: 'bold',
					backgroundColor: 'rgba(6,26,48,0.9)',
					padding: { x: 10, y: 4 },
				})
				.setOrigin(0.5);
			container.add(label);
			if (!this.reducedMotion) {
				this.tweens.add({
					targets: halo,
					alpha: 0.75,
					duration: 2200,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.inOut',
				});
			}
		}

		const pennantCount = Math.min(stageState.pennants, PENNANT_COLORS.length);
		for (let i = 0; i < pennantCount; i++) {
			const pennant = this.add
				.image(-10 - i * 16, -image.displayHeight * 0.55, 'pennant')
				.setTint(PENNANT_COLORS[i])
				.setScale(0.8);
			container.add(pennant);
		}

		this.startBoatBob(container, y);

		return container;
	}

	/**
	 * Re-berth the boat (resize, breakpoint change) WITHOUT the swell dragging
	 * it home.
	 *
	 * The bobbing tween is built around the y it was spawned at, so a plain
	 * setPosition survives exactly one frame before the loop pulls the hull
	 * back to where it started. Harmless while every scene moved the boat by a
	 * few pixels; not harmless once a breakpoint moves it half a screen.
	 */
	protected moveBoat(boat: Phaser.GameObjects.Container, x: number, y: number): void {
		this.boatBob?.remove();
		this.boatBob = undefined;
		boat.setPosition(x, y).setAngle(0);
		this.startBoatBob(boat, y);
	}

	private startBoatBob(boat: Phaser.GameObjects.Container, y: number): void {
		if (this.reducedMotion) return;
		this.boatBob = this.tweens.add({
			targets: boat,
			y: y + 6,
			angle: 1.4,
			duration: BOB_MS,
			yoyo: true,
			repeat: -1,
			ease: 'Sine.inOut',
		});
	}

	/**
	 * A party ship: same sprite for every party; flag color + name only.
	 *
	 * `named: false` is for a sea too small to carry twelve names at once — a
	 * phone, where the labels overlap into an unreadable stack. The flag still
	 * tells them apart and a tap still says who it is; a name nobody can read
	 * is not information.
	 */
	protected spawnPartyShip(
		party: StageParty,
		shipScale: number,
		options?: { named?: boolean },
	): PartyShip {
		const image = this.add.image(0, 0, 'ship').setScale(shipScale);
		const color = Phaser.Display.Color.HexStringToColor(party.color).color;
		const flag = this.add.rectangle(0, -46, 30, 16, color).setStrokeStyle(1, 0xffffff, 0.7);
		const parts: Phaser.GameObjects.GameObject[] = [image, flag];
		if (options?.named !== false) {
			parts.push(
				this.add
					.text(0, 44, party.name, {
						fontFamily: 'Arial',
						fontSize: '13px',
						color: '#fff4d3',
						backgroundColor: 'rgba(6,26,48,0.85)',
						padding: { x: 8, y: 3 },
					})
					.setOrigin(0.5),
			);
		}
		const container = this.add.container(0, 0, parts);

		if (!this.reducedMotion) {
			this.tweens.add({
				targets: image,
				y: { from: -3, to: 3 },
				duration: 1700 + Math.floor(Math.random() * 400),
				yoyo: true,
				repeat: -1,
				ease: 'Sine.inOut',
			});
		}

		return { party, container, image };
	}

	/**
	 * Hand-rolled radial burst. Capped at PARTICLES_MAX_LIVE across the scene;
	 * silently skipped under reduced motion.
	 */
	protected burst(
		x: number,
		y: number,
		texture: string,
		count: number,
		tint: number,
		options?: { speed?: [number, number]; life?: number; gravity?: number },
	): void {
		if (this.reducedMotion) return;
		const [speedMin, speedMax] = options?.speed ?? [40, 80];
		const life = options?.life ?? 400;
		const gravity = options?.gravity ?? 0;

		for (let i = 0; i < count; i++) {
			if (this.liveParticles >= PARTICLES_MAX_LIVE) return;
			this.liveParticles += 1;
			const angle = Math.random() * Math.PI * 2;
			const speed = speedMin + Math.random() * (speedMax - speedMin);
			const distance = (speed * life) / 1000;
			const particle = this.add
				.image(x, y, texture)
				.setTint(tint)
				.setDepth(500)
				.setScale(0.7 + Math.random() * 0.5);
			this.tweens.add({
				targets: particle,
				x: x + Math.cos(angle) * distance,
				y: y + Math.sin(angle) * distance + (gravity * life) / 1000,
				alpha: 0,
				scale: 0.2,
				duration: life,
				ease: 'Cubic.out',
				onComplete: () => {
					particle.destroy();
					this.liveParticles -= 1;
				},
			});
		}
	}

	/** Game-wide texture key for a runtime-loaded island illustration. */
	protected islandTextureKey(url: string): string {
		return `islandart--${url}`;
	}

	/**
	 * Queue any not-yet-loaded island illustrations; `onLoaded` fires once
	 * after the load finishes (never synchronously, and not at all when
	 * everything is already cached — callers use the cached path directly).
	 */
	protected ensureIslandTextures(urls: (string | null)[], onLoaded: () => void): void {
		const missing = [...new Set(urls)].filter(
			(url): url is string => !!url && !this.textures.exists(this.islandTextureKey(url)),
		);
		if (missing.length === 0) return;
		for (const url of missing) this.load.image(this.islandTextureKey(url), url);
		this.load.once(Phaser.Loader.Events.COMPLETE, () => {
			if (this.scene.isActive()) onLoaded();
		});
		this.load.start();
	}

	/** Island illustration if loaded, sized to `width` px; null → caller
	 *  falls back to the generated disc. */
	protected islandArtImage(url: string | null, width: number): Phaser.GameObjects.Image | null {
		if (!url || !this.textures.exists(this.islandTextureKey(url))) return null;
		const image = this.add.image(0, 0, this.islandTextureKey(url));
		image.setScale(width / image.width);

		return image;
	}

	/**
	 * Ambient "alive" layer for an islet: a breathing waterline foam glow
	 * and periodic expanding shore ripples. Skipped under reduced motion.
	 * Rebuilds leave the loop timers as harmless no-ops (guarded by
	 * container.active) — they die with the scene.
	 */
	protected addIsletLife(
		container: Phaser.GameObjects.Container,
		artWidth: number,
		artHeight: number,
	): void {
		if (this.reducedMotion) return;

		const foam = this.add
			.image(0, artHeight * 0.34, 'glow')
			.setDisplaySize(artWidth * 1.2, artHeight * 0.55)
			.setTint(0xbfe6ff)
			.setAlpha(0.16);
		container.addAt(foam, 0);
		this.tweens.add({
			targets: foam,
			alpha: 0.3,
			duration: 2400 + Math.random() * 900,
			yoyo: true,
			repeat: -1,
			ease: 'Sine.inOut',
		});

		this.time.addEvent({
			delay: 3600 + Math.random() * 3200,
			loop: true,
			callback: () => {
				if (!container.active) return;
				// respect the container's perspective scale at fire time
				const width = artWidth * container.scaleX;
				const ring = this.add
					.image(container.x, container.y + artHeight * container.scaleY * 0.36, 'ring')
					.setTint(0xbfe6ff)
					.setAlpha(0.3)
					.setScale(width / 120, width / 300)
					.setDepth(container.depth - 1);
				this.tweens.add({
					targets: ring,
					scaleX: width / 34,
					scaleY: width / 110,
					alpha: 0,
					duration: 1900,
					ease: 'Sine.out',
					onComplete: () => ring.destroy(),
				});
			},
		});
	}

	/** Plain-Hebrew Phaser label (never mix digits/Latin into Phaser strings). */
	protected hebrewLabel(
		x: number,
		y: number,
		text: string,
		fontSize: number,
		color = '#fff4d3',
	): Phaser.GameObjects.Text {
		return this.add
			.text(x, y, text, {
				fontFamily: 'Arial',
				fontSize: `${fontSize}px`,
				color,
			})
			.setOrigin(0.5);
	}

	/** Cream glyph text (buoys, anchors, castle). */
	protected glyph(x: number, y: number, symbol: string, size: number): Phaser.GameObjects.Text {
		return this.add
			.text(x, y, symbol, { fontSize: `${size}px`, color: '#fff4d3' })
			.setOrigin(0.5)
			.setTint(COLOR_CREAM);
	}
}
