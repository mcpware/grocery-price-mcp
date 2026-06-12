# grocery-price-mcp

Real-time grocery price comparison for Vancouver. Ask your AI "雞蛋邊間最平" and get actual store prices from 5 chains, no Instacart markup.

Works with Claude Code, Claude Desktop, Cursor, or any MCP-compatible AI tool.

## What it does

Queries store APIs directly to compare grocery prices across Vancouver supermarkets. No scraping, no login, no Instacart middleman fees.

| Store | API | Login needed |
|-------|-----|-------------|
| T&T Supermarket | Magento 2 GraphQL | No |
| Save-On-Foods | mi9cloud REST | No |
| PriceSmart Foods | mi9cloud REST | No |
| Fresh St. Market | mi9cloud REST | No |
| Urban Fare | mi9cloud REST | No |
| Walmart / Amazon / Costco | Google Shopping | API key |

Save-On, PriceSmart, Fresh St, and Urban Fare are all Pattison Food Group stores sharing the same API.

## Tools

| Tool | What it does |
|------|-------------|
| `grocery_compare` | Compare one product across all 5 stores in parallel |
| `full_compare` | All 5 API stores + Walmart/Amazon/Costco via Google Shopping |
| `tnt_search` | Search T&T with sale flags and stock status |
| `tnt_specials` | Current T&T weekly specials (Price Drop + Multi-Save) |
| `tnt_browse` | Browse T&T by category |
| `tnt_categories` | List T&T category IDs |
| `store_search` | Search any single Pattison store by name |
| `store_locations` | List physical store locations |
| `shopping_search` | Google Shopping search across Canadian stores |
| `walmart_amazon_costco` | Compare across those 3 specifically |
| `instacart_markup` | Which stores charge more on Instacart vs in-store |
| `instacart_check` | Check one store's Instacart markup status |
| `price_confirm` | Scrape a product URL to confirm price/stock |

## Install

```bash
git clone https://github.com/mcpware/grocery-price-mcp.git
cd grocery-price-mcp
npm install
```

### Claude Code

Add to your MCP config (`.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "grocery-price": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/grocery-price-mcp"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grocery-price": {
      "command": "node",
      "args": ["/path/to/grocery-price-mcp/dist/index.js"]
    }
  }
}
```

Build first: `npm run build`

## Config

The 5 direct-API stores (T&T, Save-On, PriceSmart, Fresh St, Urban Fare) work with **zero API keys**.

For Walmart/Amazon/Costco comparison, set:

```bash
export SERPER_API_KEY=your_key_here  # google.serper.dev, free tier available
```

## Usage examples

Once connected, just ask your AI:

- "雞蛋邊間最平"
- "Compare chicken breast price across all stores"
- "T&T 今個禮拜有咩特價"
- "Is Save-On cheaper than T&T for salmon"
- "牛奶 full compare"

## How it works

Each store has its own API client:

- **T&T** uses Magento 2's GraphQL endpoint with browser-like headers to pass Akamai CDN
- **Save-On / PriceSmart / Fresh St / Urban Fare** all use mi9cloud's REST API (same Pattison Food Group backend)
- **Walmart / Amazon / Costco** use Google Shopping data via Serper API

No browser automation. No headless Chrome. Just HTTP requests to public APIs.

## Instacart markup data

The `instacart_markup` tool shows which Vancouver stores charge more on Instacart vs buying in-store. Some stores have price parity (T&T, Walmart), others add 10-15% markup (Save-On, Safeway, IGA). This is based on manual verification.

## Limitations

- T&T Chinese keyword search can be unreliable. Try English keywords.
- Superstore / No Frills (Loblaw) APIs return 403. Not supported.
- Prices are real-time from store APIs but may differ from in-store shelf prices.
- Default store locations are set to Vancouver area. Change store IDs in source for other locations.

## License

MIT
