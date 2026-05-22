// =============================================================================
// EmailService
//
// Single SMTP transport (lazy init), two send paths:
//   - sendNotificationEmail() → "immediate" mode, one notif per email
//   - sendDigestEmail()       → "daily" mode, grouped recap
//
// Failures are converted to typed EmailError so the worker can decide whether
// to retry or move on. Logging stays consistent with the rest of the codebase
// (JSON via lib/logger).
// =============================================================================
import nodemailer, { type Transporter } from 'nodemailer';
import logger from '../lib/logger';
import { getEmailConfig } from './config';
import { EmailError, classifySmtpError } from './errors';
import { renderNotificationEmail } from './templates/notificationEmail';
import { renderDigestEmail, type DigestNotification } from './templates/digestEmail';
import { renderInvitationEmail } from './templates/invitationEmail';

export interface EmailRecipient {
    email: string;
    name: string;
}

export interface EmailNotificationPayload {
    type: string;
    title: string;
    message: string;
}

export interface InvitationEmailPayload {
    inviterName: string;
    temporaryPassword: string;
}

export interface SendResult {
    messageId: string;
    latencyMs: number;
}

let transporterCache: Transporter | null = null;

const getTransporter = (): Transporter => {
    if (transporterCache) return transporterCache;
    const cfg = getEmailConfig();
    transporterCache = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: { user: cfg.smtp.user, pass: cfg.smtp.password },
    });
    return transporterCache;
};

/** Test/reset hook — used in unit tests after mutating env. */
export const resetEmailTransporterCache = (): void => {
    transporterCache = null;
};

const sendMail = async (params: {
    to: string;
    subject: string;
    html: string;
    text: string;
}): Promise<SendResult> => {
    const cfg = getEmailConfig();
    if (!cfg.enabled) {
        throw new EmailError('DISABLED', 'EMAIL_ENABLED is false', false);
    }
    const transporter = getTransporter();
    const startedAt = Date.now();
    try {
        const info = await transporter.sendMail({
            from: cfg.from,
            replyTo: cfg.replyTo ?? undefined,
            to: params.to,
            subject: params.subject,
            html: params.html,
            text: params.text,
        });
        return {
            messageId: info.messageId ?? '',
            latencyMs: Date.now() - startedAt,
        };
    } catch (err) {
        throw classifySmtpError(err);
    }
};

export const sendNotificationEmail = async (
    recipient: EmailRecipient,
    notification: EmailNotificationPayload,
): Promise<SendResult> => {
    const cfg = getEmailConfig();
    const rendered = renderNotificationEmail({
        recipientName: recipient.name,
        notification,
        appBaseUrl: cfg.appBaseUrl,
    });
    const result = await sendMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
    });
    logger.info('email.notification_sent', {
        type: notification.type,
        latencyMs: result.latencyMs,
        messageId: result.messageId || undefined,
    });
    return result;
};

// Account-invitation email. Transactional: unlike notification/digest emails it
// is NOT gated by the recipient's email_notifications_enabled preference (the
// recipient has no preferences yet — the account was just created). It still
// respects the global EMAIL_ENABLED switch via sendMail().
export const sendInvitationEmail = async (
    recipient: EmailRecipient,
    payload: InvitationEmailPayload,
): Promise<SendResult> => {
    const cfg = getEmailConfig();
    const baseUrl = cfg.appBaseUrl.replace(/\/+$/, '');
    const rendered = renderInvitationEmail({
        recipientName: recipient.name,
        inviterName: payload.inviterName,
        email: recipient.email,
        temporaryPassword: payload.temporaryPassword,
        loginUrl: `${baseUrl}/login`,
    });
    const result = await sendMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
    });
    logger.info('email.invitation_sent', {
        latencyMs: result.latencyMs,
        messageId: result.messageId || undefined,
    });
    return result;
};

export const sendDigestEmail = async (
    recipient: EmailRecipient,
    notifications: DigestNotification[],
): Promise<SendResult> => {
    if (notifications.length === 0) {
        throw new EmailError('TEMPLATE', 'Refusing to send an empty digest', false);
    }
    const cfg = getEmailConfig();
    const rendered = renderDigestEmail({
        recipientName: recipient.name,
        notifications,
        appBaseUrl: cfg.appBaseUrl,
    });
    const result = await sendMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
    });
    logger.info('email.digest_sent', {
        count: notifications.length,
        latencyMs: result.latencyMs,
        messageId: result.messageId || undefined,
    });
    return result;
};
