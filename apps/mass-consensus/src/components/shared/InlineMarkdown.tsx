'use client';

import React from 'react';

interface InlineMarkdownProps {
  text: string;
  className?: string;
}

/**
 * Renders inline markdown (bold and italic) without block-level styling.
 * Supports **bold**, *italic*, and ***bold italic*** syntax.
 * Use this for labels, options, and short text where block-level markdown is not needed.
 */
export default function InlineMarkdown({ text, className }: InlineMarkdownProps) {
  const parseInlineMarkdown = (input: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let key = 0;

    // Pattern matches: ***bold italic***, **bold**, *italic*
    // Order matters - check for *** first, then **, then *
    const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(input)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push(input.slice(lastIndex, match.index));
      }

      // Determine which group matched
      if (match[2]) {
        // ***bold italic***
        result.push(
          <strong key={key++}>
            <em>{match[2]}</em>
          </strong>
        );
      } else if (match[3]) {
        // **bold**
        result.push(<strong key={key++}>{match[3]}</strong>);
      } else if (match[4]) {
        // *italic*
        result.push(<em key={key++}>{match[4]}</em>);
      }

      lastIndex = pattern.lastIndex;
    }

    // Add remaining text
    if (lastIndex < input.length) {
      result.push(input.slice(lastIndex));
    }

    return result;
  };

  return <span className={className}>{parseInlineMarkdown(text)}</span>;
}
