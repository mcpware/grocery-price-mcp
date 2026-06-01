/**
 * mi9cloud Storefront Gateway — generic client for the Pattison Food Group family.
 *
 * One API pattern, 4 stores:
 *   - Save-On-Foods (190 stores across BC/AB/SK/MB)
 *   - PriceSmart Foods (5 stores, Metro Vancouver)
 *   - Fresh St. Market (9 stores, BC)
 *   - Urban Fare (5 stores, BC)
 *
 * Endpoint pattern: https://storefrontgateway.{slug}.com/api/stores/{storeId}/search
 * Auth: None (open API, needs Origin header only)
 * Currency: CAD
 */

// ---------------------------------------------------------------------------
// Store registry
// ---------------------------------------------------------------------------

export interface Mi9Store {
  slug: string;
  gateway: string;
  origin: string;
  name: string;
  defaultStoreId: string;
}

export const MI9_STORES: Record<string, Mi9Store> = {
  saveonfoods: {
    slug: 'saveonfoods',
    gateway: 'https://storefrontgateway.saveonfoods.com/api',
    origin: 'https://www.saveonfoods.com',
    name: 'Save-On-Foods',
    defaultStoreId: '2241', // Dunbar, Vancouver
  },
  pricesmartfoods: {
    slug: 'pricesmartfoods',
    gateway: 'https://storefrontgateway.pricesmartfoods.com/api',
    origin: 'https://www.pricesmartfoods.com',
    name: 'PriceSmart Foods',
    defaultStoreId: '2274', // Richmond Ackroyd
  },
  freshstmarket: {
    slug: 'freshstmarket',
    gateway: 'https://storefrontgateway.freshstmarket.com/api',
    origin: 'https://www.freshstmarket.com',
    name: 'Fresh St. Market',
    defaultStoreId: '055', // Vancouver House
  },
  urbanfare: {
    slug: 'urbanfare',
    gateway: 'https://storefrontgateway.urbanfare.com/api',
    origin: 'https://www.urbanfare.com',
    name: 'Urban Fare',
    defaultStoreId: '7615', // Coal Harbour
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Mi9Product {
  name: string;
  sku: string;
  brand: string;
  price: number;
  pricePerUnit: string;
  size: string;
  description: string;
  store: string;
}

export interface Mi9StoreLocation {
  id: string;
  name: string;
  retailerStoreId: string;
  address: string;
  city: string;
  postalCode: string;
  shoppingModes: string[];
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function mi9Get<T>(store: Mi9Store, path: string): Promise<T> {
  const res = await fetch(`${store.gateway}${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Origin': store.origin,
      'Referer': `${store.origin}/`,
    },
  });
  if (!res.ok) throw new Error(`${store.name} API ${res.status}: ${res.statusText}`);
  return await res.json() as T;
}

function mapProduct(item: any, storeName: string): Mi9Product {
  return {
    name: item.name || '',
    sku: item.sku || item.productId || '',
    brand: item.brand || '',
    price: item.priceNumeric || item.wholePrice || 0,
    pricePerUnit: item.pricePerUnit || '',
    size: item.unitOfSize ? `${item.unitOfSize.size}${item.unitOfSize.abbreviation}` : '',
    description: (item.description || '').slice(0, 100),
    store: storeName,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStore(slug: string): Mi9Store {
  const s = MI9_STORES[slug];
  if (!s) throw new Error(`Unknown mi9cloud store: ${slug}. Available: ${Object.keys(MI9_STORES).join(', ')}`);
  return s;
}

export async function mi9Search(
  storeSlug: string,
  query: string,
  storeId?: string,
  take = 10,
): Promise<{ total: number; products: Mi9Product[] }> {
  const store = getStore(storeSlug);
  const sid = storeId || store.defaultStoreId;
  const encoded = encodeURIComponent(query);
  const data = await mi9Get<any>(store, `/stores/${sid}/search?q=${encoded}&take=${take}&sort=relevance`);
  return {
    total: data.total || 0,
    products: (data.items || []).map((i: any) => mapProduct(i, store.name)),
  };
}

export async function mi9SearchOnSale(
  storeSlug: string,
  query: string,
  storeId?: string,
  take = 20,
): Promise<{ total: number; products: Mi9Product[] }> {
  const store = getStore(storeSlug);
  const sid = storeId || store.defaultStoreId;
  const encoded = encodeURIComponent(query);
  const data = await mi9Get<any>(store, `/stores/${sid}/search?q=${encoded}&take=${take}&sort=relevance&fpromotions=True`);
  return {
    total: data.total || 0,
    products: (data.items || []).map((i: any) => mapProduct(i, store.name)),
  };
}

export async function mi9GetStores(storeSlug: string): Promise<Mi9StoreLocation[]> {
  const store = getStore(storeSlug);
  const data = await mi9Get<any>(store, '/stores');
  return (data.items || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    retailerStoreId: s.retailerStoreId,
    address: s.addressLine1 || '',
    city: s.city || '',
    postalCode: s.postCode || '',
    shoppingModes: s.shoppingModes || [],
  }));
}

export async function mi9CompareAcrossStores(
  query: string,
  take = 3,
): Promise<{ store: string; products: Mi9Product[] }[]> {
  const results = await Promise.all(
    Object.keys(MI9_STORES).map(async slug => {
      try {
        const { products } = await mi9Search(slug, query, undefined, take);
        return { store: MI9_STORES[slug].name, products };
      } catch {
        return { store: MI9_STORES[slug].name, products: [] };
      }
    }),
  );
  return results;
}
