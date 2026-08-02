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

// ── Rate limit per IP (best effort, file based) ──────────────────────────────
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$throttleFile = sys_get_temp_dir() . '/of-waitlist-' . hash('sha256', $ip) . '.txt';
$now = time();
$hits = is_file($throttleFile)
    ? array_filter(array_map('intval', explode(',', (string) file_get_contents($throttleFile))), fn($t) => $t > $now - 3600)
    : [];
if (count($hits) >= MAX_PER_IP_PER_HOUR) {
    respond(429, ['ok' => false, 'error' => 'too_many_requests']);
}
$hits[] = $now;
@file_put_contents($throttleFile, implode(',', $hits), LOCK_EX);

// ── Store (deduplicated) ─────────────────────────────────────────────────────
$normalized = strtolower($email);
if (is_file($storage)) {
    $handle = @fopen($storage, 'r');
    if ($handle) {
        while (($line = fgets($handle)) !== false) {
            $row = json_decode($line, true);
            if (is_array($row) && strtolower((string) ($row['email'] ?? '')) === $normalized) {
                fclose($handle);
                respond(200, ['ok' => true, 'already' => true]);
            }
        }
        fclose($handle);
    }
}

$record = [
    'email' => $email,
    'locale' => $locale,
    'date' => gmdate('c'),
    'ip' => hash('sha256', $ip), // hashed: enough to spot abuse, not personal data at rest
];

$written = @file_put_contents($storage, json_encode($record, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
if ($written === false) {
    respond(500, ['ok' => false, 'error' => 'storage_unavailable']);
}
@chmod($storage, 0600);

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
