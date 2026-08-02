"""Force <br> on the metadata lines at the top of a report (bold-led lines in the
header block). Pandoc's gfm reader treats single newlines as spaces, which would
collapse 'Authors / Artefacts / Companion' onto one run-on line."""
import sys
src, dst = sys.argv[1], sys.argv[2]
lines = open(src, encoding='utf-8').read().split('\n')
for i, ln in enumerate(lines[:16]):
    if ln.startswith('**') and not ln.rstrip().endswith('  '):
        lines[i] = ln.rstrip() + '  '
open(dst, 'w', encoding='utf-8').write('\n'.join(lines))
