// NOTE: RichTextEditor, EditorToolbar and DescriptionEditor pull in TipTap +
// ProseMirror (~363 kB raw / 115 kB gzipped). Importing ParagraphsDisplay
// *through this barrel* drags all of that into the caller's chunk — which is
// how the editor ended up in the eager entry bundle, downloaded on every page
// load including /login. Import ParagraphsDisplay from its own module, and
// load the editors with React.lazy.
export { default as RichTextEditor } from './RichTextEditor';
export { default as EditorToolbar } from './EditorToolbar';
export { default as DescriptionEditor } from './DescriptionEditor';
export { default as ParagraphsDisplay } from './ParagraphsDisplay';
