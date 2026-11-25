import codSpeedPlugin from '@codspeed/vitest-plugin';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [codSpeedPlugin()],
	test: {
		isolate: false,
		sequence: { concurrent: true },
		benchmark: { include: ['tests/benchmarks/**/*.bench.ts'] },
		// Use native ESM so parser timings don't include module runner export getters.
		experimental: { viteModuleRunner: false },
	},
	pack: {
		entry: ['src/index.ts'],
		format: ['esm'],
		dts: { generator: 'tsgo' },
		exports: true,
	},
	staged: {
		'*': 'vp check --fix',
	},
	lint: {
		options: {
			typeAware: true,
			typeCheck: true,
		},
		categories: {
			correctness: 'error',
			perf: 'error',
		},
	},
	fmt: {
		singleQuote: true,
		useTabs: true,
		printWidth: 120,
		ignorePatterns: ['**/CHANGELOG.md', '**/etc/*.api.md'],
	},
});
