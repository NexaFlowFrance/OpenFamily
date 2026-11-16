import { OPENFAMILY_VERSION } from '../version';
import logger from './logger';

// What a barcode is the barcode of, asked to Open Food Facts, the free and
// open database of food products. Only the digits of the barcode leave the
// server, and only when someone asks for a lookup: nothing about the family.

/** EAN-8, UPC-A, EAN-13 and the longer codes of cases: digits only. */
export const isBarcode = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{6,20}$/.test(value);

export interface BarcodeProduct {
    name: string;
    brand: string | null;
    /** The size written on the pack, as the database has it: "1 L", "6 x 125 g". */
    package: string | null;
}

export type BarcodeAnswer =
    | { found: true; product: BarcodeProduct }
    | { found: false }
    /** The database could not be asked: no network, an error, too slow. */
    | { found: null };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 5000;
let fetcher: Fetcher = (url, init) => fetch(url, init);

/** Lets the tests answer in place of the real database. */
export const setBarcodeFetcherForTests = (replacement: Fetcher | null): void => {
    fetcher = replacement ?? ((url, init) => fetch(url, init));
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const lookupBarcode = async (barcode: string, language: string): Promise<BarcodeAnswer> => {
    if (!isBarcode(barcode)) return { found: false };
    const localized = `product_name_${language}`;
    const fields = ['product_name', localized, 'generic_name', 'brands', 'quantity'].join(',');
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`;

    try {
        const response = await fetcher(url, {
            headers: {
                Accept: 'application/json',
                // Open Food Facts asks every application to name itself.
                'User-Agent': `OpenFamily/${OPENFAMILY_VERSION} (https://github.com/NexaFlowFrance/OpenFamily)`,
            },
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // It answers 404 for a barcode it does not know.
        if (response.status === 404) return { found: false };
        if (!response.ok) return { found: null };

        const answer = await response.json() as { status?: unknown; product?: Record<string, unknown> };
        const product = answer.product;
        if (!product || answer.status === 0) return { found: false };

        const name = text(product[localized]) || text(product.product_name) || text(product.generic_name);
        if (!name) return { found: false };
        return {
            found: true,
            product: {
                name: name.slice(0, 255),
                // "Brand A, Brand B": the first one is the one on the pack.
                brand: text(product.brands).split(',')[0].trim().slice(0, 100) || null,
                package: text(product.quantity).slice(0, 50) || null,
            },
        };
    } catch (error) {
        logger.warn('pantry.barcode_lookup_failed', { error: error instanceof Error ? error.message : String(error) });
        return { found: null };
    }
};
