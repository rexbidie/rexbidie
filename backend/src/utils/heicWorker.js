// Runs in a worker thread (see heicToJpeg in cloudinary.js). The HEIC decoder
// holds on to a lot of memory after use; doing it here means that memory is
// released when the worker exits instead of staying in the main server.
import { parentPort, workerData } from "worker_threads";
import heicConvert from "heic-convert";

try {
    const out = await heicConvert({ buffer: Buffer.from(workerData.buffer), format: "JPEG", quality: workerData.quality ?? 0.92 });
    const jpeg = Buffer.from(out);
    parentPort.postMessage({ ok: true, jpeg }, [jpeg.buffer]);
} catch (err) {
    parentPort.postMessage({ ok: false, error: err?.message || "Could not read the HEIC photo" });
}
