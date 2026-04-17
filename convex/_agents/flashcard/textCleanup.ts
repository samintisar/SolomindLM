"use node";

export function cleanFrontText(front: string): string {
  let cleaned = front.trim();

  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\s*[*_~]{1,2}\s*$/, "");
  cleaned = cleaned.replace(/\s*\d+\.\s*$/, "");
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/\*\*\s*\*/g, "**");
  cleaned = cleaned.replace(/\*\s*\*/g, "**");
  cleaned = cleaned.replace(/^[\s\-•*]\*/, "");

  return cleaned.trim();
}

export function cleanBackText(back: string): string {
  let cleaned = back.trim();

  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\s*\d+\.\s*$/, "");
  cleaned = cleaned.replace(/\s*[*_~]{1,2}\s*$/, "");
  cleaned = cleaned.replace(/"\./g, '".');
  cleaned = cleaned.replace(/\.\./g, ".");
  cleaned = cleaned.replace(/[,;:\s]+$/, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned.trim();
}
