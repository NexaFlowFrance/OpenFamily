/**
 * Operator recovery for sign-in, run on the server itself:
 *
 *   node dist/scripts/authAdmin.js set-password --email someone@example.org   (from server/)
 *   node dist/scripts/authAdmin.js unlink-sso   --id <account uuid>
 *
 * In Docker: docker compose exec server node server/dist/scripts/authAdmin.js ...
 *
 * Typical use: an SSO-only server whose identity provider is down. Turn
 * PASSWORD_LOGIN_ENABLED back on, restart, then give an account a password.
 *
 * The password is only ever typed at the terminal prompt, never passed as an
 * argument, so it cannot end up in shell history or the process list. Both
 * commands sign the account out of every device.
 */
import readline from 'node:readline';
import bcrypt from 'bcrypt';
import pool, { query, withTransaction } from '../db';
import { revokeUserSessions } from '../lib/authTokens';
import { normalizeEmail } from '../lib/normalize';
import { isAcceptablePassword, MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

const USAGE = `Usage:
  authAdmin set-password (--email <email> | --id <uuid>)
  authAdmin unlink-sso   (--email <email> | --id <uuid>)`;

class UsageError extends Error {}

interface Args {
    command: 'set-password' | 'unlink-sso';
    email?: string;
    id?: string;
}

const parseArgs = (argv: string[]): Args => {
    const [command, ...rest] = argv;
    if (command !== 'set-password' && command !== 'unlink-sso') throw new UsageError(USAGE);
    const args: Args = { command };
    for (let i = 0; i < rest.length; i += 2) {
        const value = rest[i + 1];
        if (!value) throw new UsageError(USAGE);
        if (rest[i] === '--email') args.email = value;
        else if (rest[i] === '--id') args.id = value;
        else throw new UsageError(USAGE);
    }
    if (Boolean(args.email) === Boolean(args.id)) throw new UsageError(USAGE);
    return args;
};

const ask = (question: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
};

const askHidden = (question: string): Promise<string> => new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
        for (const char of chunk) {
            if (char === '\r' || char === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off('data', onData);
                process.stdout.write('\n');
                resolve(value);
                return;
            }
            if (char === '\u0003') process.exit(130);
            if (char === '\u007f') value = value.slice(0, -1);
            else value += char;
        }
    };
    stdin.on('data', onData);
});

interface Account {
    id: string;
    email: string;
    name: string;
    role: string;
    is_owner: boolean;
    has_password: boolean;
    sso_linked: boolean;
}

const findAccount = async (args: Args): Promise<Account> => {
    const where = args.id ? 'id = $1' : 'LOWER(email) = $1';
    const { rows } = await query(
        `SELECT id, email, name, role, (family_owner_id IS NULL) AS is_owner,
                (password_hash IS NOT NULL) AS has_password,
                EXISTS (SELECT 1 FROM user_identities WHERE user_id = users.id) AS sso_linked
         FROM users WHERE ${where}`,
        [args.id ?? normalizeEmail(args.email!)],
    );
    if (rows.length === 0) throw new Error('No account matches.');
    if (rows.length > 1) throw new Error('Several accounts match this email (they differ only by case). Use --id.');
    return rows[0] as Account;
};

const run = async (args: Args): Promise<void> => {
    const account = await findAccount(args);
    console.log(`Account ${account.id}`);
    console.log(`  name:     ${account.name}`);
    console.log(`  email:    ${account.email}`);
    console.log(`  role:     ${account.role} (${account.is_owner ? 'family owner' : 'family member'})`);
    console.log(`  password: ${account.has_password ? 'yes' : 'no'}`);
    console.log(`  SSO:      ${account.sso_linked ? 'linked' : 'not linked'}`);

    if (args.command === 'set-password') {
        if (account.has_password) {
            console.log('This account already has a password. It will be replaced.');
        }
        if ((await ask('Type the account email to confirm: ')).toLowerCase() !== account.email.toLowerCase()) {
            throw new Error('Not confirmed. Nothing changed.');
        }
        const password = await askHidden('New password: ');
        if (!isAcceptablePassword(password)) throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing changed.`);
        if ((await askHidden('Repeat the password: ')) !== password) throw new Error('The passwords differ. Nothing changed.');

        const hash = await bcrypt.hash(password, 12);
        await withTransaction(async (tx) => {
            await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, account.id]);
            await revokeUserSessions(tx, [account.id], 'admin_set_password');
        });
        console.log(`Password ${account.has_password ? 'replaced' : 'set'}. The account is signed out everywhere.`);
        return;
    }

    if (!account.sso_linked) throw new Error('This account is not linked to SSO. Nothing changed.');
    if (!account.has_password) {
        console.log('This account has no password: after unlinking, nobody can sign in to it until one is set.');
    }
    if ((await ask('Type the account email to confirm: ')).toLowerCase() !== account.email.toLowerCase()) {
        throw new Error('Not confirmed. Nothing changed.');
    }
    await withTransaction(async (tx) => {
        await tx.query('DELETE FROM user_identities WHERE user_id = $1', [account.id]);
        await revokeUserSessions(tx, [account.id], 'admin_unlink_sso');
    });
    console.log('SSO unlinked. The account is signed out everywhere.');
};

const main = async () => {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            throw new Error('Run this command from an interactive terminal (with docker compose exec, keep the default -it).');
        }
        await run(args);
        process.exitCode = 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = error instanceof UsageError ? 2 : 1;
    } finally {
        await pool.end();
    }
};

void main();
