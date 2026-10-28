export const MIN_PASSWORD_LENGTH = 8;

/** The one password rule, shared by sign-up, password reset and the admin CLI. */
export const isAcceptablePassword = (password: unknown): password is string =>
    typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
