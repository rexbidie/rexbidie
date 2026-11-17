// import { v2 as cloudinary } from 'cloudinary';
// import streamifier from 'streamifier';
// import path from 'path';

// // Configure Cloudinary
// export const configureCloudinary = async () => {
//     try {
//         cloudinary.config({
//             cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//             api_key: process.env.CLOUDINARY_API_KEY,
//             api_secret: process.env.CLOUDINARY_API_SECRET
//         });
//         console.log('Cloudinary configured successfully');
//     } catch (error) {
//         console.error('Cloudinary configuration failed:', error);
//         throw new Error('Cloudinary configuration failed');
//     }
// };

// // Upload images (photos) - uses 'image' resource_type
// export const uploadImageToCloudinary = (buffer, folder = 'auction-photos') => {
//     return new Promise((resolve, reject) => {
//         const uploadStream = cloudinary.uploader.upload_stream(
//             {
//                 folder,
//                 resource_type: 'image',
//                 quality: 'auto',
//                 fetch_format: 'auto'
//             },
//             (error, result) => {
//                 if (error) reject(error);
//                 else resolve(result);
//             }
//         );

//         streamifier.createReadStream(buffer).pipe(uploadStream);
//     });
// };

// export const uploadDocumentToCloudinary = (buffer, originalName, folder = 'auction-documents') => {
//     return new Promise((resolve, reject) => {
//         const originalNameWithoutExt = path.parse(originalName).name;
//         const extension = path.parse(originalName).ext;

//         const publicId = `${originalNameWithoutExt}-${Date.now()}${extension}`;

//         // Different settings for PDF vs other files
//         const isPDF = originalName.toLowerCase().endsWith('.pdf');

//         const uploadOptions = {
//             folder,
//             resource_type: 'raw',
//             public_id: publicId,
//         };

//         // For PDFs, use minimal settings to avoid security flags
//         if (isPDF) {
//             console.log('📄 PDF detected - using minimal upload settings');
//             // Remove these parameters for PDFs
//             delete uploadOptions.use_filename;
//             delete uploadOptions.unique_filename;
//         } else {
//             // For other files, use normal settings
//             uploadOptions.use_filename = true;
//             uploadOptions.unique_filename = false;
//         }

//         // Remove these lines entirely - they might be causing issues
//         // type: 'upload',
//         // access_mode: 'public'

//         const uploadStream = cloudinary.uploader.upload_stream(
//             uploadOptions,
//             (error, result) => {
//                 if (error) {
//                     console.error('❌ Upload failed:', error);
//                     reject(error);
//                 } else {
//                     resolve(result);
//                 }
//             }
//         );

//         streamifier.createReadStream(buffer).pipe(uploadStream);
//     });
// };

// // Generic upload function that auto-detects file type
// export const uploadToCloudinary = (buffer, originalName, folder = 'auctions') => {
//     return new Promise((resolve, reject) => {
//         const fileExtension = path.extname(originalName).toLowerCase();
//         const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(fileExtension);

//         const originalNameWithoutExt = path.parse(originalName).name;
//         const publicId = `${originalNameWithoutExt}-${Date.now()}${fileExtension}`;

//         const uploadOptions = {
//             folder,
//             public_id: publicId,
//             resource_type: isImage ? 'image' : 'raw',
//             ...(isImage ? { quality: 'auto', fetch_format: 'auto' } : {})
//         };

//         const uploadStream = cloudinary.uploader.upload_stream(
//             uploadOptions,
//             (error, result) => {
//                 if (error) reject(error);
//                 else resolve(result);
//             }
//         );

//         streamifier.createReadStream(buffer).pipe(uploadStream);
//     });
// };

// // Delete from Cloudinary
// export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
//     try {
//         const result = await cloudinary.uploader.destroy(publicId, {
//             resource_type: resourceType
//         });
//         return result;
//     } catch (error) {
//         console.error('Error deleting from Cloudinary:', error);
//         throw error;
//     }
// };

// // Delete multiple files
// export const deleteMultipleFromCloudinary = async (publicIds, resourceType = 'image') => {
//     try {
//         const results = await Promise.all(
//             publicIds.map(publicId =>
//                 cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
//             )
//         );
//         return results;
//     } catch (error) {
//         console.error('Error deleting multiple files from Cloudinary:', error);
//         throw error;
//     }
// };

import {
    PutObjectCommand,
    DeleteObjectCommand,
    S3Client,
    ListBucketsCommand,
    HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import { r2Client, BUCKET_NAME } from "./r2Client.js";
// NEW: import file-type to detect MIME from buffer
import { fileTypeFromBuffer } from 'file-type';
import { processImageBuffer, processThumbnailBuffer } from './imageProcessor.js';

// Get custom domain from environment variables
const R2_PUBLIC_URL =
    process.env.R2_PUBLIC_URL ||
    `https://${BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ------------------------------
// 1. Configuration check
// ------------------------------
export const configureR2 = async () => {
    try {
        const command = new HeadBucketCommand({
            Bucket: BUCKET_NAME,
        });
        await r2Client.send(command);
        console.log("✅ R2 configured successfully");
        return true;
    } catch (error) {
        console.error("❌ R2 configuration failed:", error);
        throw new Error(`R2 configuration failed: ${error.message}`);
    }
};

// ------------------------------
// 2. Helper: get correct Content-Type from buffer (fallback to extension)
// ------------------------------
const getContentTypeFromBuffer = async (buffer, originalName) => {
    // First, try to detect from the actual file bytes (most reliable)
    const detected = await fileTypeFromBuffer(buffer);
    if (detected) {
        return detected.mime;
    }

    // Fallback to extension-based mapping
    const ext = path.extname(originalName).toLowerCase();
    const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain",
    };
    return mimeTypes[ext] || "application/octet-stream";
};

// ------------------------------
// 3. Upload functions (all corrected)
// ------------------------------

// Upload an email campaign image as JPEG/PNG (not WebP, which Outlook
// desktop and some other email apps can't show).
export const uploadEmailImageToR2 = async (prepared, folder = 'email-campaigns', originalName = 'image') => {
    const nameWithoutExt = path.parse(originalName).name;
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-') || 'image';
    const key = `${folder}/${sanitizedName}-${Date.now()}.${prepared.ext}`;
    await new Upload({
        client: r2Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: prepared.buffer,
            ContentType: prepared.contentType,
            ContentDisposition: 'inline',
            CacheControl: 'public, max-age=31536000, immutable',
        },
    }).done();
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return {
        secure_url: `${R2_PUBLIC_URL}/${encodedKey}`,
        public_id: key,
        width: prepared.width,
        height: prepared.height,
        bytes: prepared.bytes,
    };
};

// Upload images (photos)
export const uploadImageToR2 = async (buffer, folder = 'auction-photos', originalName = 'image.jpg') => {
    try {
        // Process the main image once
        const main = await processImageBuffer(buffer, {
            maxWidth: 1600,
            maxHeight: 1600,
            quality: 80,
            effort: 4,
        });

        // Process the thumbnail from the SAME original buffer
        // (avoids compounding compression artifacts)
        const thumb = await processThumbnailBuffer(buffer, 500);

        const nameWithoutExt = path.parse(originalName).name;
        const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-') || 'image';
        const baseKey = `${folder}/${sanitizedName}-${Date.now()}`;

        const mainKey = `${baseKey}.webp`;
        const thumbKey = `${baseKey}-thumb.webp`;

        // Upload both in parallel
        const uploadOpts = (key, body) => ({
            client: r2Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: key,
                Body: body,
                ContentType: 'image/webp',
                ContentDisposition: 'inline',
                CacheControl: 'public, max-age=31536000, immutable',
            },
        });

        await Promise.all([
            new Upload(uploadOpts(mainKey, main.buffer)).done(),
            new Upload(uploadOpts(thumbKey, thumb.buffer)).done(),
        ]);

        const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/');

        return {
            secure_url: `${R2_PUBLIC_URL}/${encodeKey(mainKey)}`,
            public_id: mainKey,
            format: 'webp',
            bytes: main.bytes,
            width: main.width,
            height: main.height,
            // NEW — thumbnail fields
            thumb_url: `${R2_PUBLIC_URL}/${encodeKey(thumbKey)}`,
            thumb_public_id: thumbKey,
            thumb_width: thumb.width,
            thumb_height: thumb.height,
            thumb_bytes: thumb.bytes,
        };
    } catch (error) {
        console.error('Error uploading to R2:', error);
        throw error;
    }
};

// Upload documents (PDFs, etc.)
export const uploadDocumentToR2 = async (
    buffer,
    originalName,
    folder = "auction-documents",
) => {
    try {
        // Get correct MIME from buffer
        const contentType = await getContentTypeFromBuffer(buffer, originalName);

        // Sanitize filename
        const extension = path.extname(originalName);
        const nameWithoutExt = path.parse(originalName).name;
        const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-');
        const key = `${folder}/${sanitizedName}-${Date.now()}${extension}`;

        const upload = new Upload({
            client: r2Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                ContentDisposition: 'inline',   // optional but safe
            },
        });

        await upload.done();

        // Encode URL
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');
        const secureUrl = `${R2_PUBLIC_URL}/${encodedKey}`;

        console.log("✅ Document uploaded successfully:", key);

        return {
            secure_url: secureUrl,
            public_id: key,
            format: extension.replace(".", ""),
            bytes: buffer.length,
        };
    } catch (error) {
        console.error("❌ Upload failed:", error);
        throw error;
    }
};

// Generic upload function that auto-detects file type
export const uploadToR2 = async (buffer, originalName, folder = "auctions") => {
    try {
        // Determine if it's an image (for resource_type field only)
        const fileExtension = path.extname(originalName).toLowerCase();
        const isImage = [
            ".jpg", ".jpeg", ".png", ".gif",
            ".bmp", ".webp", ".svg"
        ].includes(fileExtension);

        // Correct MIME from buffer
        const contentType = await getContentTypeFromBuffer(buffer, originalName);

        // Sanitize filename
        const nameWithoutExt = path.parse(originalName).name;
        const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-');
        const key = `${folder}/${sanitizedName}-${Date.now()}${fileExtension}`;

        const upload = new Upload({
            client: r2Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                ContentDisposition: 'inline',
            },
        });

        await upload.done();

        // Encode URL
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');
        const secureUrl = `${R2_PUBLIC_URL}/${encodedKey}`;

        return {
            secure_url: secureUrl,
            public_id: key,
            format: fileExtension.replace(".", ""),
            bytes: buffer.length,
            resource_type: isImage ? "image" : "raw",
        };
    } catch (error) {
        console.error("Error uploading to R2:", error);
        throw error;
    }
};

// ------------------------------
// 4. Delete functions (unchanged)
// ------------------------------
export const deleteFromR2 = async (publicId, resourceType = "image") => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: publicId,
        });
        await r2Client.send(command);
        return { result: "ok" };
    } catch (error) {
        console.error("Error deleting from R2:", error);
        throw error;
    }
};

export const deleteMultipleFromR2 = async (
    publicIds,
    resourceType = "image",
) => {
    try {
        const results = await Promise.all(
            publicIds.map((publicId) => deleteFromR2(publicId, resourceType)),
        );
        return results;
    } catch (error) {
        console.error("Error deleting multiple files from R2:", error);
        throw error;
    }
};

// For backward compatibility - keep the same function names
export const configureCloudinary = configureR2;
export const uploadImageToCloudinary = uploadImageToR2;
export const uploadDocumentToCloudinary = uploadDocumentToR2;
export const uploadToCloudinary = uploadToR2;
export const deleteFromCloudinary = deleteFromR2;
export const deleteMultipleFromCloudinary = deleteMultipleFromR2;