import { pathToFileURL } from 'url';
import type * as OpenIdClient from 'openid-client';

export type OpenIdClientModule = typeof OpenIdClient;

// openid-client v6 ships as an ES module only. With `module: CommonJS`, TypeScript
// compiles a plain `import()` into `require()`, which Node only accepts for ES
// modules from 20.19 on (the Windows installer bundles 20.18). Building the
// import through `Function` keeps a native dynamic import, which every Node 20
// release supports from CommonJS. The specifier is resolved to an absolute file
// URL first so the import does not depend on the caller's location.
const nativeImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
) => Promise<OpenIdClientModule>;

let modulePromise: Promise<OpenIdClientModule> | undefined;

export const loadOpenIdClient = (): Promise<OpenIdClientModule> => {
    if (!modulePromise) {
        const entry = pathToFileURL(require.resolve('openid-client')).href;
        modulePromise = nativeImport(entry).catch((error) => {
            modulePromise = undefined;
            throw error;
        });
    }
    return modulePromise;
};

/**
 * The test runner executes modules in a VM context where the import above is
 * unavailable; the test setup imports the library itself and hands it over.
 */
export const provideOpenIdClientForTests = (module: OpenIdClientModule): void => {
    modulePromise = Promise.resolve(module);
};
