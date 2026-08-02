<?php
/**
 * OpenFamily Cloud — waiting-list endpoint (shared hosting friendly, no database).
 *
 * Deploy: upload this file next to index.html on the host serving openfamily.fr.
 * It answers JSON to the form in the "Cloud" section of the landing page.
 *
 * Storage: one JSON object per line, in a file kept OUTSIDE the web root so the
 * address list is never downloadable. Override the path in config.php:
 *
 *     <?php  return ['storage' => '/home/uXXXX/waitlist/waitlist.jsonl',
 *                    'notify'  => 'contact@nexaflow.fr'];
 *
 * config.php is optional and must NOT be committed (it is gitignored).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const MAX_PER_IP_PER_HOUR = 5;
// ~45 000 records. Far beyond a pre-launch list, and small enough that the
// dedupe scan can never become the thing that takes the hosting account down.
const MAX_STORAGE_BYTES = 5 * 1024 * 1024;

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

// ── Config ───────────────────────────────────────────────────────────────────
$config = ['storage' => null, 'notify' => 'contact@nexaflow.fr'];
if (is_file(__DIR__ . '/config.php')) {
    $loaded = require __DIR__ . '/config.php';
    if (is_array($loaded)) {
        $config = array_merge($config, $loaded);
    }
}
// Default: one level above the web root, so the file is never served over HTTP.
$storage = $config['storage'] ?: dirname(__DIR__) . '/openfamily-waitlist.jsonl';

// ── Input (accepts JSON or a classic form POST) ──────────────────────────────
$raw = file_get_contents('php://input') ?: '';
$data = [];
if ($raw !== '' && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    $decoded = json_decode($raw, true);
    $data = is_array($decoded) ? $decoded : [];
} else {
    $data = $_POST;
}

$email = trim((string) ($data['email'] ?? ''));
$locale = in_array($data['locale'] ?? '', ['fr', 'en'], true) ? $data['locale'] : 'fr';
$honeypot = trim((string) ($data['website'] ?? ''));

// Bots fill every field, humans never see this one.
if ($honeypot !== '') {
    respond(200, ['ok' => true]);
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    respond(422, ['ok' => false, 'error' => 'invalid_email']);
}

// ── Rate limit per IP ────────────────────────────────────────────────────────
// REMOTE_ADDR is the real client on this host (LiteSpeed terminates TLS itself).
// X-Forwarded-For is NOT read on purpose: with no proxy in front it is fully
// attacker-controlled, which would turn the limit into a no-op.
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$now = time();
$throttleFile = sys_get_temp_dir() . '/of-waitlist-' . hash('sha256', $ip) . '.txt';

// One exclusive lock held across BOTH the read and the write: without it,
// concurrent requests all read the same counter, all pass, and all overwrite
// each other — the limit would only ever count sequential requests.
$fh = @fopen($throttleFile, 'c+');
if (!$fh || !flock($fh, LOCK_EX)) {
    if ($fh) { fclose($fh); }
    respond(503, ['ok' => false, 'error' => 'unavailable']);
}
$hits = array_values(array_filter(
    array_map('intval', explode(',', (string) stream_get_contents($fh))),
    static fn($t) => $t > $now - 3600
));
if (count($hits) >= MAX_PER_IP_PER_HOUR) {
    flock($fh, LOCK_UN);
    fclose($fh);
    respond(429, ['ok' => false, 'error' => 'too_many_requests']);
}
$hits[] = $now;
ftruncate($fh, 0);
rewind($fh);
fwrite($fh, implode(',', $hits));
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);

// Drop stale throttle files now and then: one per visitor IP would otherwise
// pile up until the account runs out of inodes.
if (random_int(1, 100) === 1) {
    foreach (glob(sys_get_temp_dir() . '/of-waitlist-*.txt') ?: [] as $stale) {
        if (@filemtime($stale) < $now - 3600) { @unlink($stale); }
    }
}

// ── Store (deduplicated) ─────────────────────────────────────────────────────
// Hard ceiling: the dedupe below scans the whole file, so an unbounded file
// would make every signup slower until the account hits its resource limit and
// takes the WHOLE site down. Fail loudly instead of degrading silently.
if (is_file($storage) && filesize($storage) > MAX_STORAGE_BYTES) {
    error_log('waitlist: storage cap reached, refusing new signups');
    respond(503, ['ok' => false, 'error' => 'storage_unavailable']);
}

$normalized = strtolower($email);
$alreadyListed = false;
if (is_file($storage)) {
    $handle = @fopen($storage, 'r');
    if ($handle) {
        while (($line = fgets($handle)) !== false) {
            $row = json_decode($line, true);
            if (is_array($row) && strtolower((string) ($row['email'] ?? '')) === $normalized) {
                $alreadyListed = true;
                break;
            }
        }
        fclose($handle);
    }
}
// Answer exactly like a fresh signup. Reporting "already registered" would turn
// this endpoint into a membership oracle: anyone could test an address and learn
// whether that person signed up.
if ($alreadyListed) {
    respond(200, ['ok' => true]);
}

// Deliberately minimal: no IP is stored. A SHA-256 of an IPv4 address is
// reversible by brute force over the whole address space, so it would still be
// personal data at rest — and abuse is already handled by the throttle above,
// which keeps its counters outside this file and expires them after an hour.
$record = [
    'email' => $email,
    'locale' => $locale,
    'date' => gmdate('c'),
];

// Create it already locked down: chmod after the first write would leave the
// file world-readable for the duration of that request.
if (!is_file($storage)) {
    @touch($storage);
    @chmod($storage, 0600);
}

$written = @file_put_contents($storage, json_encode($record, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
if ($written === false) {
    // Without this the signup would vanish with no trace anywhere: the client
    // sees a generic error and the notification below is never reached.
    error_log('waitlist: cannot write storage');
    if (!empty($config['notify'])) {
        @mail(
            (string) $config['notify'],
            'OpenFamily - ECHEC ecriture liste attente',
            "Une inscription n'a pas pu etre enregistree. Verifiez config.php, le chemin de stockage et ses droits.\n",
            "From: no-reply@openfamily.fr\r\nContent-Type: text/plain; charset=utf-8\r\n"
        );
    }
    respond(500, ['ok' => false, 'error' => 'storage_unavailable']);
}

// ── Notify (best effort — never fails the request) ───────────────────────────
if (!empty($config['notify'])) {
    @mail(
        (string) $config['notify'],
        'OpenFamily Cloud - nouvelle inscription liste d\'attente',
        "Adresse : {$email}\nLangue  : {$locale}\nDate    : {$record['date']}\n",
        "From: no-reply@openfamily.fr\r\nContent-Type: text/plain; charset=utf-8\r\n"
    );
}

respond(200, ['ok' => true]);
