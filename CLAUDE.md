

---

## 由 Claude memory 搬入（2026-08-21）— `project_grocery_price_mcp.md`

原本住喺 `~/.claude/projects/-home-nicole/memory/`，每個 session 都載入。
呢啲係 project-specific，應該 cd 入呢個 repo 先 load。

---
name: project-grocery-price-mcp
description: 跨店比價 MCP（T&T + Save-On + PriceSmart + Fresh St + Urban Fare），全部免 login 開放 API；成熟後 integrate 入 meal-prep app
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d13e80d-dd48-4621-bdc1-440aa4665a71
---

## grocery-price-mcp

**Repo**: `~/MyGithub/grocery-price-mcp/`（未 push 上 GitHub）
**版本**: v0.2（2026-06-01）
**狀態**: MVP work，需要打磨一輪先 integrate

### 覆蓋 5 間超市（全部免 login、免 Instacart markup）

| 超市 | 平台 | API |
|---|---|---|
| T&T | Magento 2 GraphQL | `tntsupermarket.com/graphql`（需 Origin+Referer 繞 Akamai） |
| Save-On-Foods | mi9cloud REST | `storefrontgateway.saveonfoods.com/api/` |
| PriceSmart Foods | mi9cloud REST | `storefrontgateway.pricesmartfoods.com/api/` |
| Fresh St. Market | mi9cloud REST | `storefrontgateway.freshstmarket.com/api/` |
| Urban Fare | mi9cloud REST | `storefrontgateway.urbanfare.com/api/` |

### 核心 code

- `src/tnt.ts` — T&T Magento GraphQL client（search、browse category、specials）
- `src/mi9cloud.ts` — generic mi9cloud client（一個 function 搞 4 間超市）
- `src/index.ts` — MCP server（8 tools）

### 未做（打磨清單）

- [ ] push 上 GitHub（mcpware org）
- [ ] README
- [ ] T&T 購物車 mutation（Magento `createEmptyCart` + `addProductsToCart`，可能要 login session）
- [ ] 處理 T&T 搜中文 keyword 唔太準嘅問題（有啲搜唔到，要試英文）
- [ ] mi9cloud on-sale filter（`fpromotions=True`）整合入 tool
- [ ] Sungiven 如果之後開放價錢就加返
- [ ] **成熟後 integrate 入 meal-prep app**（[[project_meal_prep]]）→ 自動 check 特價 → 建議煮咩

### 點解唔用 Instacart

Nicole 原話：「Instacart 戇鳩嘅，次次都要登入，唔撚用得」。Instacart 有 markup + service fee + delivery fee + 要 login session。直接用超市自己嘅開放 API 全部免費、免 login、原價。

### 發現過程

Session 2（2026-05-31/06-01）：
1. 喺 Chrome 入面 T&T 搜尋頁發現佢用 Magento → probe `/graphql` → 200 OK
2. Akamai CDN 擋 raw curl → 加 Origin+Referer header 繞過
3. PriceSmart 搜尋頁發現 `storefrontgateway.pricesmartfoods.com` → probe → 200 OK
4. 發現 Save-On-Foods / Fresh St / Urban Fare 同屬 Pattison Food Group，用同一個 mi9cloud 平台 → 全部通
5. Sungiven = WooCommerce，API 通但價錢全 $0（故意隱藏）
6. Superstore/No Frills（Loblaw 集團）= 403 blocked
