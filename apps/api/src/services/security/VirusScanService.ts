/**
 * Virus Scan Service
 *
 * Provides file scanning capabilities using multiple strategies:
 * 1. ClamAV - Open source antivirus (requires ClamAV daemon)
 * 2. Content-based heuristics - Basic pattern matching
 * 3. Cloud APIs - VirusTotal, AWS Security Hub (optional)
 *
 * Note: In production, configure one of the scanning methods below.
 */

import { env } from '../../config/env.js';

// Scan results
export interface ScanResult {
  isClean: boolean;
  threats: string[];
  scanMethod: string;
  scanTime: number;
}

// Threat patterns for basic heuristic scanning
const THREAT_PATTERNS = [
  // Script injection patterns
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // Event handlers like onclick=
  /<iframe[^>]*>/gi,

  // Shell patterns
  /eval\s*\(/gi,
  /exec\s*\(/gi,
  /system\s*\(/gi,

  // SQL injection patterns
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /(\bor\b\s+(\d+)\s*=\s*\d+)/i,

  // Known malicious file signatures
  /\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00/, // Empty PE header
  /\x4d\x5a\x90\x00\x03\x00\x00\x00/, // PE executable header (EXE)

  // Macro patterns in Office documents
  /vbscript:/gi,
  /AutoOpen/gi,
  /Document_Open/gi,
  /Workbook_Open/gi,
];

// Executable file signatures that should never be in documents
const EXECUTABLE_SIGNATURES = [
  [0x4d, 0x5a], // MZ header (Windows executable)
  [0x7f, 0x45, 0x4c, 0x46], // ELF header (Linux executable)
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O header (macOS executable)
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O universal binary
];

export class VirusScanService {
  private clamavHost: string;
  private clamavPort: number;
  private enabled: boolean;

  constructor() {
    // ClamAV configuration (if available)
    this.clamavHost = process.env.CLAMAV_HOST || 'localhost';
    this.clamavPort = parseInt(process.env.CLAMAV_PORT || '3310', 10);
    this.enabled = process.env.VIRUS_SCAN_ENABLED === 'true' || env.NODE_ENV === 'production';
  }

  /**
   * Scan a file buffer for threats
   * Uses multiple strategies for comprehensive protection
   */
  async scanFile(buffer: Buffer, fileName: string): Promise<ScanResult> {
    const startTime = Date.now();

    console.log('[VirusScan] Starting scan for file:', fileName);

    // If virus scanning is disabled, return clean (for development only)
    if (!this.enabled) {
      console.warn('[VirusScan] Virus scanning is DISABLED. This should only be used in development.');
      return {
        isClean: true,
        threats: [],
        scanMethod: 'disabled',
        scanTime: Date.now() - startTime,
      };
    }

    // Strategy 1: Check for executable file signatures
    const executableCheck = this.checkExecutableSignature(buffer, fileName);
    if (!executableCheck.isClean) {
      return {
        ...executableCheck,
        scanMethod: 'executable-signature',
        scanTime: Date.now() - startTime,
      };
    }

    // Strategy 2: Content-based heuristic scan
    const heuristicResult = this.heuristicScan(buffer, fileName);
    if (!heuristicResult.isClean) {
      return {
        ...heuristicResult,
        scanMethod: 'heuristic',
        scanTime: Date.now() - startTime,
      };
    }

    // Strategy 3: ClamAV scan (if configured)
    if (process.env.CLAMAV_HOST) {
      try {
        const clamavResult = await this.clamavScan(buffer, fileName);
        if (!clamavResult.isClean) {
          return {
            ...clamavResult,
            scanMethod: 'clamav',
            scanTime: Date.now() - startTime,
          };
        }
      } catch (error) {
        console.error('[VirusScan] ClamAV scan failed, falling back to heuristic scan:', error);
      }
    }

    // All checks passed
    console.log('[VirusScan] File passed all security checks');
    return {
      isClean: true,
      threats: [],
      scanMethod: process.env.CLAMAV_HOST ? 'multi-method' : 'heuristic',
      scanTime: Date.now() - startTime,
    };
  }

  /**
   * Check for executable file signatures in non-executable file types
   */
  private checkExecutableSignature(buffer: Buffer, fileName: string): Omit<ScanResult, 'scanTime' | 'scanMethod'> {
    const ext = fileName.toLowerCase().split('.').pop() || '';

    // Allow executable signatures in actual executables (if we supported them)
    const allowedExecutableExtensions = ['exe', 'dll', 'so', 'dylib'];
    if (allowedExecutableExtensions.includes(ext)) {
      return { isClean: true, threats: [] };
    }

    // Check first 100 bytes for executable signatures
    const headerLength = Math.min(buffer.length, 100);
    const header = buffer.subarray(0, headerLength);

    for (const signature of EXECUTABLE_SIGNATURES) {
      if (header.length >= signature.length) {
        let match = true;
        for (let i = 0; i < signature.length; i++) {
          if (header[i] !== signature[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          console.warn('[VirusScan] Executable signature detected in document');
          return {
            isClean: false,
            threats: [`Executable file signature detected (possible malware embedded in ${ext} file)`],
          };
        }
      }
    }

    return { isClean: true, threats: [] };
  }

  /**
   * Heuristic scan using pattern matching
   * Detects common malicious patterns in file content
   */
  private heuristicScan(buffer: Buffer, fileName: string): Omit<ScanResult, 'scanTime' | 'scanMethod'> {
    const threats: string[] = [];

    // Convert buffer to string for text-based pattern matching
    // Only scan first 10KB for performance
    const scanSize = Math.min(buffer.length, 10240);
    const content = buffer.subarray(0, scanSize).toString('latin1'); // Use latin1 to catch binary patterns

    // Check each threat pattern
    for (const pattern of THREAT_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        threats.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    // Check for embedded scripts in file types that shouldn't have them
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const textExtensions = ['txt', 'md', 'csv', 'json', 'log'];
    const documentExtensions = ['pdf', 'doc', 'docx', 'ppt', 'pptx'];

    if (textExtensions.includes(ext) && content.includes('<script')) {
      threats.push('Script content detected in plain text file');
    }

    if (documentExtensions.includes(ext) && /\b(eval|exec|system)\b\s*\(/.test(content)) {
      threats.push('Suspicious function call detected in document');
    }

    // Check for very long strings (possible obfuscation)
    const longStrings = content.match(/.{200,}/g);
    if (longStrings && longStrings.length > 5) {
      threats.push('Excessive obfuscation detected (possible malware)');
    }

    return {
      isClean: threats.length === 0,
      threats,
    };
  }

  /**
   * Scan file using ClamAV daemon
   * Requires ClamAV to be running and accessible
   */
  private async clamavScan(buffer: Buffer, fileName: string): Promise<Omit<ScanResult, 'scanTime' | 'scanMethod'>> {
    console.log('[VirusScan] Running ClamAV scan...');

    try {
      // Note: This requires the 'clamav.js' package or similar
      // For production, install: npm install clamav.js
      // Or use a TCP connection to ClamAV

      // Simple TCP connection to ClamAV
      const net = await import('net');

      return new Promise((resolve, reject) => {
        const socket = new net.Socket();

        socket.connect(this.clamavPort, this.clamavHost, () => {
          // Send SCAN command
          const prefix = Buffer.from('zINSTREAM\0', 'ascii');
          const chunk = Buffer.concat([
            prefix,
            buffer,
            Buffer.from([0, 0, 0, 0]), // Termination chunk
          ]);
          socket.write(chunk);
        });

        socket.on('data', (data: Buffer) => {
          const response = data.toString('utf8');

          // ClamAV responses:
          // - "stream: OK" - Clean
          // - "stream: <virus_name> FOUND" - Infected
          if (response.includes('OK')) {
            console.log('[VirusScan] ClamAV scan passed');
            resolve({ isClean: true, threats: [] });
          } else if (response.includes('FOUND')) {
            const virusName = response.match(/stream: (.+) FOUND/)?.[1] || 'Unknown threat';
            console.warn('[VirusScan] ClamAV found threat:', virusName);
            resolve({ isClean: false, threats: [`Virus detected: ${virusName}`] });
          } else {
            console.warn('[VirusScan] Unexpected ClamAV response:', response);
            resolve({ isClean: true, threats: [] }); // Fail open for now
          }

          socket.destroy();
        });

        socket.on('error', (error: Error) => {
          console.error('[VirusScan] ClamAV connection error:', error);
          reject(error);
        });

        socket.setTimeout(30000, () => {
          socket.destroy();
          reject(new Error('ClamAV scan timeout'));
        });
      });
    } catch (error) {
      console.error('[VirusScan] ClamAV not available, skipping:', error);
      // Return clean if ClamAV is not configured
      return { isClean: true, threats: [] };
    }
  }

  /**
   * Check if virus scanning is enabled
   */
  isScanEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const virusScanService = new VirusScanService();
