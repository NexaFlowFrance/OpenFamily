// Home Assistant hands an app its settings as a JSON file, /data/options.json.
// This turns the ones OpenFamily knows into "NAME=value" lines, one per line,
// for the entrypoint to export. It reads the file on its standard input and
// prints nothing for a file it cannot read: the container then starts with
// its defaults, which is better than not starting.
'use strict';

// What the image decides for itself: a setting cannot move the database or
// the port from under it.
const OWNED = /^(POSTGRES_(HOST|PORT|USER|DB)|PGDATA|SERVER_PORT|SERVE_CLIENT_DIR|NODE_ENV|PATH|HOME|LANG)$/;
const NAME = /^[A-Z_][A-Z0-9_]*$/;
const oneLine = (value) => typeof value === 'string' && !/[\r\n\0]/.test(value);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
    let options;
    try {
        options = JSON.parse(input);
    } catch {
        return;
    }
    if (!options || typeof options !== 'object') return;

    const lines = [];
    if (typeof options.registration_enabled === 'boolean') {
        lines.push(`REGISTRATION_ENABLED=${options.registration_enabled}`);
    }
    // Any other documented setting (SMTP_HOST, APP_PUBLIC_URL, OIDC_ISSUER_URL...).
    for (const entry of Array.isArray(options.env_vars) ? options.env_vars : []) {
        if (!entry || typeof entry.name !== 'string' || !NAME.test(entry.name) || OWNED.test(entry.name)) continue;
        if (!oneLine(entry.value)) continue;
        lines.push(`${entry.name}=${entry.value}`);
    }
    if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
});
