// =============================================================================
// Shared email-template helpers
//
// Tiny utilities only — no templating engine. We hand-build HTML strings
// because the templates are small, the look is intentionally plain, and a
// dependency-free path keeps the open-source self-hoster's life simple.
// =============================================================================

const ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** HTML-escape user-provided strings before inserting them into a template. */
export const escapeHtml = (raw: string): string =>
    raw.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);

/**
 * Map a notification type to the in-app route the user should land on. Mirrors
 * client/src/hooks/useNotifications.ts:notificationDestination so the email
 * CTA goes to the same place as clicking the bell.
 */
export const notificationPath = (type: string): string => {
    if (type.startsWith('appointment_reminder_')) return '/calendar';
    if (type === 'task_due_today' || type === 'task_overdue') return '/tasks';
    if (
        type === 'contract_due_soon' ||
        type === 'maintenance_due_soon' ||
        type === 'warranty_expiring'
    ) {
        return '/house';
    }
    return '/';
};

/**
 * Wrap content in a minimal, email-safe HTML document.
 *
 * The footer defaults to the email-notifications wording (used by the
 * notification/digest emails). Transactional emails that aren't tied to
 * notification preferences (e.g. the account invitation) pass a custom
 * `footerHtml` to override it.
 */
export const wrapEmail = (params: {
    title: string;
    bodyHtml: string;
    settingsUrl?: string;
    footerHtml?: string;
}): string => {
    const { title, bodyHtml, settingsUrl, footerHtml } = params;
    const footer =
        footerHtml ??
        `<p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
            Vous recevez cet email parce que les notifications par email sont activées sur votre compte KeurTonux.
            <br>
            <a href="${escapeHtml(settingsUrl ?? '')}" style="color:#71717a;text-decoration:underline;">Gérer mes préférences</a>
          </p>`;
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="padding:24px 28px 8px 28px;">
          <p style="margin:0;font-size:14px;color:#71717a;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">KeurTonux</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px 28px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #f4f4f5;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};
