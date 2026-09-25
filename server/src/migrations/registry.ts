// Every schema change from 1.7.2 on goes here, appended at the end, never
// inserted, edited or removed once shipped. See runner.ts for the rules.
//
//   {
//       id: 'core/0001-short-description',
//       statements: [
//           'ALTER TABLE ... ',
//       ],
//   },
//
// Each migration runs once, inside a transaction, so it does not need to be
// idempotent (no IF NOT EXISTS required), and a failure leaves nothing behind.
// Ids are namespaced: 'core/' for this repository. A downstream build that
// carries its own migrations uses its own namespace and its own list.

import type { Migration } from './runner';

export const coreMigrations: readonly Migration[] = [];
