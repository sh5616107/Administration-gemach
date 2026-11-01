import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * בדיקה: אין צבעים hardcoded מחוץ לרשימת היתר וטווחי @allow-colors
 * 
 * רשימת היתר:
 * - src/theme/**
 * - src/services/documents.ts
 * - src/services/documentConstants.ts
 * - src/__tests__/**
 * 
 * התעלמות:
 * - הערות (//, /*, *)
 * - טווחים המסומנים ב-// @allow-colors-start ו-// @allow-colors-end
 */

const ALLOW_LIST = [
  'src/theme/',
  '/documents.ts',
  '/documentConstants.ts',
  'src/__tests__/',
];

const HEX_REGEX = /#[0-9a-fA-F]{3,6}\b/g;
const RGB_REGEX = /rgba?\s*\(/g;

interface Violation {
  file: string;
  line: number;
  content: string;
  match: string;
}

/**
 * בדיקה אם קובץ ברשימת היתר
 */
function isAllowListed(filePath: string): boolean {
  // נרמול הנתיב לתמיכה ב-Windows ו-Unix
  const normalizedPath = filePath.replace(/\\/g, '/');
  return ALLOW_LIST.some(allowed => normalizedPath.includes(allowed));
}

/**
 * בדיקה אם שורה היא הערה
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * מציאת טווחי @allow-colors בקובץ
 */
function findAllowedRanges(lines: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let currentStart: number | null = null;

  lines.forEach((line, index) => {
    if (line.includes('@allow-colors-start')) {
      currentStart = index;
    } else if (line.includes('@allow-colors-end') && currentStart !== null) {
      ranges.push({ start: currentStart, end: index });
      currentStart = null;
    }
  });

  return ranges;
}

/**
 * בדיקה אם שורה נמצאת בטווח מותר
 */
function isInAllowedRange(lineNumber: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(range => lineNumber >= range.start && lineNumber <= range.end);
}

/**
 * סריקת קובץ לצבעים hardcoded
 */
function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  
  if (isAllowListed(filePath)) {
    return violations;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const allowedRanges = findAllowedRanges(lines);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // דלג על הערות
    if (isCommentLine(line)) {
      return;
    }

    // דלג על שורות בטווח מותר
    if (isInAllowedRange(index, allowedRanges)) {
      return;
    }

    // חיפוש צבעים hex
    const hexMatches = Array.from(line.matchAll(HEX_REGEX));
    hexMatches.forEach(match => {
      violations.push({
        file: filePath,
        line: lineNumber,
        content: line.trim(),
        match: match[0],
      });
    });

    // חיפוש rgb/rgba
    const rgbMatches = Array.from(line.matchAll(RGB_REGEX));
    rgbMatches.forEach(match => {
      violations.push({
        file: filePath,
        line: lineNumber,
        content: line.trim(),
        match: match[0],
      });
    });
  });

  return violations;
}

/**
 * סריקה רקורסיבית של תיקייה
 */
function scanDirectory(dirPath: string, extensions: string[]): Violation[] {
  const violations: Violation[] = [];
  
  const items = readdirSync(dirPath);
  
  items.forEach(item => {
    const fullPath = join(dirPath, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      violations.push(...scanDirectory(fullPath, extensions));
    } else if (stat.isFile()) {
      const ext = item.substring(item.lastIndexOf('.'));
      if (extensions.includes(ext)) {
        violations.push(...scanFile(fullPath));
      }
    }
  });
  
  return violations;
}

describe('No Hardcoded Colors', () => {
  it('לא צריכים להיות צבעים hardcoded מחוץ לרשימת היתר וטווחי @allow-colors', () => {
    const violations = scanDirectory('src', ['.ts', '.tsx']);
    
    if (violations.length > 0) {
      const errorMessage = violations
        .map(v => `${v.file}:${v.line}: ${v.match}\n  ${v.content}`)
        .join('\n\n');
      
      throw new Error(
        `נמצאו ${violations.length} צבעים hardcoded:\n\n${errorMessage}`
      );
    }
    
    expect(violations).toHaveLength(0);
  });
});
