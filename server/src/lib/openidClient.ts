import type * as OpenIdClient from 'openid-client';

export type OpenIdClientModule = typeof OpenIdClient;

// openid-client v6 ships as an ES module only, which require() loads natively
// from Node 22.12 (the minimum in package.json engines). Loaded on first use,
// so a server without SSO never touches it.
let loaded: OpenIdClientModule | undefined;

export const loadOpenIdClient = async (): Promise<OpenIdClientModule> => {
    loaded ??= require('openid-client') as OpenIdClientModule;
    return loaded;
};

/**
 * The test runner executes modules in a VM context without require(); the test
 * setup imports the library itself and hands it over.
 */
export const provideOpenIdClientForTests = (module: OpenIdClientModule): void => {
    loaded = module;
};
