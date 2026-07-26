import { useEffect, useRef } from 'react';

export type SeaParty = { id: string; name: string; color: string };
export type SeaDistances = Record<string, number | null>;

const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Phaser sea visualization: the player's boat sails at the bottom, party
 * ships are placed by their current distance (0 = alongside your route,
 * 1 = far on the horizon). When `distances` changes, ships tween to their
 * new place — the "הים מגיב לבחירות שלך" moment from the design doc.
 */
export default function PartySea({
	parties,
	distances,
	caption,
}: {
	parties: SeaParty[];
	distances: SeaDistances;
	caption?: string;
}) {
	const host = useRef<HTMLDivElement>(null);
	const sceneBus = useRef<{ update?: (distances: SeaDistances) => void }>({});
	const partiesKey = parties.map((party) => party.id).join(',');

	useEffect(() => {
		if (!host.current) return;
		let game: { destroy: (removeCanvas: boolean) => void } | undefined;
		let cancelled = false;
		const bus = sceneBus.current;

		async function start(): Promise<void> {
			const Phaser = await import('phaser');
			if (cancelled || !host.current) return;

			type ShipSprite = {
				party: SeaParty;
				container: InstanceType<typeof Phaser.GameObjects.Container>;
				image: InstanceType<typeof Phaser.GameObjects.Image>;
			};

			class PartySeaScene extends Phaser.Scene {
				private ships: ShipSprite[] = [];

				preload(): void {
					this.load.image('ocean', '/assets/mediterranean-ocean.png');
					this.load.image('ship', '/assets/ship.png');
				}

				create(): void {
					this.add
						.image(WIDTH / 2, HEIGHT / 2, 'ocean')
						.setDisplaySize(WIDTH, HEIGHT)
						.setDepth(-20);
					this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x06192c, 0.25).setDepth(-19);

					const boat = this.add.image(0, 0, 'ship').setScale(0.16);
					const boatLabelBg = this.add
						.rectangle(0, 64, 128, 28, 0x061a30, 0.9)
						.setStrokeStyle(1, 0x5edfff, 0.95);
					const boatLabel = this.add
						.text(0, 64, 'הסירה שלך', {
							fontFamily: 'Arial',
							fontSize: '15px',
							color: '#bdeeff',
						})
						.setOrigin(0.5);
					const boatContainer = this.add
						.container(WIDTH / 2, HEIGHT * 0.86, [boat, boatLabelBg, boatLabel])
						.setDepth(100);
					this.tweens.add({
						targets: boatContainer,
						y: HEIGHT * 0.86 + 6,
						angle: 1.4,
						duration: 2100,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.inOut',
					});

					parties.forEach((party, index) => this.spawnShip(party, index));
					this.layout(distances, false);
					bus.update = (next) => this.layout(next, true);
				}

				private spawnShip(party: SeaParty, index: number): void {
					const image = this.add.image(0, 0, 'ship');
					const color = Phaser.Display.Color.HexStringToColor(party.color).color;
					const flag = this.add.rectangle(0, -46, 30, 16, color).setStrokeStyle(1, 0xffffff, 0.7);
					const labelBg = this.add
						.rectangle(0, 44, Math.max(90, party.name.length * 9 + 22), 24, 0x061a30, 0.9)
						.setStrokeStyle(1, color, 1);
					const label = this.add
						.text(0, 44, party.name, {
							fontFamily: 'Arial',
							fontSize: '13px',
							color: '#fff4d3',
						})
						.setOrigin(0.5);
					const container = this.add.container(0, 0, [image, flag, labelBg, label]);
					this.ships.push({ party, container, image });

					this.tweens.add({
						targets: image,
						y: { from: -3, to: 3 },
						duration: 1700 + index * 180,
						yoyo: true,
						repeat: -1,
						ease: 'Sine.inOut',
					});
				}

				/** distance 0 → near the player (low, big); 1 → far horizon (high, small). */
				private layout(next: SeaDistances, animate: boolean): void {
					const count = this.ships.length || 1;
					this.ships.forEach((ship, index) => {
						const distance = next[ship.party.id];
						const value = distance === null || distance === undefined ? 0.9 : distance;
						const x = WIDTH * (0.12 + (0.76 * (index + 0.5)) / count);
						const y = HEIGHT * (0.2 + 0.5 * (1 - value));
						const scale = 0.075 + 0.11 * (1 - value);
						const alpha =
							distance === null || distance === undefined ? 0.45 : 0.55 + 0.45 * (1 - value);
						ship.container.setDepth(Math.round(y));

						if (animate) {
							this.tweens.add({
								targets: ship.container,
								x,
								y,
								alpha,
								duration: 1400,
								ease: 'Sine.inOut',
							});
							this.tweens.add({
								targets: ship.image,
								scale,
								duration: 1400,
								ease: 'Sine.inOut',
							});
						} else {
							ship.container.setPosition(x, y).setAlpha(alpha);
							ship.image.setScale(scale);
						}
					});
				}
			}

			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: host.current,
				backgroundColor: '#071a2a',
				scale: {
					mode: Phaser.Scale.FIT,
					autoCenter: Phaser.Scale.CENTER_BOTH,
					width: WIDTH,
					height: HEIGHT,
				},
				scene: PartySeaScene,
				render: { antialias: true },
			});
		}

		void start();

		return () => {
			cancelled = true;
			bus.update = undefined;
			game?.destroy(true);
		};
	}, [partiesKey]);

	useEffect(() => {
		sceneBus.current.update?.(distances);
	}, [distances]);

	return (
		<div className="relative w-full overflow-hidden rounded-xl border border-[rgba(232,185,88,0.7)]">
			<div ref={host} className="w-full aspect-[16/9] [&_canvas]:!w-full [&_canvas]:!h-full" />
			{caption ? (
				<div className="absolute bottom-2 right-2 left-2 text-center text-[13px] text-[#d5ecf7] bg-[rgba(4,18,34,0.75)] rounded-lg px-3 py-1.5">
					{caption}
				</div>
			) : null}
		</div>
	);
}
