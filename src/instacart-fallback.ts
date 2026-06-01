/**
 * Instacart fallback — for stores without open APIs (Walmart, Costco, etc.)
 *
 * Uses our existing instacart-ca-mcp's persisted GraphQL API.
 * Requires the Instacart session cookie from the Chromium profile.
 *
 * Markup info from Instacart store list (discovered 2026-06-01):
 *   noMarkup=true:  Save-On, PriceSmart, Urban Fare, FreshCo, No Frills, Choices, Nesters
 *   noMarkup=false: Walmart, T&T, Costco, Superstore, Whole Foods, Fresh St, Safeway
 */

// ---------------------------------------------------------------------------
// Markup registry (from live Instacart data)
// ---------------------------------------------------------------------------

export const INSTACART_MARKUP: Record<string, { noMarkup: boolean; name: string }> = {
  'walmart-canada': { noMarkup: false, name: 'Walmart' },
  'costco-canada': { noMarkup: false, name: 'Costco' },
  'real-canadian-superstore': { noMarkup: false, name: 'Real Canadian Superstore' },
  'no-frills-can': { noMarkup: true, name: 'No Frills' },
  'freshco-ca': { noMarkup: true, name: 'FreshCo' },
  'save-on-foods': { noMarkup: true, name: 'Save-On-Foods' },
  'pricesmart-foods': { noMarkup: true, name: 'PriceSmart Foods' },
  'urban-fare': { noMarkup: true, name: 'Urban Fare' },
  'choices-market': { noMarkup: true, name: 'Choices Market' },
  'nesters': { noMarkup: true, name: 'Nesters' },
  't-t': { noMarkup: false, name: 'T&T Supermarket' },
  'whole-foods-ca': { noMarkup: false, name: 'Whole Foods' },
  'safeway-ca': { noMarkup: false, name: 'Safeway' },
  'loblaws': { noMarkup: false, name: 'Loblaws' },
  'fresh-st-market': { noMarkup: false, name: 'Fresh St. Market' },
  'london-drugs': { noMarkup: false, name: 'London Drugs' },
};

// ---------------------------------------------------------------------------
// Instacart GraphQL search (requires cookie)
// ---------------------------------------------------------------------------

const INSTACART_GQL = 'https://www.instacart.ca/graphql';

const SEARCH_HASH = '84255489ea975fa0c1e2eca710c80bdb0821830f8e7c66e006261ca59f8a1613';

export interface InstacartProduct {
  name: string;
  price: string;
  store: string;
  hasMarkup: boolean;
}

export async function instacartSearch(
  query: string,
  storeSlugs: string[],
  cookie: string,
): Promise<{ store: string; hasMarkup: boolean; products: InstacartProduct[] }[]> {
  const results: { store: string; hasMarkup: boolean; products: InstacartProduct[] }[] = [];

  for (const slug of storeSlugs) {
    const markup = INSTACART_MARKUP[slug];
    if (!markup) continue;

    try {
      const res = await fetch(INSTACART_GQL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          'x-client-identifier': 'web',
          'cookie': cookie,
        },
        body: JSON.stringify({
          operationName: 'SearchResultsPlacements',
          variables: {
            query,
            pageViewId: `search-${Date.now()}`,
            retailerInventorySessionToken: '',
            elevatedProductId: null,
            searchSource: 'search',
            disableReformulation: false,
          },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: SEARCH_HASH,
            },
          },
        }),
      });

      if (!res.ok) {
        results.push({ store: markup.name, hasMarkup: !markup.noMarkup, products: [] });
        continue;
      }

      const data = await res.json() as any;
      const items = data?.data?.searchResultsPlacements?.placements?.[0]?.items || [];
      const products: InstacartProduct[] = items.slice(0, 5).map((item: any) => ({
        name: item.name || item.productName || '',
        price: item.priceString || item.price || '',
        store: markup.name,
        hasMarkup: !markup.noMarkup,
      }));

      results.push({ store: markup.name, hasMarkup: !markup.noMarkup, products });
    } catch {
      results.push({ store: markup.name, hasMarkup: !markup.noMarkup, products: [] });
    }
  }

  return results;
}

/**
 * Check if a store has Instacart markup.
 */
export function hasInstacartMarkup(storeSlug: string): boolean | null {
  const info = INSTACART_MARKUP[storeSlug];
  if (!info) return null;
  return !info.noMarkup;
}

/**
 * Get markup info for display.
 */
export function getMarkupLabel(storeSlug: string): string {
  const info = INSTACART_MARKUP[storeSlug];
  if (!info) return '(unknown)';
  return info.noMarkup ? 'no markup (same as in-store)' : 'HAS MARKUP (Instacart adds ~5-15%)';
}
