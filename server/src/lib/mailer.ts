import nodemailer, { type Transporter } from 'nodemailer';
import logger from './logger';

/**
 * Transactional email.
 *
 * The mailer is INERT unless SMTP is configured (SMTP_HOST + MAIL_FROM), so an
 * installation with no mail relay keeps working: sending is simply skipped,
 * best-effort, and never throws toward the caller.
 *
 * Two messages: the family invitation (when the inviter supplies the invitee's
 * address) and the password-reset link. Neither ever carries a password.
 *
 * Copy rule: no em dash and no en dash anywhere in subjects or bodies.
 */

/** Optional: shown as the "any questions?" contact, omitted when unset. */
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL?.trim() || '';


/** true only when we have both a host to send through and a From address. */
export const isMailEnabled = (): boolean =>
    Boolean(process.env.SMTP_HOST?.trim()) && Boolean(process.env.MAIL_FROM?.trim());

let transporter: Transporter | null = null;
/** Warn about a disabled mailer exactly once, not on every send attempt. */
let disabledWarningLogged = false;

/** Lazily build (and reuse) the nodemailer transport from the SMTP env config. */
const getTransporter = (): Transporter => {
    if (transporter) {
        return transporter;
    }

    const host = process.env.SMTP_HOST!.trim();
    const port = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
    const secure = process.env.SMTP_SECURE?.trim() === 'true';
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
    });

    return transporter;
};

type Language = 'fr' | 'en';

const normalizeLanguage = (language?: string | null): Language =>
    language?.trim().toLowerCase().startsWith('en') ? 'en' : 'fr';

/** Escape characters that would break out of HTML text nodes or attributes. */
const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

interface EmailContent {
    subject: string;
    text: string;
    html: string;
}

interface EmailStrings {
    lang: Language;
    subject: string;
    tagline: string;
    preheader: string;
    greeting: string;
    intro: string;
    /** Optional call-to-action button rendered right after the intro. */
    cta?: { label: string; url: string };
    stepsIntro?: string;
    stepsHtml?: string[];
    noteText: string;
    /** Optional "service address" block; omitted when absent. */
    service?: { label: string; url: string; host: string };
    supportHtml: string;
    signoff: string;
    team: string;
    footer: string;
}

/**
 * Beautiful, email client safe HTML: table layout, inline styles, OpenFamily
 * palette (warm cream background, rose accent, serif headings). No em/en dash.
 */
const renderEmailHtml = (s: EmailStrings): string => {
    const font = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
    const serif = "Georgia,'Times New Roman',serif";
    const steps = (s.stepsHtml ?? [])
        .map(
            (step, i) => `
                <tr>
                  <td valign="top" width="38" style="padding:0 14px 16px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td align="center" valign="middle" width="30" height="30" style="width:30px;height:30px;background:#dc4a60;border-radius:15px;color:#ffffff;font-size:15px;font-weight:700;font-family:${font};">${i + 1}</td>
                    </tr></table>
                  </td>
                  <td valign="middle" style="padding:0 0 16px 0;color:#2a2028;font-size:15px;line-height:1.55;font-family:${font};">${step}</td>
                </tr>`
        )
        .join('');

    // Bulletproof button: a filled table cell whose link fills the cell.
    const ctaHtml = s.cta
        ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">
          <tr>
            <td align="center" bgcolor="#dc4a60" style="background:#dc4a60;border-radius:12px;">
              <a href="${escapeHtml(s.cta.url)}" style="display:inline-block;padding:13px 26px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(s.cta.label)}</a>
            </td>
          </tr>
        </table>`
        : '';

    const stepsIntroHtml = s.stepsIntro
        ? `<p style="margin:0 0 14px 0;font-family:${font};font-size:15px;line-height:1.6;color:#2a2028;font-weight:600;">${s.stepsIntro}</p>`
        : '';

    const serviceHtml = s.service
        ? `
      <tr><td style="padding:22px 36px 2px 36px;">
        <div style="font-family:${font};font-size:13px;color:#6e5f66;margin-bottom:5px;">${escapeHtml(s.service.label)}</div>
        <a href="${escapeHtml(s.service.url)}" style="font-family:${font};font-size:16px;font-weight:700;color:#dc4a60;text-decoration:none;">${escapeHtml(s.service.host)}</a>
      </td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escapeHtml(s.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f2e9;">${escapeHtml(s.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f2e9" style="background:#f7f2e9;">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#fcfaf5;border:1px solid #e7dccc;border-radius:16px;overflow:hidden;">
      <tr><td style="height:5px;background:#dc4a60;line-height:5px;font-size:5px;">&nbsp;</td></tr>
      <tr><td style="padding:30px 36px 6px 36px;">
        <div style="font-family:${serif};font-size:24px;font-weight:700;color:#2a2028;letter-spacing:-0.01em;">OpenFamily</div>
        <div style="font-family:${font};font-size:13px;color:#6e5f66;margin-top:5px;">${escapeHtml(s.tagline)}</div>
      </td></tr>
      <tr><td style="padding:18px 36px 4px 36px;">
        <h1 style="margin:0 0 12px 0;font-family:${serif};font-size:26px;line-height:1.25;font-weight:700;color:#2a2028;">${s.greeting}</h1>
        <p style="margin:0 0 20px 0;font-family:${font};font-size:15px;line-height:1.6;color:#2a2028;">${s.intro}</p>
        ${ctaHtml}
        ${stepsIntroHtml}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px 0;">${steps}</table>
      </td></tr>
      <tr><td style="padding:6px 36px 4px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7e3de;border-radius:12px;">
          <tr><td style="padding:16px 18px;font-family:${font};font-size:13.5px;line-height:1.6;color:#6e5f66;">${s.noteText}</td></tr>
        </table>
      </td></tr>${serviceHtml}
      <tr><td style="padding:22px 36px 28px 36px;">
        <p style="margin:0;font-family:${font};font-size:15px;line-height:1.6;color:#2a2028;">${s.supportHtml}</p>
        <p style="margin:18px 0 0 0;font-family:${font};font-size:15px;line-height:1.6;color:#2a2028;">${escapeHtml(s.signoff)}<br><span style="font-weight:700;">${escapeHtml(s.team)}</span></p>
      </td></tr>
      <tr><td style="padding:18px 36px;background:#f4ece0;border-top:1px solid #e7dccc;">
        <div style="font-family:${font};font-size:12px;line-height:1.6;color:#8a8296;">${escapeHtml(s.footer)}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
};

/**
 * Send one email. Best-effort: any failure is logged and swallowed so callers
 * never fail because of delivery. Returns whether the message was handed to the
 * SMTP relay. When SMTP is not configured this is a no-op that warns at most once.
 */
const deliver = async (to: string, content: EmailContent, kind: string): Promise<boolean> => {
    if (!isMailEnabled()) {
        if (!disabledWarningLogged) {
            disabledWarningLogged = true;
            logger.warn('mail.disabled', {
                reason: 'SMTP_HOST and MAIL_FROM must both be set to send email.',
            });
        }
        return false;
    }

    try {
        await getTransporter().sendMail({
            from: process.env.MAIL_FROM!.trim(),
            to,
            subject: content.subject,
            text: content.text,
            html: content.html,
        });

        logger.info(`mail.${kind}_sent`, { email: to });
        return true;
    } catch (error) {
        logger.warn(`mail.${kind}_failed`, {
            email: to,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
};

const formatDate = (date: Date, lang: Language): string =>
    new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
};

const originOf = (url: string): string => {
    try {
        return new URL(url).origin;
    } catch {
        return url;
    }
};

export interface FamilyInviteEmailInput {
    /** The invitee's address (where the email goes). */
    email: string;
    /** Display name of the family owner sending the invite. */
    inviterName: string;
    /** Full join URL carrying the invite token. */
    joinUrl: string;
    /** The inviter's language (we do not know the invitee's yet). */
    language?: string | null;
    expiresAt: Date;
}

/**
 * Send a family invitation carrying the join link. Returns true when the email
 * was handed to the SMTP relay (best-effort, never throws).
 */
export const sendFamilyInviteEmail = async (
    { email, inviterName, joinUrl, language, expiresAt }: FamilyInviteEmailInput
): Promise<boolean> => {
    const lang = normalizeLanguage(language);
    const name = escapeHtml(inviterName);
    const expires = formatDate(expiresAt, lang);
    const host = hostOf(joinUrl);
    const linkHtml = `<a href="${escapeHtml(joinUrl)}" style="color:#dc4a60;text-decoration:none;font-weight:600;word-break:break-all;">${escapeHtml(joinUrl)}</a>`;

    let content: EmailContent;
    if (lang === 'en') {
        const text = [
            `${inviterName} invites you to join their family on OpenFamily.`,
            '',
            'OpenFamily gathers the family calendar, shopping lists, tasks, meals and budget in one shared place, with no ads and no tracking.',
            '',
            `To accept, open this link and create your account (or sign in if you already have one): ${joinUrl}`,
            '',
            `This invitation expires on ${expires}. If you do not know ${inviterName}, simply ignore this email.`,
            '',
            'See you soon,',
            'The OpenFamily team',
        ].join('\n');
        content = {
            subject: `${inviterName} invites you to their family on OpenFamily`,
            text,
            html: renderEmailHtml({
                lang: 'en',
                subject: `${inviterName} invites you to their family on OpenFamily`,
                tagline: 'Family life, well organised.',
                preheader: 'Join your family on OpenFamily in a few taps.',
                greeting: `${name} invites you`,
                intro: `${name} invites you to join their family space on OpenFamily: shared calendar, shopping lists, tasks, meals and budget, all in one place, with no ads and no tracking.`,
                cta: { label: 'Join the family', url: joinUrl },
                stepsIntro: 'How to accept:',
                stepsHtml: [
                    'Tap the Join the family button above.',
                    'Create your account (or sign in if you already have one): it is attached to the family automatically.',
                    'That is all: the shared family data appears right away.',
                ],
                noteText: `This invitation expires on ${escapeHtml(expires)}. If the button does not work, copy this link into your browser: ${linkHtml}. If you do not know ${name}, simply ignore this email.`,
                service: { label: 'Service address', url: originOf(joinUrl), host },
                supportHtml: `Any questions? Write to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#dc4a60;text-decoration:none;font-weight:600;">${escapeHtml(SUPPORT_EMAIL)}</a>.`,
                signoff: 'See you soon,',
                team: 'The OpenFamily team',
                footer: 'OpenFamily, your open source family organiser. You receive this email because an OpenFamily member invited this address to join their family.',
            }),
        };
    } else {
        const text = [
            `${inviterName} vous invite à rejoindre sa famille sur OpenFamily.`,
            '',
            "OpenFamily rassemble l'agenda familial, les courses, les tâches, les repas et le budget au même endroit, sans publicité ni pistage.",
            '',
            `Pour accepter, ouvrez ce lien et créez votre compte (ou connectez-vous si vous en avez déjà un) : ${joinUrl}`,
            '',
            `Cette invitation expire le ${expires}. Si vous ne connaissez pas ${inviterName}, ignorez simplement cet email.`,
            '',
            'À bientôt,',
            "L'équipe OpenFamily",
        ].join('\n');
        content = {
            subject: `${inviterName} vous invite dans sa famille sur OpenFamily`,
            text,
            html: renderEmailHtml({
                lang: 'fr',
                subject: `${inviterName} vous invite dans sa famille sur OpenFamily`,
                tagline: 'La vie de famille, bien organisée.',
                preheader: 'Rejoignez votre famille sur OpenFamily en quelques instants.',
                greeting: `${name} vous invite`,
                intro: `${name} vous invite à rejoindre son espace famille sur OpenFamily : agenda partagé, courses, tâches, repas et budget, tout au même endroit, sans publicité ni pistage.`,
                cta: { label: 'Rejoindre la famille', url: joinUrl },
                stepsIntro: 'Comment accepter :',
                stepsHtml: [
                    'Appuyez sur le bouton Rejoindre la famille ci-dessus.',
                    'Créez votre compte (ou connectez-vous si vous en avez déjà un) : il sera rattaché à la famille automatiquement.',
                    "C'est tout : les données partagées de la famille apparaissent aussitôt.",
                ],
                noteText: `Cette invitation expire le ${escapeHtml(expires)}. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : ${linkHtml}. Si vous ne connaissez pas ${name}, ignorez simplement cet email.`,
                service: { label: 'Adresse du service', url: originOf(joinUrl), host },
                supportHtml: `Une question ? Écrivez à <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#dc4a60;text-decoration:none;font-weight:600;">${escapeHtml(SUPPORT_EMAIL)}</a>.`,
                signoff: 'À bientôt,',
                team: "L'équipe OpenFamily",
                footer: "OpenFamily, votre organiseur familial open source. Vous recevez cet email car un membre d'OpenFamily a invité cette adresse à rejoindre sa famille.",
            }),
        };
    }

    return deliver(email, content, 'invite');
};

export interface PasswordResetEmailInput {
    email: string;
    name?: string | null;
    language?: string | null;
    /** Full reset URL carrying the one-time token. */
    resetUrl: string;
}

/**
 * Send the password-reset email. Returns true when the email was handed to the
 * SMTP relay (best-effort, never throws).
 */
export const sendPasswordResetEmail = async (
    { email, name, language, resetUrl }: PasswordResetEmailInput
): Promise<boolean> => {
    const lang = normalizeLanguage(language);
    const cleanName = name?.trim() || '';
    const host = hostOf(resetUrl);
    const linkHtml = `<a href="${escapeHtml(resetUrl)}" style="color:#dc4a60;text-decoration:none;font-weight:600;word-break:break-all;">${escapeHtml(resetUrl)}</a>`;

    let content: EmailContent;
    if (lang === 'en') {
        const greetingName = cleanName ? `Hello ${cleanName}` : 'Hello';
        const text = [
            `${greetingName},`,
            '',
            `A password reset was requested for your OpenFamily account (${email}).`,
            '',
            `To choose a new password, open this link: ${resetUrl}`,
            '',
            'The link is valid for 60 minutes and can only be used once. If you did not request this, ignore this email: your password stays unchanged.',
            '',
            'See you soon,',
            'The OpenFamily team',
        ].join('\n');
        content = {
            subject: 'Reset your OpenFamily password',
            text,
            html: renderEmailHtml({
                lang: 'en',
                subject: 'Reset your OpenFamily password',
                tagline: 'Family life, well organised.',
                preheader: 'Choose a new password for your OpenFamily account.',
                greeting: escapeHtml(greetingName),
                intro: `A password reset was requested for your OpenFamily account (<span style="font-weight:700;color:#2a2028;">${escapeHtml(email)}</span>). Click the button below to choose a new password.`,
                cta: { label: 'Choose a new password', url: resetUrl },
                noteText: `The link is valid for 60 minutes and can only be used once. If the button does not work, copy this link into your browser: ${linkHtml}. If you did not request this, ignore this email: your password stays unchanged.`,
                service: { label: 'Service address', url: originOf(resetUrl), host },
                supportHtml: `Any questions? Write to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#dc4a60;text-decoration:none;font-weight:600;">${escapeHtml(SUPPORT_EMAIL)}</a>.`,
                signoff: 'See you soon,',
                team: 'The OpenFamily team',
                footer: 'OpenFamily, your open source family organiser. You receive this email because a password reset was requested for this account.',
            }),
        };
    } else {
        const greetingName = cleanName ? `Bonjour ${cleanName}` : 'Bonjour';
        const text = [
            `${greetingName},`,
            '',
            `Une réinitialisation de mot de passe a été demandée pour votre compte OpenFamily (${email}).`,
            '',
            `Pour choisir un nouveau mot de passe, ouvrez ce lien : ${resetUrl}`,
            '',
            "Le lien est valable 60 minutes et ne peut être utilisé qu'une seule fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
            '',
            'À bientôt,',
            "L'équipe OpenFamily",
        ].join('\n');
        content = {
            subject: 'Réinitialisation de votre mot de passe OpenFamily',
            text,
            html: renderEmailHtml({
                lang: 'fr',
                subject: 'Réinitialisation de votre mot de passe OpenFamily',
                tagline: 'La vie de famille, bien organisée.',
                preheader: 'Choisissez un nouveau mot de passe pour votre compte OpenFamily.',
                greeting: escapeHtml(greetingName),
                intro: `Une réinitialisation de mot de passe a été demandée pour votre compte OpenFamily (<span style="font-weight:700;color:#2a2028;">${escapeHtml(email)}</span>). Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.`,
                cta: { label: 'Choisir un nouveau mot de passe', url: resetUrl },
                noteText: `Le lien est valable 60 minutes et ne peut être utilisé qu'une seule fois. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : ${linkHtml}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.`,
                service: { label: 'Adresse du service', url: originOf(resetUrl), host },
                supportHtml: `Une question ? Écrivez à <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#dc4a60;text-decoration:none;font-weight:600;">${escapeHtml(SUPPORT_EMAIL)}</a>.`,
                signoff: 'À bientôt,',
                team: "L'équipe OpenFamily",
                footer: 'OpenFamily, votre organiseur familial open source. Vous recevez cet email car une réinitialisation de mot de passe a été demandée pour ce compte.',
            }),
        };
    }

    return deliver(email, content, 'reset');
};
