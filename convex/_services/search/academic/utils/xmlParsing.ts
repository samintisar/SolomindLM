export function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

export function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

export function stripXmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAttribute(xmlFragment: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  const match = xmlFragment.match(regex);
  return match?.[1];
}

export function extractXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}
