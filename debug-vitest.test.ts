import { describe, it } from "vitest";

describe("debug", () => {
  it("shows string content", () => {
    const bibtex = `@article{accents,
  title = {The {\\"u}mlaut Paper},
  author = {M{\\"u}ller, Hans and Jos{\\'e} Garc{\\'{i}}a},
  year = {2023}
}`;
    
    console.log('Full string:', JSON.stringify(bibtex));
    
    const entryRegex = /@(\w+)\s*\{\s*([^,]*)\s*,([^@]*)\}/gs;
    const match = entryRegex.exec(bibtex);
    
    if (match) {
      console.log('entryBody:', JSON.stringify(match[3]));
      
      const body = match[3];
      const idx = body.indexOf("Garc");
      if (idx !== -1) {
        console.log('Characters around Garc:');
        for (let i = idx; i < Math.min(idx + 15, body.length); i++) {
          console.log(`  body[${i}] = ${JSON.stringify(body[i])} (code: ${body.charCodeAt(i)})`);
        }
      }
    }
  });
});
