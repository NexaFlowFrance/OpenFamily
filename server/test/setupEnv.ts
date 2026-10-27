// Runs before every test file, ahead of any import of the app: db.ts opens its
// pool from these variables at import time.
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_USER ??= 'openfamily';
process.env.POSTGRES_PASSWORD ??= 'openfamily';
process.env.POSTGRES_DB ??= 'openfamily_test';
process.env.JWT_SECRET = 'test-only-secret-0123456789-0123456789';
process.env.APP_PUBLIC_URL = 'http://app.test';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.OIDC_FLOW_RATE_LIMIT_MAX = '100000';
process.env.LOG_LEVEL = 'error';
// Docker and CI run PostgreSQL in UTC; a native install often does not. A
// session far from UTC makes any mix-up between local and UTC times fail loudly.
process.env.PGOPTIONS ??= '-c timezone=Pacific/Kiritimati';

// The suites empty every table between tests: never let them near real data.
if (!process.env.POSTGRES_DB.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${process.env.POSTGRES_DB}": its name must end with _test.`);
}
