import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = MIME_TO_EXT[file.mimetype] ?? '.bin';
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('INVALID_MIME'));
        }
    },
});

router.post('/', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const url = `/uploads/${req.file.filename}`;
    logger.info('upload.file', { url, userId: (req as any).userId });
    return res.json({ success: true, data: { url } });
});

// Multer error handler
router.use((err: any, _req: any, res: any, _next: any) => {
    if (err.message === 'INVALID_MIME') {
        return res.status(400).json({ success: false, error: 'Only JPEG, PNG, and WebP images are allowed' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File exceeds 5 MB limit' });
    }
    return res.status(500).json({ success: false, error: 'Upload failed' });
});

export default router;
