import { readFile } from 'node:fs/promises';
import { afterEach, describe, test, vi } from 'vite-plus/test';
import { parseHoot } from '../../src/index.ts';

const fixtures = await Promise.all(
	['hoot-c19', 'hoot-c21', 'hoot-structs', 'hoot-benchmark'].map(async (name) => ({
		name,
		bytes: await readFile(new URL(`../fixtures/${name}.hoot`, import.meta.url)),
	})),
);

// Select the CSP-safe struct decoder outside the timed section, including warmup.
const closureStructs = {
	beforeAll() {
		vi.spyOn(globalThis, 'Function').mockImplementation(function () {
			throw new EvalError('Code generation disallowed by CSP');
		});
	},
	afterAll() {
		vi.restoreAllMocks();
	},
};

afterEach(() => vi.restoreAllMocks());

for (const { name, bytes } of fixtures) {
	describe(name, { concurrent: false }, () => {
		test('parseHoot', async ({ bench }) => {
			const parse = () => {
				for (const _record of parseHoot(bytes)) {
					// Discard each record to measure parsing without retaining the log.
				}
			};
			const baseline = bench('parseHoot', parse);
			if (name === 'hoot-structs' || name === 'hoot-benchmark') {
				await bench.compare(baseline, bench('closure parseHoot', closureStructs, parse));
			} else {
				await baseline.run();
			}
		});

		test('parseHoot (collect)', async ({ bench }) => {
			await bench('parseHoot (collect)', () => Array.from(parseHoot(bytes))).run();
		});
	});
}
