import React, { useState } from 'react';
import Textarea from '@/view/components/textarea/Textarea';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/controllers/db/config';

const checkProfanity = httpsCallable<{ text: string }, { score: number }>(functions, 'checkProfanity');

interface Props {
    name: string;
    label?: string;
    placeholder?: string;
    maxLength?: number;
    onValidChange: (cleanText: string) => void;
}

const ProfanityControlledTextarea: React.FC<Props> = ({
    name,
    label,
    placeholder,
    maxLength,
    onValidChange,
}) => {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleChange = async (text: string) => {
        setValue(text);
        setError(null);

        try {
            const response = await checkProfanity({ text });
            const { score } = response.data;

            if (score !== null && score > 0.7) {
                setError('Inappropriate content detected');
                onValidChange(''); // Optional: clear parent value
            } else {
                onValidChange(text);
            }
        } catch (err) {
            console.error('Profanity check failed:', err);
            setError('Error checking content');
        }
    };

    return (
        <div>
            <Textarea
                name={name}
                label={label}
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                maxLength={maxLength}
            />
            {error && <div style={{ color: 'red' }}>{error}</div>}
        </div>
    );
};

export default ProfanityControlledTextarea;
