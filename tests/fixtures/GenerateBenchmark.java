import com.ctre.phoenix6.SignalLogger;
import com.ctre.phoenix6.StatusCode;
import org.wpilib.hardware.hal.HAL;
import org.wpilib.math.geometry.Pose2d;
import org.wpilib.math.geometry.Rotation2d;

// Run with the desktop Phoenix simulator libraries, passing an existing output directory.
class GenerateBenchmark {
	private static void check(StatusCode status) {
		if (!status.isOK()) throw new IllegalStateException(status.getDescription());
	}

	public static void main(String[] args) throws InterruptedException {
		HAL.initialize();
		check(SignalLogger.enableAutoLogging(false));
		check(SignalLogger.setPath(args[0]));
		check(SignalLogger.start());
		try {
			for (int i = 0; i < 4096; i++) {
				var x = 3 * Math.sin(i * 0.01);
				var y = 2 * Math.cos(i * 0.04);
				check(SignalLogger.writeDouble("Drive/Voltage", x + y, "V"));
				check(SignalLogger.writeDouble("Drive/Velocity", x - y, "m/s"));
				check(SignalLogger.writeBoolean("Drive/Enabled", (i & 63) != 0));
				check(SignalLogger.writeInteger("Drive/Loop", i));
				check(SignalLogger.writeDoubleArray("Drive/Outputs", new double[] { x, y, -x, -y }, "V"));
				check(SignalLogger.writeString("Drive/Mode", (i & 127) < 96 ? "tracking" : "coasting"));
				check(SignalLogger.writeStruct("Drive/Pose", Pose2d.struct, new Pose2d(x, y, new Rotation2d(x))));
				if ((i & 63) == 63) Thread.sleep(5);
			}
		} finally {
			check(SignalLogger.stop());
		}
	}
}
