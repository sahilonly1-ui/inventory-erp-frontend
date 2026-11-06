/** Run: npx ts-node --transpile-only tests/specsView.test.ts */
import { buildView, brandCounts } from '../src/pages/specsView';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
}

const r = (brand: string, model: string, price: number) => ({ brand, model, price });
const rows = [
  r('Samsung', 'A07', 9999), r('Samsung', 'S25', 79999), r('Samsung', 'A17', 15999),
  r('Apple',   '16',  79900), r('Apple',   '14',  54900),
  r('Nothing', '4B',  0),     r('Nothing', '3A',  23999),
];
const names = (g: [string, any[]][]) => g.map(([b, l]) => [b, l.map(x => x.model)]);

console.log('\nSpecifications: brand and price filters:\n');

check('default keeps the order the sheet came in',
  names(buildView(rows, { brand: '', priceSort: '' })),
  [['Samsung', ['A07', 'S25', 'A17']], ['Apple', ['16', '14']], ['Nothing', ['4B', '3A']]]);

check('price low to high sorts inside each brand, brands keep their order',
  names(buildView(rows, { brand: '', priceSort: 'asc' })),
  [['Samsung', ['A07', 'A17', 'S25']], ['Apple', ['14', '16']], ['Nothing', ['3A', '4B']]]);

check('an item with no price goes last in its brand, not first',
  buildView(rows, { brand: 'Nothing', priceSort: 'asc' })[0][1].map(x => x.model),
  ['3A', '4B']);

check('a brand filter shows only that brand',
  names(buildView(rows, { brand: 'Apple', priceSort: '' })), [['Apple', ['16', '14']]]);

check('brand and price filters work together',
  names(buildView(rows, { brand: 'Samsung', priceSort: 'asc' })), [['Samsung', ['A07', 'A17', 'S25']]]);

check('equal prices keep their existing order',
  buildView([r('X', 'b', 100), r('X', 'a', 100), r('X', 'c', 50)], { brand: '', priceSort: 'asc' })[0][1].map(x => x.model),
  ['c', 'b', 'a']);

check('sorting does not change the rows it was given',
  (() => { const copy = JSON.stringify(rows); buildView(rows, { brand: '', priceSort: 'asc' }); return JSON.stringify(rows) === copy; })(), true);

check('a brand that is not there gives an empty list',
  buildView(rows, { brand: 'Sony', priceSort: '' }), []);

check('brand counts, in first-seen order',
  brandCounts(rows), [['Samsung', 3], ['Apple', 2], ['Nothing', 2]]);

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
