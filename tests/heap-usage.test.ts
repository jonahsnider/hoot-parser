import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'vite-plus/test';

const runNode = promisify(execFile);
const measureHeap = fileURLToPath(new URL('./helpers/measure-heap.ts', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/hoot-benchmark.hoot', import.meta.url));

// Baseline is about 158 bytes per record on Node 26. Leave room for V8 layout differences.
const maxHeapBytesPerRecord = 220;

test('keeps retained V8 heap below the per-record budget', async ({ expect }) => {
	// A fresh process keeps unrelated tests from affecting V8's record field layouts.
	const { stdout } = await runNode(process.execPath, ['--expose-gc', measureHeap, fixture]);
	expect(Number(stdout.trim())).toBeLessThan(maxHeapBytesPerRecord);
});
