# One visual language across the main app

The playful redesign applies to the application, not just its landing page or agreement overview.

- `_thinking-space.scss` owns the main-app palette: peach, lavender, mint and yellow, with matching dark-mode values. Its root aliases also reach body-mounted menus and dialogs. Existing agreement/opposition scale colors keep their meaning.
- Questions and groups use `SubGroupCard`: rounded panels, readable titles, separate conversation actions and a clear navigation button. Interactive controls are siblings of the title link, not nested inside it.
- Question lists use the available content width, expose an add-question action to administrators and collapse to one column on mobile.
- Buttons, forms, descriptions, creation dialogs, settings sections, notifications and Vote controls use the same surfaces, borders and spacing. Labels remain legible in dark mode; inputs no longer use the old pale-blue italic treatment.
- Account routes and other secondary protected pages share `AppThinkingSpace`. Statement/home routes retain their existing shell, avoiding nested navigation.

Use semantic palette variables rather than inline statement-type colors for app chrome. Reserve meaning-bearing colors for evaluation and map data. Keep RTL logical spacing, visible keyboard focus and reduced-motion support.

Verification: full main-app build and TypeScript/lint checks; browser review of the populated group list in Hebrew/light/dark/mobile, conversation, proposals, maps, settings, account page and the actual new-question dialog. Creation dialogs were opened without submitting new user content.
