import { FC, useEffect, useState } from 'react';
import { setDoc } from 'firebase/firestore';
import {
	Statement,
	JoinFormConfig,
	JoinFormField,
	JoinFormFieldType,
	JoinFormDestination,
} from '@freedi/shared-types';
import { ClipboardList, Database, FileSpreadsheet, Plus, X } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { Checkbox } from '@/view/components/atomic/atoms/Checkbox';
import ToggleSwitch from './ToggleSwitch';
import styles from './JoinFormCard.module.scss';

interface JoinFormCardProps {
	statement: Statement;
}

type Translator = (key: string) => string;

function buildDefaultFields(t: Translator): JoinFormField[] {
	return [
		{ id: 'name', label: t('Name'), type: 'text', required: true },
		{ id: 'phone', label: t('Phone number'), type: 'phone', required: true },
		{ id: 'email', label: t('Email address'), type: 'email', required: false },
	];
}

function makeFieldId(label: string, existing: JoinFormField[]): string {
	const slug =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'field';
	let candidate = slug;
	let i = 1;
	while (existing.some((f) => f.id === candidate)) {
		candidate = `${slug}-${i++}`;
	}

	return candidate;
}

async function saveJoinForm(statement: Statement, config: JoinFormConfig): Promise<void> {
	try {
		const ref = createStatementRef(statement.statementId);
		await setDoc(ref, { statementSettings: { joinForm: config } }, { merge: true });
	} catch (error) {
		logError(error, {
			operation: 'JoinFormCard.saveJoinForm',
			statementId: statement.statementId,
		});
	}
}

const JoinFormCard: FC<JoinFormCardProps> = ({ statement }) => {
	const { t, currentLanguage } = useTranslation();

	const existing = statement.statementSettings?.joinForm;
	const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? false);
	const [destination, setDestination] = useState<JoinFormDestination>(
		existing?.destination ?? 'firestore',
	);
	const [sheetUrl, setSheetUrl] = useState<string>(existing?.sheetUrl ?? '');
	const [fields, setFields] = useState<JoinFormField[]>(
		existing?.fields && existing.fields.length > 0 ? existing.fields : buildDefaultFields(t),
	);
	const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');

	useEffect(() => {
		if (destination !== 'sheets') return;
		import('@/controllers/db/joinForm/getSheetServiceAccountEmail')
			.then((m) => m.getSheetServiceAccountEmail())
			.then((email) => setServiceAccountEmail(email ?? ''))
			.catch((error) => {
				logError(error, {
					operation: 'JoinFormCard.loadServiceAccountEmail',
					statementId: statement.statementId,
				});
			});
	}, [destination, statement.statementId]);

	const persist = (overrides?: Partial<JoinFormConfig>) => {
		const config: JoinFormConfig = {
			enabled,
			destination,
			sheetUrl: destination === 'sheets' ? sheetUrl : undefined,
			fields,
			// Remember which language the admin is saving in, so join-app
			// visitors see modal chrome that matches the stored field labels.
			formLanguage: currentLanguage,
			...overrides,
		};
		saveJoinForm(statement, config);
	};

	const handleToggleEnabled = (next: boolean) => {
		setEnabled(next);
		persist({ enabled: next });
	};

	const handleDestinationChange = (next: JoinFormDestination) => {
		setDestination(next);
		persist({ destination: next, sheetUrl: next === 'sheets' ? sheetUrl : undefined });
	};

	const handleSheetUrlBlur = () => {
		if (destination === 'sheets') persist({ sheetUrl });
	};

	const updateField = (index: number, patch: Partial<JoinFormField>) => {
		const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
		setFields(next);
		persist({ fields: next });
	};

	const addField = () => {
		const newField: JoinFormField = {
			id: makeFieldId('field', fields),
			label: t('New field'),
			type: 'text',
			required: false,
		};
		const next = [...fields, newField];
		setFields(next);
		persist({ fields: next });
	};

	const removeField = (index: number) => {
		const next = fields.filter((_, i) => i !== index);
		setFields(next);
		persist({ fields: next });
	};

	const copyEmail = () => {
		if (!serviceAccountEmail) return;
		navigator.clipboard.writeText(serviceAccountEmail).catch(() => {
			/* ignore — clipboard may be blocked */
		});
	};

	return (
		<div className={styles.joinFormCard}>
			<ToggleSwitch
				isChecked={enabled}
				onChange={handleToggleEnabled}
				label={t('Join form')}
				description={t(
					'Collect contact details the first time a user joins as activist or organizer.',
				)}
				icon={ClipboardList}
			/>

			{enabled && (
				<div className={styles.panel}>
					<div className={styles.panel__section}>
						<div className={styles.panel__label}>{t('Where should submissions be saved?')}</div>
						<div className={styles.destination}>
							<button
								type="button"
								className={`${styles.destination__option} ${
									destination === 'firestore' ? styles['destination__option--active'] : ''
								}`}
								onClick={() => handleDestinationChange('firestore')}
							>
								<Database size={18} />
								<span className={styles.destination__name}>
									{t('Firestore')}
									<small>{t('Default — stored in the app')}</small>
								</span>
							</button>
							<button
								type="button"
								className={`${styles.destination__option} ${
									destination === 'sheets' ? styles['destination__option--active'] : ''
								}`}
								onClick={() => handleDestinationChange('sheets')}
							>
								<FileSpreadsheet size={18} />
								<span className={styles.destination__name}>
									{t('Google Sheet')}
									<small>{t('Append each submission as a row')}</small>
								</span>
							</button>
						</div>
					</div>

					{destination === 'sheets' && (
						<div className={styles.panel__section}>
							<label className={styles.panel__label} htmlFor={`sheet-url-${statement.statementId}`}>
								{t('Google Sheet URL')}
							</label>
							<input
								id={`sheet-url-${statement.statementId}`}
								type="url"
								className={styles.input}
								value={sheetUrl}
								onChange={(e) => setSheetUrl(e.target.value)}
								onBlur={handleSheetUrlBlur}
								placeholder="https://docs.google.com/spreadsheets/d/..."
							/>
							{serviceAccountEmail && (
								<div className={styles.hint}>
									<span className={styles.hint__label}>
										{t('Share this sheet with this email (Editor access):')}
									</span>
									<div className={styles.hint__emailRow}>
										<code className={styles.hint__email}>{serviceAccountEmail}</code>
										<button
											type="button"
											className={styles.hint__copy}
											onClick={copyEmail}
											aria-label={t('Copy email')}
										>
											{t('Copy')}
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					<div className={styles.panel__section}>
						<div className={styles.panel__label}>{t('Form fields')}</div>
						<div className={styles.fields}>
							{fields.map((field, index) => (
								<div key={field.id} className={styles.fields__row}>
									<input
										className={styles.fields__label}
										type="text"
										value={field.label}
										onChange={(e) => updateField(index, { label: e.target.value })}
										placeholder={t('Field label')}
									/>
									<select
										className={styles.fields__type}
										value={field.type}
										onChange={(e) =>
											updateField(index, { type: e.target.value as JoinFormFieldType })
										}
									>
										<option value="text">{t('Text')}</option>
										<option value="phone">{t('Phone')}</option>
										<option value="email">{t('Email')}</option>
									</select>
									<div className={styles.fields__required}>
										<Checkbox
											id={`join-field-required-${statement.statementId}-${field.id}`}
											name={`join-field-required-${field.id}`}
											label={t('Required')}
											checked={field.required}
											size="small"
											onChange={(checked) => updateField(index, { required: checked })}
										/>
									</div>
									<button
										type="button"
										className={styles.fields__remove}
										onClick={() => removeField(index)}
										aria-label={t('Remove field')}
									>
										<X size={14} />
									</button>
								</div>
							))}
							<button type="button" className={styles.fields__add} onClick={addField}>
								<Plus size={14} />
								{t('Add field')}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default JoinFormCard;
