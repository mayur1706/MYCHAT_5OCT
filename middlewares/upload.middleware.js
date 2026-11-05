import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
});

// File Filter (Images, Audio, Video, Docs)
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        // Images
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        // Audio
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        // Video
        "video/mp4",
        "video/webm",
        // Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("File type not supported for upload"), false);
    }
};

export const uploadMiddleware = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max file size
    },
    fileFilter,
});

