import { execFileSync } from 'node:child_process';
import { mkdtempDisposableSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';
import { isDataRecord, parseDataLog } from 'wpilog-parser';
import { parseHoot, type HootRecord } from '../src/index.ts';

const input = fileURLToPath(new URL('./fixtures/hoot-c21.hoot', import.meta.url));
// Owlet 26.70.0, using --format=wpilog with no signal or time filters.
const reference = readFileSync(new URL('./fixtures/hoot-c21.owlet-26.70.0.wpilog', import.meta.url));
const owlet = process.env.OWLET_BIN;

function compareExport(wpilog: Uint8Array): Set<string> {
	const samples = new Map<string, Map<number, Extract<HootRecord, { kind: 'sample' }>>>();
	for (const record of parseHoot(readFileSync(input))) {
		if (record.kind === 'sample') {
			const name = record.name.startsWith('/') ? record.name : `/${record.name}`;
			samples.getOrInsertComputed(name, () => new Map()).set(record.timestamp, record);
		}
	}

	const exported = new Set<string>();
	const records = [...parseDataLog(wpilog)].filter(isDataRecord);
	for (const { entry } of records) {
		exported.add(entry.name);
	}
	expect(exported.size).toBeGreaterThan(0);
	expect([...exported.difference(new Set(samples.keys()))], 'Owlet signals missing from hoot-parser').toEqual([]);

	// Owlet may export fewer samples than the parser. Check every sample it does export.
	for (const { entry, timestamp, payload } of records) {
		expect(samples.get(entry.name)?.get(timestamp), `${entry.name} at ${timestamp} µs`).toMatchObject({
			type: entry.type,
			payload: typeof payload === 'bigint' ? Number(payload) : payload,
		});
	}
	return exported;
}

test('matches the Owlet 26.70.0 export of the C21 fixture', () => {
	compareExport(reference);
});

// Run with OWLET_BIN pointing at a candidate Owlet release to check for upstream changes.
test.skipIf(!owlet)('checks the selected Owlet binary against the pinned export', () => {
	using directory = mkdtempDisposableSync(join(tmpdir(), 'hoot-owlet-'));
	const output = join(directory.path, 'hoot-c21.wpilog');
	const scan = execFileSync(owlet!, [input, '--scan', '--full-scan'], { encoding: 'utf8' });
	const scanned = new Set(Array.from(scan.matchAll(/^\/?(.+?):[ \t]+[0-9a-f]+[ \t\r]*$/gim), ([, name]) => `/${name}`));
	expect(scanned.size, 'Owlet full scan returned no signals').toBeGreaterThan(0);
	execFileSync(owlet!, [input, output, '--format=wpilog']);
	const expected = new Set([...parseDataLog(reference)].filter(isDataRecord).map(({ entry }) => entry.name));
	// Live exports can end early; the full scan fills in the inventory but omits export-only signals.
	const exported = compareExport(readFileSync(output));
	expect(scanned.union(exported), 'Owlet signal inventory changed from 26.70.0').toEqual(expected);
});
