import { BibliographyParserService } from './convex/_services/extraction/BibliographyParserService';

const service = new BibliographyParserService();

// EXACT copy from test file
const bibtex1 = `@article{accents,
  title = {The {\\"u}mlaut Paper},
  author = {M{\\"u}ller, Hans and Jos{\\'e} Garc{\\'{i}}a},
  year = {2023}
}`;

console.log('Test 1 bibtex from test file:', JSON.stringify(bibtex1));
const result1 = service.parse(bibtex1, 'bibtex');
console.log('Test 1 authors:', JSON.stringify(result1.papers[0]?.authors));
console.log('Test 1 title:', JSON.stringify(result1.papers[0]?.title));

// EXACT copy from test file
const bibtex2 = "@article{allaccents,\n" +
  "  title = {{\\\\`a}{\\\\^e}{\\\\~n}{\\\\c{c}}},\n" +
  "  year = {2023}\n" +
  "}";

console.log('\nTest 2 bibtex from test file:', JSON.stringify(bibtex2));
const result2 = service.parse(bibtex2, 'bibtex');
console.log('Test 2 title:', JSON.stringify(result2.papers[0]?.title));
