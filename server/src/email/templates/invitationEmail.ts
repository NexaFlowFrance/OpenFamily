// =============================================================================
// Account-invitation template — sent when a family owner gives a member their
// own login. Transactional (not tied to notification preferences): it carries
// the temporary password and a link to sign in.
// =============================================================================
import { escapeHtml, wrapEmail } from './shared';

export interface InvitationEmailInput {
    recipientName: string;
    inviterName: string;
    email: string;
    temporaryPassword: string;
    loginUrl: string;
}

export const renderInvitationEmail = (
    input: InvitationEmailInput,
): { subject: string; html: string; text: string } => {
    const { recipientName, inviterName, email, temporaryPassword, loginUrl } = input;

    const subject = '[OpenFamily] Vous avez été ajouté à une famille';

    const bodyHtml = `
      <h1 style="margin:16px 0 8px 0;font-size:20px;line-height:1.3;color:#18181b;">Bienvenue dans la famille&nbsp;!</h1>
      <p style="margin:0 0 8px 0;font-size:14px;color:#52525b;">Bonjour ${escapeHtml(recipientName)},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#18181b;">
        ${escapeHtml(inviterName)} vous a ajouté à sa famille sur KeurTonux. Un compte a été créé pour vous&nbsp;:
        vous pouvez dès maintenant vous connecter avec les identifiants ci-dessous.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;background:#f4f4f5;border-radius:8px;">
        <tr><td style="padding:14px 18px;font-size:14px;color:#18181b;">
          <strong>Email&nbsp;:</strong> ${escapeHtml(email)}<br>
          <strong>Mot de passe temporaire&nbsp;:</strong>
          <code style="font-size:15px;background:#e4e4e7;padding:2px 6px;border-radius:4px;">${escapeHtml(temporaryPassword)}</code>
        </td></tr>
      </table>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#52525b;">
        Pour des raisons de sécurité, il vous sera demandé de définir votre propre mot de passe à la première connexion.
      </p>
      <p style="margin:0;">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">Se connecter</a>
      </p>
    `;

    const footerHtml = `<p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
            Vous recevez cet email parce que ${escapeHtml(inviterName)} vous a ajouté à sa famille sur KeurTonux.
            Si vous pensez qu'il s'agit d'une erreur, ignorez ce message.
          </p>`;

    const html = wrapEmail({ title: subject, bodyHtml, footerHtml });

    const text = [
        `Bonjour ${recipientName},`,
        '',
        `${inviterName} vous a ajouté à sa famille sur KeurTonux. Un compte a été créé pour vous.`,
        '',
        `Email : ${email}`,
        `Mot de passe temporaire : ${temporaryPassword}`,
        '',
        'Pour des raisons de sécurité, il vous sera demandé de définir votre propre mot de passe à la première connexion.',
        '',
        `Se connecter : ${loginUrl}`,
        '',
        '— KeurTonux',
    ].join('\n');

    return { subject, html, text };
};
