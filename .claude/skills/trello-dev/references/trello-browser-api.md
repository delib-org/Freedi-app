# Trello through Claude in Chrome

No API key. The board tab is logged in as Tal, so in-page `fetch('/1/...')` with
`credentials: 'include'` reads everything, and writes work when the body carries the `dsc`
cookie value (Trello's CSRF token). Run every snippet with `mcp__claude-in-chrome__javascript_tool`
in the board tab (open `https://trello.com/b/<boardShortLink>/...` first).

Load the tools once:

```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__tabs_close_mcp"
```

Rules that keep this cheap and safe:

- Return **short links** (8 chars), names and counts - never raw 24-hex ids. The tool output
  masks long hex/base64 strings as `[BLOCKED ...]`, so an id you print is an id you cannot
  use. Every snippet below resolves list names → ids inside the page.
- Lists are addressed by **name** (case-insensitive). Cards by **shortLink**.
- One `javascript_tool` call per logical step; batch several writes in one call when they
  are independent.
- Close the tab when the batch is done.

## Helpers (paste at the top of each call; the page does not keep state between calls)

```js
const BOARD = location.pathname.split('/')[2];
const dsc = document.cookie.match(/(?:^|; )dsc=([^;]+)/)?.[1];
const api = (p, init={}) => fetch('/1/'+p, {credentials:'include', ...init}).then(async r => {
  if (!r.ok) throw new Error(`${init.method||'GET'} ${p} → ${r.status} ${await r.text()}`);
  return r.json();
});
const json = (body) => ({ headers: {'content-type':'application/json'}, body: JSON.stringify({...body, dsc}) });
const board = () => api(`boards/${BOARD}?lists=open&list_fields=name&cards=open&card_fields=name,idList,shortLink,labels,desc,dateLastActivity`);
const listId = (b, name) => { const l = b.lists.find(l => l.name.toLowerCase() === name.toLowerCase()); if (!l) throw new Error('no list '+name); return l.id; };
```

## Read the board (one line per card)

```js
/* helpers */
const b = await board();
const ln = Object.fromEntries(b.lists.map(l => [l.id, l.name]));
({ board: b.name, lists: b.lists.map(l => `${l.name} (${b.cards.filter(c=>c.idList===l.id).length})`),
   cards: b.cards.filter(c => ['Sprint backlog','doing'].includes(ln[c.idList]))
     .map(c => `${c.shortLink} | ${ln[c.idList]} | ${c.name} | ${c.labels.map(l=>l.name).join(',')}`) })
```

Change the list filter to `['Backlog']` when Tal asks for backlog cards.

## Card detail (description, checklist, comments) - read before Step 2

```js
/* helpers */
const c = await api(`cards/SHORTLINK?fields=name,desc,labels,due&checklists=all&checklist_fields=name&checkItem_fields=name,state&actions=commentCard&actions_limit=20&members=true&member_fields=username`);
({ name: c.name, desc: c.desc, labels: c.labels.map(l=>l.name), due: c.due,
   checklists: c.checklists.map(ch => ({ name: ch.name, items: ch.checkItems.map(i => `[${i.state==='complete'?'x':' '}] ${i.name}`) })),
   comments: c.actions.map(a => `${a.date.slice(0,10)} ${a.memberCreator.username}: ${a.data.text}`) })
```

Comments are newest first. A comment starting with "Started by Claude" means a session owns
the card.

## Move a card to a list (by list name) and comment

```js
/* helpers */
const b = await board();
const moves = [ ['SHORTLINK1', 'doing', 'Started by Claude session 2026-10-15: <plan>, branch feat/<slug>'] ];
for (const [card, list, text] of moves) {
  await api(`cards/${card}`, { method:'PUT', ...json({ idList: listId(b, list) }) });
  if (text) await api(`cards/${card}/actions/comments`, { method:'POST', ...json({ text }) });
}
moves.map(m => m[0] + ' → ' + m[1])
```

Same snippet for **done** with the done-comment from SKILL.md Step 4. Use a template
literal for multi-line comments; Trello renders Markdown.

## Other writes you may need

```js
// comment only
await api(`cards/SHORTLINK/actions/comments`, { method:'POST', ...json({ text: 'Partly done: ...' }) });

// create a card (new Backlog card for a pre-existing failure found on the way)
const b = await board();
const nc = await api('cards', { method:'POST', ...json({ idList: listId(b,'Backlog'), name: 'Title', desc: 'Repro...\n\nFound while doing SHORTLINK', pos: 'top' }) });
nc.shortLink

// tick a checklist item
const c = await api(`cards/SHORTLINK?checklists=all&checkItem_fields=name,state`);
const item = c.checklists.flatMap(ch => ch.checkItems).find(i => i.name.includes('TEXT'));
await api(`cards/SHORTLINK/checkItem/${item.id}`, { method:'PUT', ...json({ state:'complete' }) });

// add an existing label by name
const labels = await api(`boards/${BOARD}/labels`);
const lab = labels.find(l => l.name === 'agora');
await api(`cards/SHORTLINK/idLabels`, { method:'POST', ...json({ value: lab.id }) });
```

## Failure modes

- `CDP Runtime.evaluate timed out` / tab frozen → the heavy board UI hangs the renderer
  after a while. Open `https://trello.com/robots.txt` in a fresh tab instead and run the
  snippets there (same origin, same cookies, no board UI; hardcode `BOARD = 'u6sHplpi'`).
  Check card state before retrying a write: a timed-out call may or may not have run.

- `401` on read → the tab is not logged in; ask Tal to log in to Trello in Chrome.
- `400 invalid token` / `unauthorized` on write → `dsc` cookie missing; reload the board
  tab and retry once. Do not ask Tal for an API key - he chose the cookie route on purpose.
- Board JSON (`/b/<id>.json`) is 401 for anonymous and not needed; always use `/1/`.
