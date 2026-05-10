import { readFileSync } from 'fs';

const content = readFileSync('./convex/_services/extraction/BibliographyParserService.test.ts', 'utf-8');

// Find the test string
const test1Start = content.indexOf('const bibtex = `@article{accents,');
const test1End = content.indexOf('      }`;', test1Start) + 9;
const test1Code = content.slice(test1Start, test1End);

console.log('Test 1 code snippet:');
console.log(test1Code);
console.log('\nLooking for Garc pattern in source:');
const garcIdx = content.indexOf('Garc');
if (garcIdx !== -1) {
  const snippet = content.slice(garcIdx, garcIdx + 20);
  console.log('Source snippet:', JSON.stringify(snippet));
  for (let i = 0; i < snippet.length; i++) {
    console.log(`  [${i}] = ${JSON.stringify(snippet[i])} (code: ${snippet.charCodeAt(i)})`);
  }
}
