import { useT } from '../../i18n/useT';
import { uploadImage } from '../../lib/admin';
import type { Flash } from './types';

export default function ImageField({
	label,
	value,
	gameId,
	onChange,
	flash,
}: {
	label: string;
	value: string | null | undefined;
	gameId: string;
	onChange: (url: string | null) => void;
	flash: Flash;
}) {
	const { t } = useT();

	async function upload(file: File): Promise<void> {
		try {
			const url = await uploadImage(gameId, file);
			onChange(url);
			flash(t('admin.image.uploaded'));
		} catch (error) {
			console.error('[Odyssey admin] upload failed', error);
			flash(t('admin.image.uploadFailed'));
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-[13px] text-[var(--gold-strong)] shrink-0">{label}</span>
			{value ? (
				<img
					src={value}
					alt=""
					className="w-10 h-10 rounded-lg object-cover border border-[rgba(232,185,88,0.6)]"
				/>
			) : null}
			<input
				type="text"
				value={value ?? ''}
				placeholder={t('admin.image.placeholder')}
				onChange={(event) => onChange(event.target.value || null)}
			/>
			<label className="btn-outline shrink-0 cursor-pointer">
				{t('admin.image.upload')}
				<input
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void upload(file);
					}}
				/>
			</label>
		</div>
	);
}
