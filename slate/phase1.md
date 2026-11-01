# Phase 1 dev PR slate

28 PRs in categories A to D on the ten Phase 1 repos at `bench-v1.0-base`. This is a plan: no PR branch, answer key or SHA exists yet. Each PR will open as `bench/<id>` and stay open, never merged. Splits (dev or hold-out) are assigned later by the seeded shuffle in `manifest.json`, not by hand.

**Sites** are the consumer files the key will list, checked against the baseline code. **Decoys** are look-alike sites that must not be flagged (`mustNotFlag`).

Phase 1 leaves these kinds for Phase 2 (decided by the owner): `db-table`, `db-column`, `type`, `api-operation`, `function`, `config-key`, `deploy-output`, `package`. They have no cross-repo consumer in the Phase 1 baseline. D-03 touches a table but has no consumer, so it only tests that the agent stays quiet.

## A. Clear breaks (13)

| ID | Repo | Change | Kind | Sites in other repos | Decoys |
| --- | --- | --- | --- | --- | --- |
| A-01 | ui-kit | `Money` prop `amount` renamed to `value` | component | cart-mfe `Totals.tsx` (3 uses), `CartLines.tsx` (2); account-mfe `OrderHistory.tsx` | ui-kit `PriceTag.tsx` is fixed in the same PR |
| A-02 | ui-kit | `DEFAULT_CURRENCY` renamed to `SHOP_CURRENCY` | value | host `App.tsx` | `CURRENCIES` is untouched |
| A-03 | ui-kit | `ApiError.status` renamed to `statusCode` | class | account-mfe `errors.ts`; catalog-mfe `ProductDetail.tsx`; cart-mfe `useCart.ts`; host `api.ts` | the `state.status === 'loading'` checks in the MFEs are not `ApiError` |
| A-04 | catalog-api | `/categories` field `children` renamed to `subcategories` | http-endpoint | catalog-mfe `types.ts`, `CategoryNav.tsx` | host `RemoteBoundary.tsx` `children` is React props |
| A-05 | catalog-api | `/search` query param `q` renamed to `query` | http-endpoint | catalog-mfe `api.ts` | catalog-mfe `Page.tsx` URL param `q` is the browser URL, not the API |
| A-06 | catalog-api | product `price` object becomes number plus top-level `currency` | http-endpoint | cart-api `app.ts` (4 reads); catalog-mfe `ProductCard.tsx`, `ProductDetail.tsx` | cart-mfe `cartApi.ts` reads only `name` |
| A-07 | cart-api | `POST /cart/coupon` body field `code` renamed to `couponCode` | http-endpoint | cart-mfe `cartApi.ts`; infra `scripts/smoke.mjs` | cart-api `seed.ts` `code` is a DB column |
| A-08 | iam | login and refresh response field `accessToken` renamed to `token` | http-endpoint | host `auth.tsx`, `api.ts`; infra `scripts/smoke.mjs` | host `storage.ts` `Tokens` is the stored shape, fixed with the callers |
| A-09 | iam | env var `JWT_SECRET` renamed to `JWT_SIGNING_KEY` | env-var | infra `docker-compose.yml` (iam block), `charts/iam/values.yaml` | catalog-api and cart-api still read `JWT_SECRET` for their own use |
| A-10 | host | exposed module `./ui` renamed to `./api` | federation-module | catalog-mfe `cart.ts`, `Page.tsx`; cart-mfe `Cart.tsx`, `cartApi.ts`; account-mfe `Account.tsx`, `ProfileForm.tsx`, `OrderHistory.tsx`, `AuthForm.tsx` | |
| A-11 | catalog-mfe | exposed module `./Page` renamed to `./CatalogPage` | federation-module | host `remotes.ts`, `remote-modules.d.ts` | host `Cart` and `Account` imports |
| A-12 | catalog-api | event `product.updated` field `productId` renamed to `id` | event | cart-api `consumer.ts`, `events.ts` | |
| A-13 | host | window event `cart:updated` detail `count` renamed to `quantity` | browser-state | catalog-mfe `cart.ts`, cart-mfe `cartApi.ts`; their `remote-modules.d.ts` | host `auth.tsx` emits it and is fixed in the same PR |

## B. Hidden or indirect breaks (6)

| ID | Repo | Change | Kind | Hard sites | Why it is hard |
| --- | --- | --- | --- | --- | --- |
| B-01 | catalog-api | product routes move to `/catalog/products` | http-endpoint | cart-api `clients/catalog.ts`; catalog-mfe `api.ts`; cart-mfe `cartApi.ts`; host `vite.config.ts` proxy | three URLs are built from templates and one is a proxy config entry |
| B-02 | ui-kit | `PriceTag` prop `amount` renamed to `price` | component | catalog-mfe `Price.tsx` (spread wrapper), `ProductCard.tsx`, `ProductDetail.tsx` | used through a wrapper with spread props and a re-export |
| B-03 | catalog-api | event `price` changes from integer to decimal string | event | cart-api `consumer.ts` (line 9) | the `Number.isInteger` guard drops the update silently, with no crash and no error |
| B-04 | cart-mfe | `localStorage` key `cartId` renamed to `shoplab.cartId` | browser-state | host `storage.ts`; catalog-mfe `cart.ts`; infra `scripts/e2e.mjs` | the literal is duplicated in three repos and the host merge breaks quietly |
| B-05 | cart-api | header `x-cart-id` renamed to `x-guest-cart-id` | http-endpoint | cart-mfe `cartApi.ts`; catalog-mfe `cart.ts`; infra `scripts/smoke.mjs` | a header name in a string literal |
| B-06 | cart-api | env var `CATALOG_API_URL` renamed to `CATALOG_URL` | env-var | infra `docker-compose.yml`, `charts/cart-api/values.yaml` | the Helm values still set the old name |

## C. Safe changes, no finding expected (5)

| ID | Repo | Change |
| --- | --- | --- |
| C-01 | catalog-api | add optional `description` to the product response |
| C-02 | iam | add `createdAt` to the user response |
| C-03 | cart-api | add `GET /cart/count` |
| C-04 | ui-kit | add a new `Badge` component export |
| C-05 | catalog-api | index-only migration on `catalog_products(name)` |

## D. Looks breaking, is safe (4)

| ID | Repo | Change | Why it is safe |
| --- | --- | --- | --- |
| D-01 | ui-kit | `PriceTag` prop `compareAt` renamed to `wasAmount`, `compareAt` kept as a deprecated alias | callers keep working |
| D-02 | cart-api | `POST /cart/items` accepts `quantity` as a number or a numeric string | widened input type |
| D-03 | catalog-api | table `catalog_products` renamed to `catalog_items`, `products` view recreated over it | the view keeps the old name and columns |
| D-04 | host | storage key `shoplab.auth` renamed to `shoplab.session`, reading the old key as a fallback | nothing else reads the key |

## Kind coverage after this slate

component 2, value 1, class 1, http-endpoint 10, env-var 2, federation-module 2, event 2, browser-state 3 (A-13, B-04, D-04). `package` waits for category F.

## Order of work

1. Write the PR branches for A (13), then B (6), each against the tagged baseline SHA.
2. Write C and D.
3. Write the answer keys (sites, decoys, `hard` flags), then review them a second time before any agent run.
4. Add `baseSha` and `headSha` for every PR to `manifest.json` with the pin tool.
