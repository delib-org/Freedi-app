'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkColorTags from '@/lib/utils/remarkColorTags';
import styles from './MarkdownRenderer.module.scss';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with GitHub Flavored Markdown support.
 * Supports headings, bold, italic, lists, links, images, tables, and code blocks,
 * plus `(blue)coloured text(/blue)` — see remarkColorTags for the colour names.
 */
export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`${styles.markdown} ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkColorTags]}>{content}</ReactMarkdown>
    </div>
  );
}
