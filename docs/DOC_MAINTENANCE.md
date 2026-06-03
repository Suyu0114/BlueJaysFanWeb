# Documentation maintenance — what to update when

> Living reference. When you change the project, several docs can drift. This is
> the trigger → files map so nothing gets missed. Beyond the obvious three
> (`CLAUDE.md`, `README.md`, `docs/DATA_MODEL.md`), the easily-forgotten ones are
> **`ETL_update_flow.md`**, **`docs/Pn_spec.md`**, **`.env.example`**, and the
> **i18n pair** (`web/messages/en.json` + `zh-TW.json`).

## Paste-as-a-prompt (run at the end of a change)

Drop this into the session once the code change is done:

> Before finishing, reconcile the docs with what I changed. Use
> `docs/DOC_MAINTENANCE.md` as the checklist: for each kind of change I made
> (schema/migration, ETL flow, feature/phase, new web file, env var, i18n string,
> fixed gap/invariant), update exactly the docs that row lists — and keep
> `CLAUDE.md` and `README.md` in sync where they overlap. Then show me a short
> summary of every doc you touched and flag any I should review.

## Trigger → files

| When you… | Update |
|---|---|
| Change schema / add a migration | **docs/DATA_MODEL.md** (mandatory, same change — it has the update rule + a verification recipe) · CLAUDE.md (migrations list in the folder layout + the "Schema is layered" line) · README.md (`db/migrations 001 → 00X`) |
| Add/alter an ETL script or the backfill / cron flow | **ETL_update_flow.md** (the runbook) · CLAUDE.md `/etl/` tree · README.md project layout · `.github/workflows/etl.yml` header comment if cron logic changes |
| Ship a feature / finish a phase | CLAUDE.md Phases table + folder layout · README.md Features + Status + layout · add **docs/Pn_spec.md** (and flip any now-resolved `DATA_MODEL.md` gaps to RESOLVED) |
| Add a web file (chart / lib / page) | CLAUDE.md folder layout · README.md project layout |
| Add an env var | **.env.example** · README.md (Environment + Deploy secrets table) · CLAUDE.md if it's a core var |
| Add / edit a UI string | **web/messages/en.json AND web/messages/zh-TW.json** together (English first; keep key parity; baseball jargon stays English) |
| Fix a documented gap / change an invariant | docs/DATA_MODEL.md (Known gaps / invariants) · the matching CLAUDE.md rule or ETL gotcha |

## Do NOT maintain (frozen / boilerplate)

- `~/.claude/plans/blue-jays-fan-piped-kurzweil.md` — original design archive,
  already diverged from the implementation; that's expected, leave it.
- `web/README.md` — stock `create-next-app` boilerplate; ignore (or delete).
- Shipped `docs/Pn_spec.md` (e.g. `P7_spec.md`) — point-in-time handoffs; only add
  a "resolved" cross-ref note if a later change touches them. Don't rewrite history.

## Caveat — known duplication

`CLAUDE.md` and `README.md` intentionally duplicate folder layout / tech stack /
phases / ETL gotchas, so several rows above mean editing **both**. That's the cost
of skipping the full doc-restructure; collapse them into single sources of truth
later if the double-edits get annoying.
