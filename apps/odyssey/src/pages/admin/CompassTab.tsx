import { useState } from 'react';
import type { OdysseyCompassQuestion } from '@freedi/shared-types';
import { useT } from '../../i18n/useT';

export default function CompassTab({
	questions,
	busy,
	onSave,
}: {
	questions: OdysseyCompassQuestion[];
	busy: boolean;
	onSave: (questions: OdysseyCompassQuestion[]) => void;
}) {
	const { t } = useT();
	const [draft, setDraft] = useState<OdysseyCompassQuestion[]>([...questions]);

	function update(index: number, patch: Partial<OdysseyCompassQuestion>): void {
		setDraft(draft.map((item, i) => (i === index ? { ...item, ...patch } : item)));
	}

	return (
		<section className="flex flex-col gap-4">
			{draft.map((question, index) => (
				<div key={question.questionId} className="panel flex flex-col gap-2">
					<div className="flex gap-2">
						<input
							type="text"
							value={question.title}
							placeholder={t('admin.compass.titlePlaceholder')}
							onChange={(event) => update(index, { title: event.target.value })}
						/>
						<input
							type="number"
							className="!w-24"
							value={question.sortOrder}
							title={t('admin.common.order')}
							onChange={(event) => update(index, { sortOrder: Number(event.target.value) })}
						/>
					</div>
					<textarea
						rows={2}
						value={question.prompt}
						placeholder={t('admin.compass.promptPlaceholder')}
						onChange={(event) => update(index, { prompt: event.target.value })}
					/>
					<input
						type="text"
						value={question.chips.join(', ')}
						placeholder={t('admin.compass.chipsPlaceholder')}
						onChange={(event) =>
							update(index, {
								chips: event.target.value
									.split(',')
									.map((chip) => chip.trim())
									.filter(Boolean),
							})
						}
					/>
					<label className="flex items-center gap-1.5 text-[14px]">
						<input
							type="checkbox"
							checked={question.enabled}
							onChange={(event) => update(index, { enabled: event.target.checked })}
						/>
						{t('admin.compass.enabled')}
					</label>
				</div>
			))}
			<div className="flex justify-center gap-3">
				<button
					type="button"
					className="btn-outline"
					onClick={() =>
						setDraft([
							...draft,
							{
								questionId: `q-${Date.now()}`,
								title: '',
								prompt: '',
								chips: [],
								sortOrder: draft.length + 1,
								enabled: true,
							},
						])
					}
				>
					{t('admin.compass.add')}
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => onSave(draft.filter((question) => question.title.trim()))}
				>
					{t('admin.common.save')}
				</button>
			</div>
		</section>
	);
}
