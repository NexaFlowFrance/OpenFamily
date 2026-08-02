<?php
/**
 * Optional configuration for waitlist.php.
 *
 * Copy to config.php ON THE SERVER (it is gitignored, never commit it) and set
 * an absolute path OUTSIDE the web root so the address list can't be downloaded.
 * On Hostinger the web root is usually ~/public_html, so a sibling folder works:
 */
return [
    // Absolute path to the JSON-lines file storing the addresses.
    'storage' => '/home/USER/openfamily-waitlist/waitlist.jsonl',

    // Address notified on each signup. Set to null to disable the email.
    'notify' => 'contact@nexaflow.fr',
];
