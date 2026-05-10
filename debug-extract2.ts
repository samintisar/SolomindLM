// Read the actual test file and extract the exact test strings
import { readFileSync } from 'fs';

const content = readFileSync('./convex/_services/extraction/BibliographyParserService.test.ts', 'utf-8');

// Find the LaTeX accent section
const latexSection = content.slice(content.indexOf('describe("LaTeX accent handling"'));

// Extract test 1 string - find the first template literal after the section start
const test1Marker = 'const bibtex = `';
const test1Start = latexSection.indexOf(test1Marker);
const test1End = latexSection.indexOf('`;', test1Start);
const test1Code = latexSection.slice(test1Start + test1Marker.length, test1End);

console.log('Test 1 raw code:');
console.log(test1Code);
console.log('\nTest 1 as string:');
console.log(JSON.stringify(test1Code));

const entryRegex = /@(\w+)\s*\{\s*([^,]*)\s*,([^@]*)\}/gs;
const match1 = entryRegex.exec(test1Code);
if (match1) {
  console.log('\nTest 1 entryBody:');
  console.log(JSON.stringify(match1[3]));
}

// Extract test 2 string
const test2Marker = 'const bibtex = "@article{allaccents,';
const test2Start = latexSection.indexOf(test2Marker);
const test2End = latexSection.indexOf('";', test2Start);
const test2Code = latexSection.slice(test2Start + 'const bibtex = '.length, test2End);

console.log('\n\nTest 2 raw code:');
console.log(test2Code);
console.log('\nTest 2 as string:');
const test2String = eval(test2Code);
console.log(JSON.stringify(test2String));

const match2 = entryRegex.exec(test2String);
if (match2) {
  console.log('\nTest 2 entryBody:');
  console.log(JSON.stringify(match2[3]));
}
