import { readFileSync } from 'fs';

const content = readFileSync('./convex/_services/extraction/BibliographyParserService.test.ts', 'utf-8');

// Find the exact line
const lines = content.split('\n');
const line301 = lines[300]; // 0-indexed

console.log('Line 301:');
console.log(line301);
console.log('\nBytes around Garc:');
const garcIdx = line301.indexOf('Garc');
for (let i = garcIdx; i < Math.min(garcIdx + 15, line301.length); i++) {
  const char = line301[i];
  const code = line301.charCodeAt(i);
  console.log(`  pos ${i}: ${JSON.stringify(char)} (code: ${code})`);
}

// Also check what the template literal produces
const testString = `{\\'{i}}`;
console.log('\nTemplate literal `{\\\\\'{i}}` produces:');
console.log(JSON.stringify(testString));
for (let i = 0; i < testString.length; i++) {
  console.log(`  [${i}]: ${JSON.stringify(testString[i])} (code: ${testString.charCodeAt(i)})`);
}
