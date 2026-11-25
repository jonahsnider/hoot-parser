type Field = readonly [name: string, unit: string, bit: number, width: number, scale: number, unsignedOffset?: number];

const motorVoltage = ['MotorVoltage', 'V', 2, 13, 0.01] as const;
const currents = [
	['StatorCurrent', 'A', 0, 15, 0.02],
	['SupplyCurrent', 'A', 15, 15, 0.02],
	['SupplyVoltage', 'V', 30, 10, 0.025, 4],
] as const satisfies readonly Field[];
const motion = [
	['Velocity', 'rot/s', 2, 19, 1 / 512],
	['Position', 'rotations', 21, 27, 1 / 4096],
] as const satisfies readonly Field[];

function atOffset(fields: readonly Field[], offset: number): Field[] {
	return fields.map(([name, unit, bit, width, scale, unsignedOffset]) => [
		name,
		unit,
		bit + offset,
		width,
		scale,
		unsignedOffset,
	]);
}

type Frame = { device: string; length: number; fields: readonly Field[] };

/** Verified layouts of public device signals. Masking the frame ID leaves out the logger flags and CAN device number. */
export const hootCanFrames = new Map<number, Frame>([
	[0x2042c40, { device: 'TalonFX', length: 8, fields: [motorVoltage] }],
	[0x2042d40, { device: 'TalonFX', length: 8, fields: currents }],
	[0x2042dc0, { device: 'TalonFX', length: 8, fields: motion }],
	[
		0x2042b40,
		{ device: 'TalonFX', length: 64, fields: [motorVoltage, ...atOffset(currents, 64), ...atOffset(motion, 192)] },
	],
	[
		0x5042bc0,
		{
			device: 'CANcoder',
			length: 32,
			fields: [
				['Velocity', 'rot/s', 0, 19, 1 / 512],
				['Position', 'rotations', 19, 27, 1 / 4096],
				['SupplyVoltage', 'V', 128, 8, 0.05, 4],
			],
		},
	],
	[
		0x15042c00,
		{
			device: 'Pigeon2',
			length: 64,
			fields: [
				['Yaw', 'deg', 0, 28, 360 / 131072],
				['AngularVelocityZWorld', 'deg/s', 360, 20, 1 / 256],
				['SupplyVoltage', 'V', 448, 12, 1 / 2048, 12],
			],
		},
	],
]);

export function readHootCanField(payload: Uint8Array, [, , bit, width, scale, unsignedOffset]: Field): number {
	const start = bit >> 3;
	const end = (bit + width - 1) >> 3;
	let word = 0;
	for (let i = end; i >= start; i--) {
		word = word * 256 + payload[i]!;
	}
	const raw = Math.floor(word / (1 << (bit & 7))) & ((1 << width) - 1);
	if (unsignedOffset !== undefined) {
		return raw * scale + unsignedOffset;
	}
	const sign = 1 << (width - 1);
	return ((raw ^ sign) - sign) * scale;
}
