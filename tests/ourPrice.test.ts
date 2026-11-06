/** Run: npx tsx tests/ourPrice.test.ts */
import { ourPriceOf } from '../src/pages/ourPrice';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log('\nOur price on Market Prices:\n');
check('the price set on the Specifications tab is used, not the MRP',
  ourPriceOf({ specPrice: 24500, ourPrice: 28999 }), { value: 24500, isMrp: false });
check('with no Specifications price the MRP is the fallback, and says so',
  ourPriceOf({ specPrice: null, ourPrice: 28999 }), { value: 28999, isMrp: true });
check('a Specifications price of zero is not a price', ourPriceOf({ specPrice: 0, ourPrice: 28999 }), { value: 28999, isMrp: true });
check('a missing field behaves like no Specifications price', ourPriceOf({ ourPrice: 100 }), { value: 100, isMrp: true });
check('neither price known gives nothing to compare against', ourPriceOf({ specPrice: null, ourPrice: null }), { value: null, isMrp: true });
check('a watched item that is not a stocked product has no price at all', ourPriceOf({}), { value: null, isMrp: true });
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
