import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHoot } from '../../src/index.ts';

const [filePath] = process.argv.slice(2);
assert(filePath, 'Usage: node --expose-gc measure-heap.ts <log file>');
assert(globalThis.gc, 'Run with --expose-gc');
const { gc } = globalThis;
const bytes = await readFile(filePath);

gc();
const before = process.memoryUsage().heapUsed;
const parser = parseHoot(bytes);
const records = Array.from(parser);
gc();
assert.equal(parser.bytesRead, bytes.length, 'Expected to read the complete log');
console.log((process.memoryUsage().heapUsed - before) / records.length);
