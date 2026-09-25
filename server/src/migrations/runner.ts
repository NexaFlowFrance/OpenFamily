// Versioned migrations: each one runs exactly once, in its own transaction, and
// is recorded in openfamily_schema_migrations with a checksum of its SQL.
//
// This sits next to the historical list in db.ts, which stays as it is: every
// statement there is idempotent and keeps running on each start, as it always
// has. New schema changes go into migrations/registry.ts instead of that list.
//
// Rules for a migration once it has shipped:
// - never edit its SQL: the server refuses to start if an applied migration no
//   longer matches what was recorded, rather than guess which version the
//   database is in. Whitespace does not count, so reformatting is safe.
// - never reuse or rename its id. Fix a mistake with a new migration.

import { createHash } from 'crypto';
import type { PoolClient } from 'pg';

export interface Migration {
    /** Unique and permanent. Namespaced: 'core/0001-short-name'. */
    id: string;
    /** Run in order, in a single transaction. */
    statements: readonly string[];
}

export interface MigrationReport {
    applied: string[];
    alreadyApplied: number;
    /** Recorded in the database but unknown to this code: a newer version ran here. */
    unknown: string[];
}

export const MIGRATIONS_TABLE = 'openfamily_schema_migrations';

// Layout is not content: runs of whitespace collapse, and whitespace next to
// punctuation disappears, so re-indenting a statement or moving its columns onto
// separate lines keeps the same checksum.
const normalise = (sql: string) =>
    sql.replace(/\s+/g, ' ').replace(/\s*([(),;=])\s*/g, '$1').trim();

export const checksumOf = (migration: Migration): string => {
    const hash = createHash('sha256');
    for (const statement of migration.statements) {
        hash.update(normalise(statement));
        hash.update('\u0000');
    }
    return hash.digest('hex');
};

const ID_PATTERN = /^[a-z0-9-]+\/\d{4}-[a-z0-9-]+$/;

/** Catches mistakes in the registry itself before touching the database. */
export const validateRegistry = (migrations: readonly Migration[]): void => {
    const seen = new Set<string>();
    for (const migration of migrations) {
        if (!ID_PATTERN.test(migration.id)) {
            throw new Error(`Invalid migration id "${migration.id}": expected "<namespace>/<0001>-<name>"`);
        }
        if (seen.has(migration.id)) {
            throw new Error(`Duplicate migration id "${migration.id}"`);
        }
        if (migration.statements.length === 0) {
            throw new Error(`Migration "${migration.id}" has no statements`);
        }
        seen.add(migration.id);
    }
};

/**
 * Applies every registered migration not yet recorded. The caller holds the
 * migration lock and passes its client, so the whole run is serialised with
 * any other server instance starting at the same time.
 */
export const runVersionedMigrations = async (
    client: PoolClient,
    migrations: readonly Migration[]
): Promise<MigrationReport> => {
    validateRegistry(migrations);

    await client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            id TEXT PRIMARY KEY,
            checksum CHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            duration_ms INTEGER NOT NULL DEFAULT 0
        )
    `);

    const recorded = new Map<string, string>(
        (await client.query<{ id: string; checksum: string }>(`SELECT id, checksum FROM ${MIGRATIONS_TABLE}`))
            .rows.map((row) => [row.id, row.checksum])
    );

    const known = new Set(migrations.map((m) => m.id));
    const report: MigrationReport = {
        applied: [],
        alreadyApplied: 0,
        unknown: [...recorded.keys()].filter((id) => !known.has(id)).sort(),
    };

    for (const migration of migrations) {
        const checksum = checksumOf(migration);
        const previous = recorded.get(migration.id);

        if (previous !== undefined) {
            if (previous !== checksum) {
                throw new Error(
                    `Migration "${migration.id}" was applied with different SQL than this version ships. ` +
                    'Applied migrations must never be edited; add a new migration instead.'
                );
            }
            report.alreadyApplied += 1;
            continue;
        }

        const started = Date.now();
        await client.query('BEGIN');
        try {
            for (const statement of migration.statements) {
                await client.query(statement);
            }
            await client.query(
                `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, duration_ms) VALUES ($1, $2, $3)`,
                [migration.id, checksum, Date.now() - started]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Migration "${migration.id}" failed and was rolled back: ${reason}`);
        }
        report.applied.push(migration.id);
    }

    return report;
};
