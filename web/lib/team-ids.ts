// MLB Stats API team id of the Blue Jays, in a module with NO imports so client
// components (the P13 rank grid via standings-chrome) can use it without
// pulling lib/db.ts — and the postgres driver — into the browser bundle.
// lib/standings.ts re-exports it, so existing imports keep working.
export const TORONTO_TEAM_ID = 141;
