import { useState } from 'react';
import { compassArtUrl } from '../lib/compassArt';

/**
 * The emblem of one wind, beside its heading.
 *
 * Decorative: the wind's name is right next to it, so a screen reader that
 * announced the picture too would say everything twice.
 *
 * It removes itself if the file is missing. The emblems are art that arrives
 * after the code that places them, and a wind whose artwork has not landed yet
 * must look like a wind with no artwork — not like a broken page.
 */
export default function WindArt({ questionId }: { questionId: string }) {
	const src = compassArtUrl(questionId);
	const [broken, setBroken] = useState(false);

	if (!src || broken) return null;

	return (
		<span className="wind-art" aria-hidden="true">
			<img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
		</span>
	);
}
