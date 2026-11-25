# hoot-parser

Read CTRE HOOT logs in JavaScript or TypeScript. The ESM package runs in browsers and Node.js without Owlet, native binaries, or a server.

## Usage

Pass a `Uint8Array` or an `ArrayBuffer` to `parseHoot`. For a browser `File`, use `await file.arrayBuffer()`.

```ts
import { parseHoot } from 'hoot-parser';

function readFile(bytes: ArrayBuffer) {
	const records = parseHoot(bytes);
	for (const record of records) {
		if (record.kind === 'sample') {
			console.log(record.timestamp, record.name, record.payload, record.unit);
		}
	}
	return bytes.byteLength - records.bytesRead;
}
```

The generator yields records in file order, not necessarily in timestamp order. Timestamps are in microseconds. Custom signal names are kept as recorded, and struct schema records contain parsed fields. If a file ends mid-record, the generator yields the complete records and leaves `bytesRead` at the end of the last complete record.

The parser supports C19 and C21 logs, including custom signals and selected TalonFX, CANcoder, and Pigeon2 telemetry. It skips signals whose layout it doesn't recognize. Custom `int64` values are returned as JavaScript numbers and may lose precision above `Number.MAX_SAFE_INTEGER`.

See the [API report](etc/hoot-parser.api.md) for the exported types.
