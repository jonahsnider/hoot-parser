import { readFileSync } from 'node:fs';
import { expect, test } from 'vite-plus/test';
import { type HootRecord, parseHoot } from '../src/index.ts';

// Simulator captures, not robot logs. Expected timestamps and samples were checked against independent exports.
const c19 = readFileSync(new URL('./fixtures/hoot-c19.hoot', import.meta.url));
const c21 = readFileSync(new URL('./fixtures/hoot-c21.hoot', import.meta.url));

function samples(records: HootRecord[], name: string) {
	return records.filter((record) => record.kind === 'sample').filter((record) => record.name === name);
}

test('reads C19 custom signals across the 64-byte and 32-bit timestamp boundaries', () => {
	const input = Uint8Array.from(c19).buffer;
	const records = parseHoot(input);
	const parsed = [...records];
	expect(records.bytesRead).toBe(input.byteLength);
	expect(samples(parsed, 'str').map(({ payload }) => payload)).toEqual([
		'A'.repeat(64),
		'B'.repeat(63),
		'C'.repeat(65),
		'D'.repeat(66),
		'E'.repeat(64),
		'FF',
		'G'.repeat(66),
	]);
	expect(
		samples(parsed, 'ints')
			.slice(-3)
			.map(({ payload }) => payload),
	).toEqual([[-84, -71, -58, -45, -32, -19, -6, 7], [], [-126, -113, -100, -87, -74, -61, -48, -35]]);
	expect(samples(parsed, 'highTimestamp').find(({ timestamp }) => timestamp === 5_000_330_247)?.payload).toBe(-15.75);
});

test('reads C21 CAN telemetry under its bus name alongside custom entries', () => {
	const records = parseHoot(c21);
	const parsed = [...records];
	expect(records.bytesRead).toBe(c21.byteLength);
	const position = samples(parsed, '/Phoenix6/sim/TalonFX-9/Position');
	expect(position.findLast(({ timestamp }) => timestamp < 820_839)).toMatchObject({
		type: 'double',
		unit: 'rotations',
		payload: 0.85400390625,
	});
	expect(position.find(({ timestamp }) => timestamp === 820_839)?.payload).toBe(-2.68701171875);
	expect(samples(parsed, 'names')[0]?.payload).toEqual(['a', 'beta', 'µ', '']);
	expect(
		samples(parsed, 'varying')
			.slice(0, 3)
			.map(({ payload }) => payload),
	).toEqual([
		['abcd', 'α'],
		['w', 'longer'],
		['abcd', 'α'],
	]);
	expect(samples(parsed, 'voltage')[0]?.unit).toBe('V');
});

test('registers nested struct schemas and decodes a changing-length struct array', () => {
	const fixture = readFileSync(new URL('./fixtures/hoot-structs.hoot', import.meta.url));
	const parsed = [...parseHoot(fixture)];
	expect(parsed).toContainEqual({
		kind: 'schema',
		name: 'Pose2d',
		fields: [
			{ name: 'translation', value: 'Translation2d' },
			{ name: 'rotation', value: 'Rotation2d' },
		],
	});
	const poses = samples(parsed, 'poses');
	expect(poses[0]?.type).toBe('struct:Pose2d[]');
	expect(poses.slice(1, 3).map(({ payload }) => payload)).toEqual([
		[{ translation: { x: 2, y: -1 }, rotation: { value: 0.2 } }],
		[
			{ translation: { x: 4, y: -2 }, rotation: { value: 0.4 } },
			{ translation: { x: 6, y: -4 }, rotation: { value: 0.5 } },
		],
	]);
});

test('keeps complete samples from a HOOT file cut off mid-record', () => {
	const records = parseHoot(c19.subarray(0, -5));
	expect(records.bytesRead).toBe(0);
	const parsed = [...records];
	expect(records.bytesRead).toBe(876);
	expect(samples(parsed, 'highTimestamp').map(({ payload }) => payload)).toEqual([
		-0, -5.25, -10.5, -15.75, -21, -26.25,
	]);
});

test('rejects an unsupported HOOT layout instead of decoding it as the nearest known version', () => {
	const unknown = new Uint8Array(c21);
	unknown[70] = 22;
	expect(() => parseHoot(unknown).next()).toThrow('Only HOOT versions C19 and C21 are supported');
});
