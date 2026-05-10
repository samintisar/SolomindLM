// Read the actual test file and extract the exact test strings
import { readFileSync } from 'fs';

const content = readFileSync('./convex/_services/extraction/BibliographyParserService.test.ts', 'utf-8');

// Extract test 1 string
const test1Match = content.match(/const bibtex = `([\s\S]*?)`;\s*\n\s*const result = service\.parse\(bibtex, "bibtex"\);/);
if (test1Match) {
  const bibtex = test1Match[1];
  console.log('Test 1 extracted string:');
  console.log(JSON.stringify(bibtex));
  
  const entryRegex = /@(\w+)\s*\{\s*([^,]*)\s*,([^@]*)\}/gs;
  const match = entryRegex.exec(bibtex);
  if (match) {
    console.log('\nTest 1 entryBody:');
    console.log(JSON.stringify(match[3]));
  }
}

// Extract test 2 string
const test2Match = content.match(/const bibtex = "@article\{allaccents,\\n" \+\s*"  title = \{\{([\s\S]*?)\}\},\\n" \+\s*"  year = \{2023\}\\n" \+\s*"";/);
if (test2Match) {
  const bibtex = "@article{allaccents,\n" +
    "  title = {{" + test2Match[1] + "}},\n" +
    "  year = {2023}\n" +
    "}";
  console.log('\nTest 2 extracted string:');
  console.log(JSON.stringify(bibtex));
  
  const entryRegex = /@(\w+)\s*\{\s*([^,]*)\s*,([^@]*)\}/gs;
  const match = entryRegex.exec(bibtex);
  if (match) {
    console.log('\nTest 2 entryBody:');
    console.log(JSON.stringify(match[3]));
  }
}
