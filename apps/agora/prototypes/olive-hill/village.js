import * as THREE from './vendor/three.module.js';
import { buildWritingDesk } from './writing-desks.js';
import { buildCharacters } from './characters-2d.js';

/** The village square every path leads to, and every booth board faces. */
export const CENTER = { x: 0, z: 15 };

/**
 * The places that exist in every village, whatever the lesson's plan: the
 * library (learning), the study house (the meeting point / lobby) and the
 * council (the scoreboard, the vote, the decision). Every QUESTION of the
 * plan gets a booth of its own — see `boothLayout` — so the stations list is
 * completed at runtime from the session's plan.
 */
export const fixedStations = [
	{ id: 'library', name: 'הספרייה', short: 'לומדים יחד', guide: 'בית של ידע', question: 'פותחים ספר ומגלים את הסיפור, הדמויות והצרכים.', x: -23, z: 15, ax: -19.8, az: 15, icon: '▤' },
	{ id: 'challenge', name: 'בית המדרש', short: 'האתגר', guide: 'נועם · חושבים יחד', question: 'מה אנחנו יודעים, ומה עוד חשוב לברר?', x: -13, z: 6, ax: -10, az: 12, icon: '⌂' },
	{ id: 'council', name: 'מועצת הכפר', short: 'מחליטים יחד', guide: 'חכמי הכפר', question: 'על הלוח הגדול: כל ההצעות במגרש, השער, ובזמן ההצבעה — הקלפי.', x: 14, z: 5, ax: 11.2, az: 10.6, icon: '◒', look: { x: 14.6, z: 1.4 }, pitch: .06 },
];

/** What each kind of question booth is called and coloured. */
export const BOOTH_KINDS = {
	story: { name: 'ביתן הסיפורים', roof: '#b06a55', icon: '❧', prompt: 'כותבים סיפור אישי על הפתק שעל השולחן, וקוראים את הסיפורים של החברים על הלוח.' },
	needs: { name: 'ביתן הצרכים', roof: '#6c8a9c', icon: '✧', prompt: 'כותבים מה חשוב לכם, ומסמנים על הלוח עד כמה הצרכים של החברים חשובים גם לכם.' },
	vision: { name: 'ביתן החזון', roof: '#8b7aa8', icon: '☼', prompt: 'כותבים איך הייתם רוצים שזה ייראה, ומסמנים על הלוח עד כמה גם אתם רוצים את החזון של החברים.' },
	open: { name: 'ביתן השאלה', roof: '#9c8a4e', icon: '?', prompt: 'כותבים את התשובה שלכם על הפתק, ומדרגים על הלוח את התשובות של החברים.' },
	proposal: { name: 'ביתן הפתרונות', roof: '#6f8a5a', icon: '✎', prompt: 'כותבים הצעה על הפתק, מדרגים את ההצעות של החברים על הלוח ומציעים להם שיפורים.' },
};

/**
 * Where N booths stand: on a ring around the square, spread over the arc the
 * fixed buildings leave free (east → south → south-west), far enough apart
 * that two pavilions never touch. The ring widens with the count so the gap
 * between neighbours stays at least a pavilion wide.
 */
export function boothLayout(count) {
	const radius = Math.max(15, 6.5 + count * 2.2);
	const first = 12, last = 152;
	const step = count > 1 ? (last - first) / (count - 1) : 0;

	return Array.from({ length: count }, (_, i) => {
		const angle = ((count > 1 ? first + step * i : 82) * Math.PI) / 180;
		const x = CENTER.x + Math.cos(angle) * radius, z = CENTER.z + Math.sin(angle) * radius;
		// Face the square: the local +z axis points at the centre.
		const facing = Math.atan2(CENTER.x - x, CENTER.z - z);
		const toward = { x: Math.sin(facing), z: Math.cos(facing) };

		return { x, z, facing, ax: x + toward.x * 5.6, az: z + toward.z * 5.6 };
	});
}

export function buildVillage({ scene, height, manager }) {
	const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: .93 });
	const limestone = material('#d8c7a5'), wood = material('#70543b'), paper = material('#f5edda');
	const solids = [];
	const make = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
	const box = (w, h, d, mat, p, x, y, z) => make(new THREE.BoxGeometry(w, h, d), mat, p, x, y, z);
	function floor(x, z, r) { const g = new THREE.Group(); g.position.set(x, height(x, z) + .045, z); scene.add(g); make(new THREE.CylinderGeometry(r, r, .14, 48), limestone, g, 0, 0, 0); return g; }
	function table(g, x, z) { box(1.7, .12, .85, wood, g, x, .92, z); for (const dx of [-.7, .7]) for (const dz of [-.3, .3]) box(.1, .92, .1, wood, g, x + dx, .42, z + dz); box(.65, .012, .43, paper, g, x, .991, z); }
	function bench(g, x, z, angle = 0) { const b = new THREE.Group(); b.position.set(x, .1, z); b.rotation.y = angle; g.add(b); box(1.5, .18, .55, limestone, b, 0, .5, 0); for (const dx of [-.55, .55]) box(.2, .5, .4, limestone, b, dx, .2, 0); }
	/** A painted sign; `text` shrinks to fit and may wrap once. */
	function signTexture(text, sub = '', locked = false) {
		const c = document.createElement('canvas'); c.width = 768; c.height = 192; const ctx = c.getContext('2d');
		ctx.fillStyle = locked ? '#d9d2c2' : '#f8edce'; ctx.fillRect(0, 0, 768, 192);
		ctx.strokeStyle = locked ? '#8d8c80' : '#686e49'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, 758, 182);
		ctx.fillStyle = locked ? '#6f7168' : '#384f36'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
		let size = 52; ctx.font = `bold ${size}px Arial`;
		while (ctx.measureText(text).width > 1380 && size > 26) { size -= 2; ctx.font = `bold ${size}px Arial`; }
		const words = text.split(/\s+/); const lines = [''];
		for (const word of words) { const trial = (lines[lines.length - 1] + ' ' + word).trim(); if (ctx.measureText(trial).width > 700 && lines[lines.length - 1]) lines.push(word); else lines[lines.length - 1] = trial; }
		if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].replace(/\s*\S+$/, ' …'); }
		const top = sub ? 70 : (lines.length === 1 ? 112 : 78);
		lines.forEach((line, i) => ctx.fillText(line, 384, top + i * (size + 6)));
		if (sub) { ctx.font = '28px Arial'; ctx.fillStyle = locked ? '#8a8b80' : '#5b6b52'; ctx.fillText(sub, 384, 166); }
		const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
	}
	function label(g, text, y = 3.7, sub = '') {
		const sign = make(new THREE.PlaneGeometry(3.5, .87), new THREE.MeshBasicMaterial({ map: signTexture(text, sub), side: THREE.DoubleSide }), g, 0, y, 2.7);
		sign.userData.setText = (next, nextSub = '', locked = false) => { sign.material.map?.dispose(); sign.material.map = signTexture(next, nextSub, locked); sign.material.needsUpdate = true; };
		return sign;
	}

	// The study house — the meeting point where the lobby opens.
	const study = floor(-13, 6, 4.4); box(7, 2.9, .45, limestone, study, 0, 1.5, -2.4); box(.4, 2.9, 4.8, limestone, study, -3.3, 1.5, 0); box(7.4, .3, 5.3, limestone, study, 0, 3.12, 0);
	for (const x of [-3.05, -1.1, 1.1, 3.05]) { make(new THREE.CylinderGeometry(.17, .23, 2.85, 12), limestone, study, x, 1.55, 2.25); box(.55, .18, .55, limestone, study, x, 2.98, 2.25); } for (const x of [-1.8, 1.8]) table(study, x, .7); label(study, 'בית המדרש'); solids.push({ x: -13, z: 3.6, w: 3.7, d: .5 });
	// An open-front library: warm stone, timber shelves and a reading desk.
	const library = floor(-23, 15, 4.7); library.rotation.y = Math.PI / 2;
	box(7.8, .22, 6.6, wood, library, 0, .15, 0);
	box(7.8, 3.8, .35, limestone, library, 0, 1.95, -2.8);
	for (const x of [-3.7, 3.7]) box(.3, 3.8, 5.8, limestone, library, x, 1.95, 0);
	box(8.2, .28, 6.5, wood, library, 0, 4, 0);
	for (const x of [-3.35, 3.35]) make(new THREE.CylinderGeometry(.19, .24, 3.7, 12), limestone, library, x, 1.95, 2.6);
	for (const x of [-2.3, 0, 2.3]) {
		box(2.1, 3, .16, wood, library, x, 1.9, -2.5);
		for (let row = 0; row < 3; row++) {
			box(2.1, .1, .55, wood, library, x, .65 + row * .9, -2.25);
			for (let i = 0; i < 9; i++) { const h = .45 + (i % 3) * .09; box(.14, h, .33, material(['#687e69', '#af7d62', '#d2b77c', '#6f8297'][i % 4]), library, x - .85 + i * .2, .72 + row * .9 + h / 2, -2.22); }
		}
	}
	table(library, 0, .7); label(library, 'הספרייה', 3.55);
	const openBook = new THREE.Group(); openBook.position.set(0, 1.03, .7); library.add(openBook);
	for (const side of [-1, 1]) { const page = box(.4, .035, .48, paper, openBook, side * .2, 0, 0); page.rotation.z = side * .14; }
	solids.push({ x: -25.8, z: 15, w: .25, d: 4 });

	// The council: benches in a half circle around the speaker's stone, and the
	// big scoreboard behind it, facing the square.
	const council = floor(14, 5, 5.6); for (let row = 0; row < 2; row++) for (let i = 0; i < 9; i++) { const a = Math.PI * .12 + i / 8 * Math.PI * .76, r = 3.3 + row * 1.25; bench(council, Math.cos(a) * r, -Math.sin(a) * r, -a + Math.PI / 2); } make(new THREE.CylinderGeometry(1.0, 1.1, .55, 24), limestone, council, 0, .28, 0); label(council, 'מועצת הכפר', 3.8); for (const x of [-2.6, 2.6]) box(.16, 3.7, .16, wood, council, x, 1.8, 2.7);

	const square = floor(0, 15, 5.2); make(new THREE.TorusGeometry(1.05, .18, 8, 32).rotateX(Math.PI / 2), limestone, square, 0, .55, 0); make(new THREE.CylinderGeometry(1, 1, .48, 32), limestone, square, 0, .25, 0); make(new THREE.CircleGeometry(.87, 32).rotateX(-Math.PI / 2), material('#80a7a0'), square, 0, .51, 0);

	const pathMaterial = material('#c4b391');
	function path(station) {
		const verts = [], indices = [];
		for (let i = 0; i <= 24; i++) { const t = i / 24, x = THREE.MathUtils.lerp(CENTER.x, station.ax, t), z = THREE.MathUtils.lerp(CENTER.z, station.az, t); const dx = station.ax - CENTER.x, dz = station.az - CENTER.z, l = Math.hypot(dx, dz) || 1; for (const side of [-1, 1]) { const px = x + dz / l * .75 * side, pz = z - dx / l * .75 * side; verts.push(px, height(px, pz) + .035, pz); } if (i < 24) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
		const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setIndex(indices); geo.computeVertexNormals();

		return make(geo, pathMaterial, scene, 0, 0, 0);
	}
	for (const s of fixedStations) path(s);

	const characters = buildCharacters({ scene, height, manager });

	/**
	 * A question booth: a pavilion on a round stone floor — back wall, two
	 * posts, a tiled slab roof in the kind's colour, the sign over the front —
	 * with the writing desk in front and the board on the back wall, so the
	 * board looks out at the square through the open front.
	 */
	const booths = [];
	function buildBooth(spec, slot, index) {
		const group = floor(slot.x, slot.z, 4.2); group.rotation.y = slot.facing; group.name = `booth-${spec.itemId}`;
		const kind = BOOTH_KINDS[spec.kind] ?? BOOTH_KINDS.open;
		const roof = material(kind.roof);
		box(7.2, 3.1, .42, limestone, group, 0, 1.6, -2.9);
		for (const x of [-3.4, 3.4]) box(.42, 3.1, 2.4, limestone, group, x, 1.6, -1.8);
		for (const x of [-3.15, 3.15]) { make(new THREE.CylinderGeometry(.17, .23, 3.2, 12), limestone, group, x, 1.65, 2.3); box(.55, .18, .55, limestone, group, x, 3.3, 2.3); }
		const slab = box(8, .3, 6.2, roof, group, 0, 3.5, -.2); slab.rotation.x = .07;
		for (let i = 0; i < 7; i++) box(8.1, .07, .18, wood, group, 0, 3.66, -3 + i * .95);
		// A pennant on the roof for the booth the class is at right now.
		const pennantMat = new THREE.MeshBasicMaterial({ color: '#e6b84a', side: THREE.DoubleSide });
		const pennant = make(new THREE.PlaneGeometry(.9, .55), pennantMat, group, 0, 4.55, -.2); pennant.castShadow = false;
		box(.06, 1.4, .06, wood, group, -.45, 4.3, -.2);
		pennant.visible = false;
		// A lantern hanging from the roof: lit while the booth is open.
		const lantern = make(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a' }), group, 2.2, 3.05, 1.6); lantern.castShadow = false;
		box(.04, .3, .04, wood, group, 2.2, 3.3, 1.6);
		// The board on the back wall, facing the square.
		box(3.6, 2.2, .14, wood, group, 0, 1.95, -2.62);
		const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1536; boardCanvas.height = 900; const bc = boardCanvas.getContext('2d'); const bt = new THREE.CanvasTexture(boardCanvas); bt.colorSpace = THREE.SRGBColorSpace;
		const face = make(new THREE.PlaneGeometry(3.4, 2.0), new THREE.MeshBasicMaterial({ map: bt }), group, 0, 1.95, -2.54); face.castShadow = false;
		let lastKey = '';
		function paint(papers, state = {}) {
			const key = JSON.stringify([papers, state]); if (key === lastKey) return; lastKey = key;
			const locked = state.open === false;
			bc.fillStyle = locked ? '#7d7466' : '#9a805f'; bc.fillRect(0, 0, 1536, 900);
			bc.fillStyle = '#fff5dc'; bc.textAlign = 'center'; bc.direction = 'rtl'; bc.font = 'bold 54px Arial';
			bc.fillText(locked ? 'הביתן עדיין סגור' : 'הפתקים של הכיתה', 768, 78);
			if (locked) { bc.font = '34px Arial'; bc.fillText('ייפתח כשהמורה יגיע לשאלה הזאת', 768, 460); bt.needsUpdate = true; return; }
			if (!papers.length) { bc.font = '34px Arial'; bc.fillText('הפתקים שתכתבו כאן יופיעו על הלוח', 768, 460); bt.needsUpdate = true; return; }
			const shown = papers.slice(0, 6);
			shown.forEach((p, i) => {
				const x = 40 + (i % 3) * 500, y = 125 + Math.floor(i / 3) * 375;
				bc.save(); bc.translate(x + 235, y + 165); bc.rotate([-.018, .012, -.01, .016, -.015, .01][i]);
				bc.fillStyle = '#3a2f2740'; bc.fillRect(-229, -159, 470, 335);
				bc.fillStyle = p.own ? '#ffffff' : ['#f0dcd6', '#dbe7cf', '#d7dfee', '#ecdcf0'][i % 4]; bc.fillRect(-235, -165, 470, 335);
				bc.fillStyle = '#334635'; bc.textAlign = 'right'; bc.font = 'bold 29px Arial';
				bc.fillText(p.own ? 'הפתק שלי' : (p.author || `פתק ${i + 1}`), 210, -118);
				bc.font = '29px Arial'; let line = '', row = -68;
				for (const word of String(p.text).split(/\s+/)) { if (bc.measureText(line + word).width > 415) { bc.fillText(line, 210, row); row += 41; line = ''; if (row > 120) { line = '…'; break; } } line += word + ' '; }
				bc.fillText(line, 210, row); bc.restore();
			});
			if (papers.length > shown.length) { bc.fillStyle = '#fff5dc'; bc.textAlign = 'center'; bc.font = '30px Arial'; bc.fillText(`ועוד ${papers.length - shown.length} פתקים על הלוח הגדול`, 768, 880); }
			bt.needsUpdate = true;
		}
		paint([]);
		const sign = label(group, spec.label, 3.95, kind.name);
		const station = { id: `booth:${spec.itemId}`, itemId: spec.itemId, kind: spec.kind, name: spec.label, short: kind.name, guide: kind.name, question: kind.prompt, x: slot.x, z: slot.z, ax: slot.ax, az: slot.az, icon: kind.icon, booth: true };
		// The desk sits in front of the pavilion, off to the side so it never
		// hides the board from the square.
		const deskX = slot.x + Math.sin(slot.facing) * 1.9 - Math.cos(slot.facing) * 1.4, deskZ = slot.z + Math.cos(slot.facing) * 1.9 + Math.sin(slot.facing) * 1.4;
		const desk = buildWritingDesk({ scene, station: { ...station, x: deskX, z: deskZ, ax: slot.ax, az: slot.az }, height, at: { x: deskX, z: deskZ }, facing: slot.facing + Math.PI });
		solids.push({ ...desk.solid, booth: true });
		// The back wall keeps the walker out of the pavilion's far side.
		const back = { x: slot.x - Math.sin(slot.facing) * 2.6, z: slot.z - Math.cos(slot.facing) * 2.6 };
		solids.push({ x: back.x, z: back.z, w: 2.2, d: 2.2, booth: true });
		path(station);
		const guide = characters.assign(index, { x: slot.x + Math.sin(slot.facing) * 2.4 + Math.cos(slot.facing) * 2.6, z: slot.z + Math.cos(slot.facing) * 2.4 - Math.sin(slot.facing) * 2.6, station: station.id });
		const booth = {
			spec, station, group, face, paint, desk, guide,
			setState(next) {
				this.state = next;
				pennant.visible = next.current === true;
				lantern.material.color.set(next.open === false ? '#8a8378' : '#ffd27a');
				sign.userData.setText(next.label ?? spec.label, next.open === false ? 'ייפתח בהמשך המפגש' : kind.name, next.open === false);
			},
		};
		booths.push(booth);

		return booth;
	}

	/**
	 * (Re)build the booths from the plan. Called when the shell first sends the
	 * plan and again only if the SET of questions changes — a lesson's plan is
	 * fixed once it starts, so in practice this runs once per page.
	 */
	function installBooths(specs) {
		for (const booth of booths) { scene.remove(booth.group); scene.remove(booth.desk.group); }
		booths.length = 0;
		characters.release();
		for (let i = solids.length - 1; i >= 0; i--) if (solids[i].booth) solids.splice(i, 1);
		const slots = boothLayout(specs.length);
		specs.forEach((spec, i) => { buildBooth(spec, slots[i], i); });

		return booths;
	}

	// The council's scoreboard: wide, high, and turned toward the square.
	const scoreboard = (() => {
		const g = new THREE.Group(); const s = fixedStations[2];
		const cx = s.look.x, cz = s.look.z;
		g.position.set(cx, height(cx, cz) + .05, cz); g.rotation.y = Math.atan2(CENTER.x - cx, CENTER.z - cz); scene.add(g);
		box(6.2, 3.6, .18, wood, g, 0, 3.4, 0); for (const x of [-2.8, 2.8]) box(.2, 5.4, .2, wood, g, x, 2.7, -.05);
		for (const y of [1.55, 5.25]) box(6.4, .16, .28, wood, g, 0, y, .04);
		const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1152; const ctx = canvas.getContext('2d'); const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
		const face = make(new THREE.PlaneGeometry(6.0, 3.4), new THREE.MeshBasicMaterial({ map: tex }), g, 0, 3.4, .1); face.castShadow = false;
		solids.push({ x: cx, z: cz, w: 1.4, d: 1.4 });
		let lastKey = '';
		function paint(model) {
			const key = JSON.stringify(model); if (key === lastKey) return; lastKey = key;
			ctx.direction = 'rtl'; ctx.textAlign = 'center';
			if (!model || model.mode === 'ballot') return paintBallot(model);
			paintPitch(model);
		}
		function paintPitch(model) {
			const W = 2048, H = 1152;
			ctx.fillStyle = '#1f2a24'; ctx.fillRect(0, 0, W, H);
			ctx.fillStyle = '#fff5dc'; ctx.font = 'bold 60px Arial';
			ctx.fillText(model?.goalOnly ? 'לוח התוצאות · רק מה שנכנס לשער' : 'לוח התוצאות של הכיתה', W / 2, 78);
			// The field: the class map — up = agreement, across = which camp.
			const fx = 150, fy = 120, fw = W - 300, fh = H - 260;
			const grad = ctx.createLinearGradient(0, fy, 0, fy + fh); grad.addColorStop(0, '#3d8f4f'); grad.addColorStop(.5, '#6c8f57'); grad.addColorStop(1, '#8f5a4a');
			ctx.fillStyle = grad; ctx.fillRect(fx, fy, fw, fh);
			ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 6; ctx.strokeRect(fx, fy, fw, fh);
			ctx.setLineDash([18, 14]); ctx.beginPath(); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke(); ctx.setLineDash([]);
			ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy); ctx.lineTo(fx + fw / 2, fy + fh); ctx.strokeStyle = '#ffffff55'; ctx.stroke();
			// The goal: top centre — BRIDGE_ZONE (lean ±0.44 → x 28..72%, percent ≥ 24 → y ≥ 62% from bottom).
			const gx = fx + fw * .28, gw = fw * .44, gy = fy, gh = fh * .38;
			ctx.fillStyle = model?.scoredAny ? '#ffffff30' : '#ffffff18'; ctx.fillRect(gx, gy, gw, gh);
			ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
			ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(gx + gw * i / 12, gy); ctx.lineTo(gx + gw * i / 12, gy + gh); ctx.stroke(); } for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * i / 6); ctx.lineTo(gx + gw, gy + gh * i / 6); ctx.stroke(); }
			ctx.fillStyle = '#fff'; ctx.font = 'bold 34px Arial'; ctx.fillText('⚽ השער · כל הכיתה מאחוריה', gx + gw / 2, gy + gh + 44);
			ctx.font = '30px Arial'; ctx.textAlign = 'left'; ctx.fillText(model?.leftLabel ?? '', fx + 16, fy + fh - 18); ctx.textAlign = 'right'; ctx.fillText(model?.rightLabel ?? '', fx + fw - 16, fy + fh - 18); ctx.textAlign = 'center';
			ctx.fillText('+100%', fx - 70, fy + 28); ctx.fillText('0%', fx - 70, fy + fh / 2 + 10); ctx.fillText('−100%', fx - 70, fy + fh - 6);
			const points = (model?.points ?? []).filter((p) => !p.unrated);
			if (!points.length) { ctx.font = '40px Arial'; ctx.fillStyle = '#fff5dc'; ctx.fillText(model?.goalOnly ? 'עדיין אין הצעה בתוך השער' : 'ברגע שתדרגו, ההצעות יופיעו על המגרש', W / 2, fy + fh * .62); }
			for (const p of points) {
				const x = fx + fw * ((p.lean + 1) / 2), y = fy + fh * (1 - (p.percent + 100) / 200), r = 30 + Math.min(20, p.raters * 3);
				ctx.beginPath(); ctx.arc(x + 4, y + 6, r, 0, Math.PI * 2); ctx.fillStyle = '#00000055'; ctx.fill();
				ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = p.mine ? '#ffffff' : p.color; ctx.fill();
				ctx.lineWidth = p.mine ? 8 : 4; ctx.strokeStyle = p.scored ? '#ffd83a' : '#1f2a24'; ctx.stroke();
				ctx.fillStyle = '#1f2a24'; ctx.font = `bold ${Math.round(r * 1.1)}px Arial`; ctx.fillText(String(p.rank), x, y + r * .4);
				if (p.scored) { ctx.font = `${Math.round(r * .9)}px Arial`; ctx.fillText('⚽', x + r * .9, y - r * .6); }
				if (p.lead) { ctx.font = `${Math.round(r * .9)}px Arial`; ctx.fillText('👑', x - r * .9, y - r * .7); }
			}
			ctx.fillStyle = '#fff5dc'; ctx.font = '34px Arial';
			ctx.fillText(model?.footer ?? '', W / 2, H - 30);
			tex.needsUpdate = true;
		}
		function paintBallot(model) {
			const W = 2048, H = 1152;
			ctx.fillStyle = '#20263a'; ctx.fillRect(0, 0, W, H);
			ctx.fillStyle = '#fff5dc'; ctx.font = 'bold 62px Arial'; ctx.fillText(model?.title ?? 'הצבעה', W / 2, 84);
			const rows = model?.candidates ?? [];
			if (!rows.length) { ctx.font = '40px Arial'; ctx.fillText('הקלפי עוד לא נפתחה', W / 2, H / 2); tex.needsUpdate = true; return; }
			const top = 140, gap = Math.min(150, (H - 260) / rows.length), barH = Math.min(96, gap - 24);
			rows.forEach((row, i) => {
				const y = top + i * gap;
				ctx.fillStyle = '#ffffff22'; ctx.fillRect(140, y, W - 280, barH);
				if (model.showResults) { ctx.fillStyle = row.mine ? '#ffd83a' : '#67c28a'; ctx.fillRect(140 + (W - 280) * (1 - row.share), y, (W - 280) * row.share, barH); }
				ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.font = `bold ${Math.round(barH * .42)}px Arial`;
				const text = `${row.number}. ${row.label}`; let shown = text; while (ctx.measureText(shown).width > W - 620 && shown.length > 4) shown = shown.slice(0, -4) + '…';
				ctx.fillText(shown, W - 160, y + barH * .66);
				ctx.textAlign = 'left'; ctx.fillText(model.showResults ? `${row.votes} · ${Math.round(row.share * 100)}%` : (row.mine ? '✓ ההצבעה שלי' : ''), 160, y + barH * .66);
				ctx.textAlign = 'center';
			});
			ctx.fillStyle = '#fff5dc'; ctx.font = '36px Arial'; ctx.fillText(model?.footer ?? '', W / 2, H - 34);
			tex.needsUpdate = true;
		}
		paint(null);

		return { group: g, face, paint };
	})();

	return { booths, installBooths, scoreboard, figures: characters.figures, solids, ready: characters.ready, tick: characters.tick, characters };
}
