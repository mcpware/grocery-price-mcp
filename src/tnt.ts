/**
 * T&T Supermarket Canada — GraphQL API client.
 *
 * Endpoint: POST https://www.tntsupermarket.com/graphql
 * Platform: Magento 2 (open GraphQL, no auth required)
 * Currency: CAD
 */

const ENDPOINT = 'https://www.tntsupermarket.com/graphql';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TntProduct {
  name: string;
  sku: string;
  regularPrice: number;
  finalPrice: number;
  discountPercent: number;
  discountAmount: number;
  onSale: boolean;
  stockStatus: string;
  categories: string[];
}

export interface TntCategory {
  id: number;
  name: string;
  productCount: number;
  children: TntCategory[];
}

// ---------------------------------------------------------------------------
// Known category IDs (discovered 2026-05-31)
// ---------------------------------------------------------------------------

export const FLYER_CATEGORIES = {
  PRICE_DROP: 4585,
  MULTI_SAVE: 4652,
  PRODUCE: 3275,
  MEAT: 3273,
  SEAFOOD: 3274,
  DAIRY_FROZEN: 3272,
  FOOD_ESSENTIALS: 4041,
  SNACKS_DRINKS: 4042,
  BAKERY: 3278,
  KITCHEN: 3276,
  HEALTH_BEAUTY: 4043,
  HOME_LIVING: 4044,
} as const;

export const PRODUCT_CATEGORIES = {
  PRIVATE_LABEL: 4989,
  KITCHEN: 5034,
  BAKERY: 5176,
  FRUITS_VEG: 5035,
  MEAT_SEAFOOD: 5036,
  SNACKS_DRINKS: 4988,
  PANTRY_SAUCE: 4987,
  HEALTH_BEAUTY: 4976,
  DAIRY_FROZEN: 4985,
  HOME_LIVING: 4986,
  // Sub-categories
  BEEF: 5051,
  PORK: 5052,
  CHICKEN: 5054,
  DUMPLINGS: 4993,
  DIM_SUMS: 4994,
  SAUCES_CONDIMENTS: 5007,
  CHINESE_HERBS_DRIED: 5008,
  CANNED_FOODS: 5009,
  NOODLES_VERMICELLI: 5005,
  LEAFY_ROOT_VEG: 5046,
  FRESH_FRUITS: 5047,
  FROZEN_MEALS: 4995,
  COOKWARE_TOOLS: 4997,
} as const;

// ---------------------------------------------------------------------------
// GraphQL query helper
// ---------------------------------------------------------------------------

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Origin': 'https://www.tntsupermarket.com',
      'Referer': 'https://www.tntsupermarket.com/',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`T&T GraphQL ${res.status}: ${res.statusText}`);
  const json = await res.json() as any;
  if (json.errors?.length) throw new Error(`T&T GraphQL error: ${json.errors[0].message}`);
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Product mapper
// ---------------------------------------------------------------------------

function mapProduct(item: any): TntProduct {
  const min = item.price_range?.minimum_price || {};
  const reg = min.regular_price?.value || 0;
  const fin = min.final_price?.value || 0;
  const disc = min.discount || {};
  return {
    name: item.name || '',
    sku: item.sku || '',
    regularPrice: reg,
    finalPrice: fin,
    discountPercent: disc.percent_off || 0,
    discountAmount: disc.amount_off || 0,
    onSale: (disc.percent_off || 0) > 0,
    stockStatus: item.stock_status || 'UNKNOWN',
    categories: (item.categories || []).map((c: any) => c.name).filter(Boolean),
  };
}

const PRODUCT_FIELDS = `
  name sku stock_status
  categories { name }
  price_range {
    minimum_price {
      regular_price { value currency }
      final_price { value currency }
      discount { amount_off percent_off }
    }
  }
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchProducts(query: string, pageSize = 10): Promise<{ total: number; products: TntProduct[] }> {
  const escaped = query.replace(/"/g, '\\"');
  const data = await gql<any>(`{
    products(search: "${escaped}", pageSize: ${pageSize}) {
      total_count
      items { ${PRODUCT_FIELDS} }
    }
  }`);
  return {
    total: data.products.total_count,
    products: (data.products.items || []).map(mapProduct),
  };
}

export async function browseCategory(categoryId: number, pageSize = 20): Promise<{ total: number; categoryName: string; products: TntProduct[] }> {
  const data = await gql<any>(`{
    categoryList(filters: { ids: { eq: "${categoryId}" } }) {
      id name product_count
      products(pageSize: ${pageSize}, sort: { name: ASC }) {
        total_count
        items { ${PRODUCT_FIELDS} }
      }
    }
  }`);
  const cat = data.categoryList?.[0];
  if (!cat) return { total: 0, categoryName: 'Unknown', products: [] };
  return {
    total: cat.products?.total_count || 0,
    categoryName: cat.name,
    products: (cat.products?.items || []).map(mapProduct),
  };
}

export async function getSpecials(): Promise<{ priceDrop: TntProduct[]; multiSave: TntProduct[] }> {
  const [pd, ms] = await Promise.all([
    browseCategory(FLYER_CATEGORIES.PRICE_DROP, 50),
    browseCategory(FLYER_CATEGORIES.MULTI_SAVE, 50),
  ]);
  return {
    priceDrop: pd.products,
    multiSave: ms.products,
  };
}

export async function getCategories(): Promise<TntCategory[]> {
  const data = await gql<any>(`{
    categoryList(filters: { ids: { eq: "4975" } }) {
      id name children {
        id name children_count
        children { id name children_count }
      }
    }
  }`);
  const root = data.categoryList?.[0];
  if (!root) return [];
  function mapCat(c: any): TntCategory {
    return {
      id: c.id,
      name: c.name || '',
      productCount: parseInt(c.children_count) || 0,
      children: (c.children || []).map(mapCat),
    };
  }
  return (root.children || []).map(mapCat);
}

export async function comparePrices(query: string): Promise<TntProduct[]> {
  const { products } = await searchProducts(query, 10);
  return products.sort((a, b) => a.finalPrice - b.finalPrice);
}

export async function getStoreConfig(): Promise<any> {
  return gql<any>(`{
    storeConfig {
      store_code store_name
      base_url base_currency_code default_display_currency_code
      catalog_default_sort_by
    }
  }`);
}
