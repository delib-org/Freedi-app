import React, { useState } from 'react';

interface SafeTextareaProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
}

const SafeTextarea: React.FC<SafeTextareaProps> = ({
    value,
    onChange,
    onSubmit,
    placeholder = 'Write something...',
    rows = 3,
    disabled = false,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCheckAndSubmit = async () => {
        if (!value.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/your-backend-function-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: value }),
            });

            const result = await response.json();

            if (result.allowed) {
                onSubmit();
            } else {
                setError('Comment blocked: inappropriate content.');
            }
        } catch (err) {
            setError('Error checking content.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                disabled={isSubmitting || disabled}
            />
            <button onClick={handleCheckAndSubmit} disabled={isSubmitting || !value.trim()}>
                Submit
            </button>
            {error && <p style={{ color: 'red', fontSize: '0.8rem' }}>{error}</p>}
        </div>
    );
};

export default SafeTextarea;
