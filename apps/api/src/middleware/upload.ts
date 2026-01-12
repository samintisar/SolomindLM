import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { virusScanService } from '../services/security/VirusScanService.js';

/**
 * Magic byte signatures for file type validation
 * Maps file signatures to their corresponding MIME types
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], // PNG signature
  'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG signature (start of image)
  'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF....WEBP)
  'image/bmp': [[0x42, 0x4D]], // BM
  'image/avif': [[0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]], // ftypavif
  'image/svg+xml': [], // SVG is text-based, skip magic byte check
  'application/msword': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // DOC (OLE)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]], // DOCX is ZIP (PK..)
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [[0x50, 0x4B, 0x03, 0x04]], // PPTX is ZIP
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]], // XLSX is ZIP
  'application/vnd.ms-powerpoint': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // PPT (OLE)
  'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // XLS (OLE)
  'text/plain': [], // Text files - skip magic byte check
  'text/csv': [], // CSV files - skip magic byte check
  'application/rtf': [[0x7B, 0x5C, 0x72, 0x74, 0x66]], // {\rtf
  'application/vnd.oasis.opendocument.text': [[0x50, 0x4B, 0x03, 0x04]], // ODT is ZIP
  'application/vnd.oasis.opendocument.presentation': [[0x50, 0x4B, 0x03, 0x04]], // ODP is ZIP
  'application/vnd.oasis.opendocument.spreadsheet': [[0x50, 0x4B, 0x03, 0x04]], // ODS is ZIP
  'application/json': [], // JSON - skip magic byte check
  'text/markdown': [], // Markdown - skip magic byte check
};

/**
 * Check if file buffer matches the expected magic bytes
 */
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const signatures = MAGIC_BYTES[mimetype];

  // Skip validation for types without magic bytes (text files, etc.)
  if (!signatures || signatures.length === 0) {
    return true;
  }

  // Check if buffer matches any of the signatures
  return signatures.some(signature => {
    if (buffer.length < signature.length) {
      return false;
    }
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  });
}

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
  'application/json',

  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'image/avif',

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
  'image/bmp': 10 * 1024 * 1024,
  'image/avif': 10 * 1024 * 1024,
  'text/plain': 1 * 1024 * 1024, // 1MB
  'text/markdown': 1 * 1024 * 1024,
  'application/json': 1 * 1024 * 1024, // 1MB
};

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB default

/**
 * Extension to MIME type mapping
 * Used when browser reports application/octet-stream
 */
const extToMime: Record<string, string> = {
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'ppt': 'application/vnd.ms-powerpoint',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'xls': 'application/vnd.ms-excel',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'svg': 'image/svg+xml',
  'txt': 'text/plain',
  'csv': 'text/csv',
  'md': 'text/markdown',
  'markdown': 'text/markdown',
  'rtf': 'application/rtf',
  'odt': 'application/vnd.oasis.opendocument.text',
  'odp': 'application/vnd.oasis.opendocument.presentation',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'json': 'application/json',
  'avif': 'image/avif',
};

/**
 * MIME type to allowed extensions mapping
 */
const mimeToExt: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/bmp': ['bmp'],
  'image/svg+xml': ['svg'],
  'image/avif': ['avif'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'text/markdown': ['md', 'markdown'],
  'application/rtf': ['rtf'],
  'application/vnd.oasis.opendocument.text': ['odt'],
  'application/vnd.oasis.opendocument.presentation': ['odp'],
  'application/vnd.oasis.opendocument.spreadsheet': ['ods'],
  'application/json': ['json'],
};

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

  // Get file extension
  const ext = file.originalname.toLowerCase().split('.').pop() || '';

  // Handle application/octet-stream by checking file extension
  let mimetype = file.mimetype;
  if (mimetype === 'application/octet-stream' || mimetype === 'application/x-msdownload') {
    const detectedMime = extToMime[ext];
    if (!detectedMime) {
      return callback(new Error(
        `File type could not be determined from extension .${ext}. ` +
        `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      ));
    }
    // Update the mimetype for validation
    mimetype = detectedMime;
    // Update the file object's mimetype so it's correct downstream
    (file as any).mimetype = mimetype;
  }

  // Check if MIME type is allowed
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return callback(new Error(
      `File type ${mimetype} is not allowed. ` +
      `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    ));
  }

  // Check file extension matches MIME type (basic validation)
  const allowedExtensions = mimeToExt[mimetype];
  if (allowedExtensions && ext && !allowedExtensions.includes(ext)) {
    return callback(new Error(
      `File extension .${ext} does not match declared MIME type ${mimetype}`
    ));
  }

  // Perform magic byte validation if buffer is available
  if (file.buffer && file.buffer.length > 0) {
    if (!validateMagicBytes(file.buffer, mimetype)) {
      return callback(new Error(
        `File content does not match declared type ${mimetype}. ` +
        `The file may be corrupted or have an incorrect extension.`
      ));
    }
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
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'text/markdown': '.md',
    'application/rtf': '.rtf',
    'application/vnd.oasis.opendocument.text': '.odt',
    'application/vnd.oasis.opendocument.presentation': '.odp',
    'application/vnd.oasis.opendocument.spreadsheet': '.ods',
    'application/json': '.json',
  };

  return extMap[mimeType] || '';
}

/**
 * Middleware to scan uploaded files for viruses and malware
 * Uses the VirusScanService with multiple detection strategies
 *
 * Security: This is a critical security control that prevents malicious files
 * from being uploaded and processed by the system
 */
export async function scanForViruses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.file) {
    return next();
  }

  try {
    console.log('[VirusScan] Scanning file:', req.file.originalname);

    const result = await virusScanService.scanFile(req.file.buffer, req.file.originalname);

    console.log('[VirusScan] Scan result:', {
      isClean: result.isClean,
      threats: result.threats,
      method: result.scanMethod,
      time: result.scanTime,
    });

    if (!result.isClean) {
      console.error('[VirusScan] Threat detected:', result.threats);
      return res.status(400).json({
        error: 'File upload blocked',
        message: 'The uploaded file contains potentially malicious content and cannot be processed.',
        threats: result.threats,
        scanMethod: result.scanMethod,
      });
    }

    // File is clean, proceed
    next();
  } catch (error) {
    console.error('[VirusScan] Scan failed:', error);

    // Fail closed - reject upload if scan fails
    // This is more secure but may cause false negatives
    if (process.env.VIRUS_SCAN_FAIL_OPEN === 'true') {
      console.warn('[VirusScan] VIRUS_SCAN_FAIL_OPEN is true, allowing file despite scan failure');
      return next();
    }

    return res.status(500).json({
      error: 'Security scan failed',
      message: 'Unable to scan the uploaded file for security threats. Please try again later.',
    });
  }
}
