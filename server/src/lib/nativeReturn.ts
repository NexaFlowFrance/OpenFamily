/**
 * The page that ends a single sign-on started by the Android app.
 *
 * The sign-in happened in the phone's browser. The browser cannot be told to
 * "go back to the app" with a plain redirect every time: some refuse to leave
 * for an app unless the person taps something. So the page tries by itself,
 * and offers a button that always works.
 */
import { isLanguage, Language } from './languages';

/** Where the app listens (see the intent filter of its AndroidManifest.xml). */
export const NATIVE_CALLBACK = 'openfamily://auth/callback';

const TEXTS: Record<Language, { line: string; button: string }> = {
    fr: { line: 'Retournez dans l\'application pour terminer.', button: 'Ouvrir OpenFamily' },
    en: { line: 'Go back to the app to finish.', button: 'Open OpenFamily' },
    pt: { line: 'Volte ao aplicativo para concluir.', button: 'Abrir o OpenFamily' },
    ru: { line: 'Вернитесь в приложение, чтобы завершить.', button: 'Открыть OpenFamily' },
    es: { line: 'Vuelve a la aplicación para terminar.', button: 'Abrir OpenFamily' },
    ca: { line: 'Torna a l\'aplicació per acabar.', button: 'Obre OpenFamily' },
    zh: { line: '请返回应用以完成登录。', button: '打开 OpenFamily' },
    de: { line: 'Kehre zur App zurück, um abzuschließen.', button: 'OpenFamily öffnen' },
    ja: { line: 'アプリに戻って完了してください。', button: 'OpenFamily を開く' },
};

/** The first language of an Accept-Language header the server writes in, English otherwise. */
const languageOf = (header: unknown): Language => {
    for (const part of String(header ?? '').split(',')) {
        const code = part.trim().slice(0, 2).toLowerCase();
        if (isLanguage(code)) return code;
    }
    return 'en';
};

const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const nativeReturnPage = (target: string, acceptLanguage: unknown): string => {
    const lang = languageOf(acceptLanguage);
    const text = TEXTS[lang];
    const href = escapeHtml(target);
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${href}">
<meta name="referrer" content="no-referrer">
<title>OpenFamily</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:24px;box-sizing:border-box;background:#f7f1ea;color:#2a2028;font-family:system-ui,sans-serif;text-align:center">
<p style="margin:0;font-size:18px">${escapeHtml(text.line)}</p>
<a href="${href}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#dc4a60;color:#fff;font-weight:600;font-size:17px;text-decoration:none">${escapeHtml(text.button)}</a>
</body>
</html>`;
};
