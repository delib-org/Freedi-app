import { useState } from 'react';
import type { OdysseyValue } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';

export default function ValuesTab({
	values,
	busy,
	onSave,
}: {
	values: OdysseyValue[];
	busy: boolean;
	onSave: (values: OdysseyValue[]) => void;
}) {
	const { t } = useT();
	const [draft, setDraft] = useState<OdysseyValue[]>([...values]);

	return (
		<section className="panel flex flex-col gap-2">
			<p className="text-[13px] opacity-75 m-0">{t('admin.values.intro')}</p>
			{draft.map((value, index) => (
				<div key={value.valueId} className="flex items-center gap-2">
					<input
						type="text"
						value={value.label}
						onChange={(event) =>
							setDraft(
								draft.map((item, i) =>
									i === index ? { ...item, label: event.target.value } : item,
								),
							)
						}
					/>
					<input
						type="number"
						className="!w-20"
						value={value.sortOrder}
						title={t('admin.common.order')}
						onChange={(event) =>
							setDraft(
								draft.map((item, i) =>
									i === index ? { ...item, sortOrder: Number(event.target.value) } : item,
								),
							)
						}
					/>
					<button
						type="button"
						className="btn-outline shrink-0 !border-[#ff8a96] !text-[#ff8a96]"
						title={t('admin.common.remove')}
						onClick={() => setDraft(draft.filter((_, i) => i !== index))}
					>
						✕
					</button>
				</div>
			))}
			<div className="flex justify-center gap-3 mt-2">
				<button
					type="button"
					className="btn-outline"
					onClick={() =>
						setDraft([
							...draft,
							{
								valueId: `value-${Date.now()}`,
								label: '',
								sortOrder: draft.length + 1,
								enabled: true,
							},
						])
					}
				>
					{t('admin.values.add')}
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => onSave(draft.filter((value) => value.label.trim()))}
				>
					{t('admin.common.save')}
				</button>
			</div>
		</section>
	);
}
