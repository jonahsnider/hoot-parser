type Field = readonly [
	name: string,
	unit: string | undefined,
	bit: number,
	width: number,
	decode: number | readonly (string | undefined)[] | ((raw: number) => number),
	unsignedOffset?: number,
];

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
	return fields.map(([name, unit, bit, width, decode, unsignedOffset]) => [
		name,
		unit,
		bit + offset,
		width,
		decode,
		unsignedOffset,
	]);
}

const controlModes = [
	'DisabledOutput',
	'NeutralOut',
	'StaticBrake',
	'DutyCycleOut',
	'PositionDutyCycle',
	'VelocityDutyCycle',
	'MotionMagicDutyCycle',
	'DutyCycleFOC',
	'PositionDutyCycleFOC',
	'VelocityDutyCycleFOC',
	'MotionMagicDutyCycleFOC',
	'VoltageOut',
	'PositionVoltage',
	'VelocityVoltage',
	'MotionMagicVoltage',
	'VoltageFOC',
	'PositionVoltageFOC',
	'VelocityVoltageFOC',
	'MotionMagicVoltageFOC',
	'TorqueCurrentFOC',
	'PositionTorqueCurrentFOC',
	'VelocityTorqueCurrentFOC',
	'MotionMagicTorqueCurrentFOC',
	'Follower',
	'Reserved',
	'CoastOut',
	'UnauthorizedDevice',
	'MusicTone',
	'MotionMagicVelocityDutyCycle',
	'MotionMagicVelocityDutyCycleFOC',
	'MotionMagicVelocityVoltage',
	'MotionMagicVelocityVoltageFOC',
	'MotionMagicVelocityTorqueCurrentFOC',
	'MotionMagicExpoDutyCycle',
	'MotionMagicExpoDutyCycleFOC',
	'MotionMagicExpoVoltage',
	'MotionMagicExpoVoltageFOC',
	'MotionMagicExpoTorqueCurrentFOC',
];

const bridgeOutputs = [
	'BridgeReq_Coast',
	'BridgeReq_Brake',
	undefined,
	undefined,
	undefined,
	undefined,
	'BridgeReq_Trapez',
	'BridgeReq_FOCTorque',
	'BridgeReq_MusicTone',
	'BridgeReq_FOCEasy',
	undefined,
	undefined,
	'BridgeReq_FaultBrake',
	'BridgeReq_FaultCoast',
	'BridgeReq_ActiveBrake',
	'BridgeReq_VariableBrake',
];

const connectedMotors = [
	'Unknown',
	'Falcon500_Integrated',
	'KrakenX60_Integrated',
	'KrakenX44_Integrated',
	'Minion_JST',
	'Brushed_AB',
	'Brushed_AC',
	'Brushed_BC',
	'NEO_JST',
	'NEO550_JST',
	'VORTEX_JST',
	'Custom Brushless',
];

const motorOutputStatuses = ['Unknown', 'Off', 'StaticBraking', 'Motoring', 'DiscordantMotoring', 'RegenBraking'];
const limitStates = ['Closed To Ground', 'Open'];
const enableStates = ['Disabled', 'Enabled'];

const floatBits = new DataView(new ArrayBuffer(4));
function pidFloat(raw: number): number {
	floatBits.setUint32(0, raw);
	return Math.max(-10_000, Math.min(10_000, floatBits.getFloat32(0)));
}

// Each closed-loop output is exported in duty cycle, voltage and torque-current units.
const pidOutputs = [
	['IntegratedAccum', 256, 18, 0.01, 0.1],
	['FeedForward', 274, 12, 0.02, 0.2],
	['ProportionalOutput', 392, 18, 0.01, 0.1],
	['DerivativeOutput', 410, 18, 0.01, 0.1],
	['Output', 428, 18, 0.01, 0.1],
] as const;

const talonStatus: readonly Field[] = [
	motorVoltage,
	['ForwardLimit', undefined, 29, 1, limitStates],
	['ReverseLimit', undefined, 30, 1, limitStates],
	['AppliedRotorPolarity', undefined, 31, 1, ['PositiveIsCounterClockwise', 'PositiveIsClockwise']],
	['DutyCycle', 'fractional', 32, 12, 1 / 1024],
	['BridgeOutput', undefined, 44, 4, bridgeOutputs],
	['TorqueCurrent', 'A', 48, 16, 0.01],
	...atOffset(currents, 64),
	['DeviceTemp', '℃', 104, 8, 1, 0],
	['ProcessorTemp', '℃', 112, 8, 1, 0],
	['AncillaryDeviceTemp', '℃', 120, 8, 1, 0],
	['RotorVelocity', 'rot/s', 130, 19, 1 / 512],
	['RotorPosition', 'rotations', 149, 27, 1 / 4096],
	...atOffset(motion, 192),
	['Acceleration', 'rot/s²', 240, 14, 0.25],
	...pidOutputs.flatMap(([name, bit, width, volts, amps]): Field[] => [
		[`PIDDutyCycle_${name}`, 'fractional', bit, width, 1 / 1024],
		[`PIDMotorVoltage_${name}`, 'V', bit, width, volts],
		[`PIDTorqueCurrent_${name}`, 'A', bit, width, amps],
	]),
	['ControlMode', undefined, 286, 6, controlModes],
	['MotionMagicAtTarget', undefined, 315, 1, 1, 0],
	['MotionMagicIsRunning', undefined, 316, 1, 1, 0],
	['RobotEnable', undefined, 317, 1, enableStates],
	['DeviceEnable', undefined, 318, 1, enableStates],
	['PIDPosition_Reference', 'rotations', 320, 32, pidFloat],
	['PIDVelocity_Reference', 'rot/s', 320, 32, pidFloat],
	// The error omits the least significant mantissa bit of the float32.
	['PIDPosition_ClosedLoopError', 'rotations', 352, 31, (raw) => pidFloat(raw << 1)],
	['PIDVelocity_ClosedLoopError', 'rot/s', 352, 31, (raw) => pidFloat(raw << 1)],
	['ConnectedMotor', undefined, 386, 4, connectedMotors],
	['ClosedLoopSlot', undefined, 446, 2, (raw) => Math.min(raw, 2)],
	['PIDPosition_ReferenceSlope', 'rot/s', 448, 16, 1 / 64],
	['PIDVelocity_ReferenceSlope', 'rot/s²', 448, 16, 1 / 64],
	['MotorOutputStatus', undefined, 465, 3, motorOutputStatuses],
];

const faultNames = [
	'Hardware',
	'ProcTemp',
	'DeviceTemp',
	'Undervoltage',
	'BootDuringEnable',
	'UnlicensedFeatureInUse',
	'StaticBrakeDisabled',
	'UsingFusedCANcoderWhileUnlicensed',
	'SupplyCurrLimit',
	'StatorCurrLimit',
	'FusedSensorOutOfSync',
	'RemoteSensorDataInvalid',
	'MissingHardLimitRemote',
	'MissingSoftLimitRemote',
	'ForwardSoftLimit',
	'ReverseSoftLimit',
	'ForwardHardLimit',
	'ReverseHardLimit',
	'OverSupplyV',
	'UnstableSupplyV',
	'RemoteSensorPosOverflow',
	'MissingDifferentialFX',
	'RemoteSensorReset',
	'BridgeBrownout',
	undefined,
	'RotorFault1',
	'RotorFault2',
];

type Frame = { device: string; length: number; fields: readonly Field[] };

/** Verified layouts of public device signals. Masking the frame ID leaves out the logger flags and CAN device number. */
export const hootCanFrames = new Map<number, Frame>([
	[0x2042c40, { device: 'TalonFX', length: 8, fields: [motorVoltage] }],
	[0x2042d40, { device: 'TalonFX', length: 8, fields: currents }],
	[0x2042dc0, { device: 'TalonFX', length: 8, fields: motion }],
	[0x2042b40, { device: 'TalonFX', length: 64, fields: talonStatus }],
	[
		0x2046bc0,
		{
			device: 'TalonFX',
			length: 6,
			fields: [
				['VersionBuild', undefined, 0, 8, 1, 0],
				['VersionBugfix', undefined, 8, 8, 1, 0],
				['VersionMinor', undefined, 16, 8, 1, 0],
				['VersionMajor', undefined, 24, 8, 1, 0],
				['Version', undefined, 0, 32, 1, 0],
				['IsProLicensed', undefined, 47, 1, 1, 0],
			],
		},
	],
	[
		0x2044740,
		{
			device: 'TalonFX',
			length: 8,
			fields: [
				['FaultField', undefined, 0, 32, 1, 0],
				['StickyFaultField', undefined, 32, 32, 1, 0],
				...faultNames.flatMap((name, bit): Field[] =>
					name === undefined
						? []
						: [
								[`Fault_${name}`, undefined, bit, 1, 1, 0],
								[`StickyFault_${name}`, undefined, bit + 32, 1, 1, 0],
							],
				),
			],
		},
	],
	[
		0x2043040,
		{
			device: 'TalonFX',
			length: 8,
			fields: [
				['MotorKT', 'Nm/A', 2, 8, 0.0001, 0],
				['MotorKV', 'RPM/V', 10, 11, 1, 0],
				['MotorStallCurrent', 'A', 21, 10, 1, 0],
			],
		},
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

export function readHootCanField(payload: Uint8Array, field: Field): number | string {
	const bit = field[2];
	const width = field[3];
	const start = bit >> 3;
	const end = (bit + width - 1) >> 3;
	const shift = bit & 7;
	const padding = 32 - width;
	// Align the first byte before combining the rest so a 32-bit field can span five bytes.
	let word = payload[start]! >>> shift;
	for (let i = start + 1, offset = 8 - shift; i <= end; i++, offset += 8) {
		word |= payload[i]! << offset;
	}
	const raw = (word & (0xffff_ffff >>> padding)) >>> 0;
	const decode = field[4];
	if (typeof decode === 'function') {
		return decode(raw);
	}
	if (typeof decode !== 'number') {
		return decode[raw] ?? 'Invalid Value';
	}
	const unsignedOffset = field[5];
	if (unsignedOffset !== undefined) {
		return raw * decode + unsignedOffset;
	}
	return ((raw << padding) >> padding) * decode;
}
