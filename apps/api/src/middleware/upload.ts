import multer from 'multer';
import { Request } from 'express';

/**
 * Allowed MIME types for file upload
 * Only documents and images are permitted
 */
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',

  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',

  // Markdown
  'text/markdown',
];

/**
 * Maximum file sizes by type
 */
const MAX_FILE_SIZES = {
  'application/pdf': 20 * 1024 * 1024, // 20MB
  'application/msword': 10 * 1024 * 1024, // 10MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 50 * 1024 * 1024, // 50MB
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 5 * 1024 * 1024, // 5MB
  'image/png': 10 * 1024 * 1024, // 10MB
  'image/jpeg': 10 * 1024 * 1024,
  'image/gif': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'text/plain': 1 * 1024 * 1024, // 1MB
  'text/markdown': 1 * 1024 * 1024,
};

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB default

/**
 * File filter function to validate file types
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  // Check if file has a MIME type
  if (!file.mimetype) {
    return callback(new Error('File must have a valid MIME type'));
  }

  // Check if MIME type is allowed
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return callback(new Error(
      `File type ${file.mimetype} is not allowed. ` +
      `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    ));
  }

  // Check file extension matches MIME type (basic validation)
  const ext = file.originalname.toLowerCase().split('.').pop();
  const mimeToExt: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'image/png': ['png'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'image/svg+xml': ['svg'],
    'text/plain': ['txt'],
    'text/markdown': ['md', 'markdown'],
  };

  const allowedExtensions = mimeToExt[file.mimetype];
  if (allowedExtensions && ext && !allowedExtensions.includes(ext)) {
    return callback(new Error(
      `File extension .${ext} does not match declared MIME type ${file.mimetype}`
    ));
  }

  callback(null, true);
};

/**
 * Dynamic limits based on file type
 */
const limits = {
  fileSize: 50 * 1024 * 1024, // Max 50MB overall (reduced from unlimited)
  files: 1, // Only allow one file at a time
  fieldSize: 100 * 1024, // Limit field size to 100KB
};

/**
 * Configure multer with security constraints
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits,
});

/**
 * Middleware to validate file size after upload based on MIME type
 * This provides more granular control than multer's built-in fileSize limit
 */
export function validateFileSize(
  req: Request,
  res: any,
  next: () => void
) {
  if (!req.file) {
    return next();
  }

  const maxSize = MAX_FILE_SIZES[req.file.mimetype as keyof typeof MAX_FILE_SIZES] || DEFAULT_MAX_SIZE;

  if (req.file.size > maxSize) {
    return res.status(413).json({
      error: `File too large. Maximum size for ${req.file.mimetype} is ${Math.round(maxSize / 1024 / 1024)}MB`,
    });
  }

  next();
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators
  let sanitized = filename.replace(/[\/\\]/g, '_');

  // Remove parent directory references
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove invalid Windows characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x80-\x9f]/g, '');

  // Remove leading dots
  sanitized = sanitized.replace(/^\.+/, '');

  // Limit length
  sanitized = sanitized.substring(0, 255);

  return sanitized || 'unnamed_file';
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'text/plain': '.txt',
    'text/markdown': '.md',
  };

  return extMap[mimeType] || '';
}
