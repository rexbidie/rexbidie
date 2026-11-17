import sharp from "sharp";
import heicConvert from "heic-convert";
import { fileTypeFromBuffer } from "file-type";

// Email images must be JPEG or PNG: Outlook desktop and several other
// email apps don't show WebP. Phone photos are also often HEIC, which
// sharp can't read, so those are converted to JPEG first.
export const EMAIL_IMAGE_MAX_WIDTH = 1200;
const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export const isHeic = async (buffer, mimetype = "", originalName = "") => {
    if (HEIC_MIMES.has(String(mimetype).toLowerCase())) return true;
    if (/\.(heic|heif)$/i.test(originalName)) return true;
    const detected = await fileTypeFromBuffer(buffer).catch(() => null);
    return !!detected && HEIC_MIMES.has(detected.mime);
};

/**
 * Turn any uploaded image into an email-safe JPEG (or PNG when it has
 * transparency), resized to fit an email and rotated the right way up.
 */
export const prepareEmailImage = async (buffer, { mimetype = "", originalName = "" } = {}) => {
    let input = buffer;
    if (await isHeic(buffer, mimetype, originalName)) {
        input = Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 0.9 }));
    }

    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) throw new Error("Invalid image");

    const keepPng = meta.format === "png" && meta.hasAlpha;
    let img = sharp(input)
        .rotate()
        .resize({ width: EMAIL_IMAGE_MAX_WIDTH, withoutEnlargement: true });
    img = keepPng
        ? img.png({ compressionLevel: 9 })
        : img.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true });

    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    return {
        buffer: data,
        contentType: keepPng ? "image/png" : "image/jpeg",
        ext: keepPng ? "png" : "jpg",
        width: info.width,
        height: info.height,
        bytes: info.size,
    };
};
