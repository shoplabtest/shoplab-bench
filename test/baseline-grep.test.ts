import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { changedSymbols, grepBaseline } from '../src/baseline-grep.ts';

const RENAME = `diff --git a/src/Money.tsx b/src/Money.tsx
--- a/src/Money.tsx
+++ b/src/Money.tsx
@@ -1,4 +1,4 @@
-export interface MoneyProps { amount: number; currency: string }
+export interface MoneyProps { value: number; currency: string }
-export function Money({ amount, currency }: MoneyProps) {
+export function Money({ value, currency }: MoneyProps) {
`;

test('a symbol is a name on a removed line that its replacement line no longer has', () => {
  assert.deepEqual(changedSymbols(RENAME), ['amount']);
});

test('a rename is found even when the old name is still used on other added lines', () => {
  const diff = '-  amount: number;\n+  value: number;\n ctx\n+  const total = props.amount * 2;\n';
  assert.deepEqual(changedSymbols(diff), ['amount']);
});

test('a kept alias is still reported, because the old name left its line: a grep cannot tell it is safe', () => {
  const diff = '-  compareAt?: number;\n+  wasAmount?: number;\n+  /** @deprecated */ compareAt?: number;\n';
  assert.deepEqual(changedSymbols(diff), ['compareAt']);
});

test('a moved URL path is a symbol: /products becomes /catalog/products', () => {
  const diff = "-const url = `${base}/products/${id}`;\n+const url = `${base}/catalog/products/${id}`;\n";
  assert.deepEqual(changedSymbols(diff), ['/products']);
});

test('a removed line with no replacement contributes all its names', () => {
  assert.deepEqual(changedSymbols('-  legacyFlag: boolean;\n ctx\n'), ['legacyFlag']);
});

test('an additive diff has no symbols, so the baseline is silent', () => {
  assert.deepEqual(changedSymbols('+++ b/a.ts\n+export const badge = 1;\n+export const more = 2;\n'), []);
});

test('dotted, dashed and colon names are one symbol; keywords and short words are not symbols', () => {
  const diff = "-  headers: { 'x-cart-id': id }\n-  emit('cart:updated', product.updated)\n-  const a = 1\n+  headers: { 'x-guest-cart-id': id }\n+  emit('cart:changed')\n";
  assert.deepEqual(changedSymbols(diff), ['cart:updated', 'product.updated', 'x-cart-id']);
});

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'bench-grep-'));
  const put = (p: string, body: string) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  };
  put('ui/src/Money.tsx', 'const amount = 1;\n'); // the PR's own repository
  put('cart/src/Totals.tsx', 'a\n<Money amount={x} />\nconst amountDue = 3;\nconst total_amount = 4;\n');
  put('cart/node_modules/dep/index.js', 'amount\n');
  put('cart/package-lock.json', '"amount"\n');
  put('cart/dist/bundle.js', 'amount\n');
  put('host/src/api.ts', "const x = { 'amount': 1 };\n");
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('reports every whole-word hit in the other repositories, and only there', () => {
  const r = grepBaseline('A-01', RENAME, { reposDir: dir, ownRepo: 'ui' });
  assert.equal(r.verdict, 'break');
  assert.deepEqual(r.sites.map((s) => `${s.consumer}/${s.file}:${s.line}`), ['cart/src/Totals.tsx:2', 'host/src/api.ts:1']);
  assert.equal(r.sites[0].snippet, '<Money amount={x} />');
});

test('no symbols or no hits means safe', () => {
  const quiet = grepBaseline('C-04', '+++ b/a\n+export const Badge = 1;\n', { reposDir: dir, ownRepo: 'ui' });
  assert.deepEqual([quiet.id, quiet.verdict, quiet.sites], ['C-04', 'safe', []]);
  assert.equal(grepBaseline('X', '-const nothingelsewhere = 1;\n', { reposDir: dir, ownRepo: 'ui' }).verdict, 'safe');
});

test('the number of reported sites is capped', () => {
  const r = grepBaseline('A-01', RENAME, { reposDir: dir, ownRepo: 'ui', maxSites: 1 });
  assert.equal(r.sites.length, 1);
});
