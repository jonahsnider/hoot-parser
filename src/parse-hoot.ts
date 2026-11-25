import { parseStructSpecification, type StructDeclaration, type StructPayload, StructRegistry } from 'wpilib-struct';
import { hootCanFrames, readHootCanField } from './hoot-can.ts';
import { HootBitReader, hootEndOfStream } from './hoot-compression.ts';

const headerSize = 80;
const canLengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];
const text = new TextDecoder();
const valueTypes = [
	'',
	'boolean',
	'int64',
	'float',
	'double',
	'string',
	'boolean[]',
	'int64[]',
	'float[]',
	'double[]',
	'string[]',
];
const valueRecord = 0xe0;
const nameRecord = 0xe1;
const unitRecord = 0xe2;
const schemaRecord = 0xe3;
const schemaType = 11;
const structType = 12;
const networkType = 13;

export type HootValue = number | boolean | string | number[] | boolean[] | string[] | StructPayload | StructPayload[];

/** A decoded signal sample or struct schema, in file order. */
export type HootRecord =
	| { kind: 'schema'; name: string; fields: StructDeclaration[] }
	| {
			kind: 'sample';
			name: string;
			type: string;
			unit: string | undefined;
			/** Time in microseconds. */
			timestamp: number;
			payload: HootValue;
	  };

export type HootGenerator = Generator<HootRecord, void, unknown> & {
	/**
	 * Byte offset after the last complete record or end marker, rounded up.
	 * This is zero until parsing starts and excludes any incomplete tail.
	 */
	readonly bytesRead: number;
};

/** Decode supported signals and struct schemas from an in-memory C19 or C21 HOOT file. */
export function parseHoot(input: Uint8Array | ArrayBuffer): HootGenerator {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const progress = { bytesRead: 0 };
	return Object.defineProperty(decode(bytes, progress), 'bytesRead', {
		get: () => progress.bytesRead,
	}) as HootGenerator;
}

function decodeValue(type: number, payload: Uint8Array): HootValue | undefined {
	const { length } = payload;
	if (type === 5) {
		return text.decode(payload);
	}
	if (type === 1) {
		return length === 1 ? payload[0] !== 0 : undefined;
	}
	if (type === 6) {
		return Array.from(payload, (byte) => byte !== 0);
	}
	const view = new DataView(payload.buffer, payload.byteOffset, length);
	if (type === 10) {
		const values: string[] = [];
		for (let i = 0; i < length;) {
			if (length - i < 4) {
				return undefined;
			}
			const size = view.getUint32(i, true);
			i += 4;
			if (size > length - i) {
				return undefined;
			}
			values.push(text.decode(payload.subarray(i, i + size)));
			i += size;
		}
		return values;
	}

	const scalar = type < 6 ? type : type - 5;
	const width = scalar === 3 ? 4 : 8;
	if (length % width !== 0 || (type < 6 && length !== width)) {
		return undefined;
	}
	const read = (i: number) => {
		switch (scalar) {
			case 2:
				return Number(view.getBigInt64(i, true));
			case 3:
				return view.getFloat32(i, true);
			default:
				return view.getFloat64(i, true);
		}
	};
	return type < 6 ? read(0) : Array.from({ length: length / width }, (_, i) => read(i * width));
}

type CustomSignal = { name?: string; unit?: string; schema?: number };

function* decode(bytes: Uint8Array, progress: { bytesRead: number }): Generator<HootRecord, void, unknown> {
	if (bytes.length <= headerSize) {
		throw new Error('The HOOT header or data is missing.');
	}
	const version = bytes[70];
	const layout = bytes[71];
	if (!((version === 19 && layout === 1) || (version === 21 && layout === 2))) {
		throw new Error('Only HOOT versions C19 and C21 are supported.');
	}

	const reader = new HootBitReader(bytes, headerSize);
	const header = new Uint8Array(layout === 2 ? 11 : 10);
	const view = new DataView(header.buffer);
	const extendedLength = new Uint8Array(4);
	const lengthView = new DataView(extendedLength.buffer);
	const previous = new Map<number, Uint8Array>();
	const custom = new Map<number, CustomSignal>();
	const networks = new Map<number, string>();
	const structs = new StructRegistry();
	progress.bytesRead = headerSize;

	for (;;) {
		const first = reader.read();
		if (first === hootEndOfStream) {
			progress.bytesRead = Math.ceil(reader.bitOffset / 8);
			break;
		}
		if (first < 0 || !reader.readInto(header, 1, header.length)) {
			break;
		}
		header[0] = first;
		const id = view.getUint32(0, true);
		const flags = view.getUint16(8, true);
		const network = header[10] ?? 0;
		const kind = id >>> 24;
		const type = (id >>> 18) & 63;
		const signalId = id & 0xfff;
		const signalKey = (type << 12) | signalId;
		let length = canLengths[flags >>> 12]!;
		let exactLength = (id >>> 12) & 63;
		// A 64-byte payload doesn't fit in the six-bit length; the DLC distinguishes it from an empty value.
		if (exactLength === 0 && length === 64) {
			exactLength = 64;
		}
		if (kind >= valueRecord && kind <= unitRecord && (flags & 0x800) !== 0) {
			if (!reader.readInto(extendedLength, 0, 4)) {
				break;
			}
			length = lengthView.getUint32(0, true);
			exactLength = length;
		}
		if (length > reader.remainingBits) {
			break;
		}

		const frame = hootCanFrames.get(id & 0x1fff_ffc0);
		const knownCan = kind < valueRecord && frame?.length === length;
		const knownCustom =
			kind >= valueRecord && kind <= schemaRecord && type > 0 && type <= networkType && exactLength <= length;
		let payload: Uint8Array | undefined;
		if (knownCan || knownCustom) {
			// Delta history uses the full ID, including the packed length of short custom values, but not the bus index.
			const old = previous.get(id);
			payload = old?.length === length ? old : new Uint8Array(length);
			if (payload !== old) {
				if (old) {
					payload.set(old.subarray(0, length));
				}
				previous.set(id, payload);
			}
		}
		let complete = true;
		for (let i = 0; i < length; i++) {
			const byte = reader.read();
			if (byte < 0 || byte === hootEndOfStream) {
				complete = false;
				break;
			}
			if (payload) {
				payload[i] = payload[i]! + byte;
			}
		}
		if (!complete) {
			break;
		}
		progress.bytesRead = Math.ceil(reader.bitOffset / 8);
		if (!payload) {
			continue;
		}

		const timestamp = view.getUint32(4, true) + (flags & 0x7ff) * 2 ** 32 + 1;
		if (knownCan) {
			const bus = layout === 2 ? `${networks.get(network) ?? `CAN-${network}`}/` : '';
			const path = `/Phoenix6/${bus}${frame.device}-${id & 63}`;
			for (const field of frame.fields) {
				yield {
					kind: 'sample',
					name: `${path}/${field[0]}`,
					type: 'double',
					unit: field[1],
					timestamp,
					payload: readHootCanField(payload, field),
				};
			}
			continue;
		}

		const value = payload.subarray(0, exactLength);
		if (type === networkType) {
			if (kind === nameRecord) {
				networks.set(signalId, text.decode(value));
			}
			continue;
		}
		let signal = custom.get(signalKey);
		if (!signal) {
			signal = {};
			custom.set(signalKey, signal);
		}
		switch (kind) {
			case nameRecord:
				signal.name = text.decode(value);
				continue;
			case unitRecord:
				signal.unit = text.decode(value);
				continue;
			case schemaRecord:
				if (value.length === 2) {
					signal.schema = value[0]! | (value[1]! << 8);
				}
				continue;
		}
		if (signal.name === undefined || signal.name === '') {
			continue;
		}
		if (type === schemaType && signal.schema === 1 && value.length > 0) {
			const schema = text.decode(value);
			try {
				structs.register(signal.name, schema);
				yield { kind: 'schema', name: signal.name, fields: parseStructSpecification(schema) };
			} catch {
				// An invalid schema doesn't prevent reading other signals.
			}
			continue;
		}
		const { name, unit } = signal;
		const entryType = valueTypes[type];
		if (entryType !== undefined && entryType !== '') {
			const decoded = decodeValue(type, value);
			if (decoded !== undefined) {
				yield { kind: 'sample', name, type: entryType, unit, timestamp, payload: decoded };
			}
			continue;
		}
		if (type === structType && signal.schema !== undefined) {
			const schema = custom.get((schemaType << 12) | signal.schema)?.name;
			if (schema === undefined || schema === '') {
				continue;
			}
			try {
				const decoded = schema.endsWith('[]')
					? structs.decodeArray(schema.slice(0, -2), value)
					: structs.decode(schema, value);
				if (typeof decoded !== 'string') {
					yield { kind: 'sample', name, type: `struct:${schema}`, unit, timestamp, payload: decoded };
				}
			} catch {
				// An invalid struct value doesn't prevent reading other signals.
			}
		}
	}
}
