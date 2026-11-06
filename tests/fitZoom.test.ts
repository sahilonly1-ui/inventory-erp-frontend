/** Run: npx tsx tests/fitZoom.test.ts */
import { fitZoom } from '../src/components/fitZoom';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log('\nFitting a page to the screen:\n');
check('content that fits is left alone', fitZoom(1100, 900), 1);
check('content exactly as wide as the screen is left alone', fitZoom(1100, 1100), 1);
check('a pixel of rounding does not shrink the page', fitZoom(1100, 1101), 1);
check('a table that is 1400 wide on 880 is scaled to fit', fitZoom(880, 1400), 0.628);
check('half as wide again needs two thirds', fitZoom(900, 1350), 0.666);
check('it never makes the page bigger', fitZoom(500, 100), 1);
check('beyond the readable floor the rest is left to scroll', fitZoom(400, 2000), 0.5);
check('a different floor can be asked for', fitZoom(400, 2000, 0.7), 0.7);
check('the scaled width never exceeds the screen',
  (() => { const z = fitZoom(880, 1400); return 1400 * z <= 880; })(), true);
check('nothing measured yet means no change', fitZoom(0, 1400), 1);
check('no content width means no change', fitZoom(880, 0), 1);
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
