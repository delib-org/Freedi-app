'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownRenderer.module.scss';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with GitHub Flavored Markdown support.
 * Supports headings, bold, italic, lists, links, images, tables, and code blocks.
 */
export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`${styles.markdown} ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
