type PackageMetadata = {
    version?: unknown;
};

const packageMetadata = require('../package.json') as PackageMetadata;

/**
 * Runtime OpenFamily version.
 *
 * The server package.json is copied into the production Docker image, so this
 * value remains available both in development and in the compiled container.
 */
export const OPENFAMILY_VERSION =
    typeof packageMetadata.version === 'string' ? packageMetadata.version : 'unknown';
