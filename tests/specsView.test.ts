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
const models = (v: { groups: [string, any[]][] }) => v.groups.flatMap(([, l]) => l.map((x: any) => x.model));
const names = (v: { groups: [string, any[]][] }) => v.groups.map(([b, l]) => [b, l.map((x: any) => x.model)]);

console.log('\nSpecifications: brand and price filters:\n');

check('default keeps brands grouped, in the order the sheet came in',
  names(buildView(rows, { brand: '', priceSort: '' })),
  [['Samsung', ['A07', 'S25', 'A17']], ['Apple', ['16', '14']], ['Nothing', ['4B', '3A']]]);
check('default is a grouped view', buildView(rows, { brand: '', priceSort: '' }).grouped, true);

check('price low to high is ONE list, cheapest first, whatever the brand',
  models(buildView(rows, { brand: '', priceSort: 'asc' })),
  ['A07', 'A17', '3A', '14', '16', 'S25', '4B']);

check('price low to high is not grouped by brand', buildView(rows, { brand: '', priceSort: 'asc' }).grouped, false);

check('an item with no price goes to the very end, not to the top',
  models(buildView(rows, { brand: '', priceSort: 'asc' })).slice(-1), ['4B']);

check('a cheap phone of a later brand comes before a dearer one of an earlier brand',
  (() => { const m = models(buildView(rows, { brand: '', priceSort: 'asc' })); return m.indexOf('3A') < m.indexOf('S25'); })(), true);

check('a brand filter shows only that brand',
  names(buildView(rows, { brand: 'Apple', priceSort: '' })), [['Apple', ['16', '14']]]);

check('brand and price filters together: that brand only, cheapest first',
  models(buildView(rows, { brand: 'Samsung', priceSort: 'asc' })), ['A07', 'A17', 'S25']);

check('equal prices keep their existing order',
  models(buildView([r('X', 'b', 100), r('Y', 'a', 100), r('X', 'c', 50)], { brand: '', priceSort: 'asc' })), ['c', 'b', 'a']);

check('sorting does not change the rows it was given',
  (() => { const copy = JSON.stringify(rows); buildView(rows, { brand: '', priceSort: 'asc' }); return JSON.stringify(rows) === copy; })(), true);

check('a brand that is not there gives nothing to show',
  buildView(rows, { brand: 'Sony', priceSort: 'asc' }).groups, []);

check('brand counts, in first-seen order',
  brandCounts(rows), [['Samsung', 3], ['Apple', 2], ['Nothing', 2]]);

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
