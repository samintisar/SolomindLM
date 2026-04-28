# Quick-Start Category Prompts

Copy the prompt block for the category you want to generate, then paste into NotebookLM.

---

## 1. Factoid (single facts)

Generate 2-4 factoid questions for this notebook. Each should have a specific, factual answer found in the sources.

Output format:
```
### Question: [specific fact question]
### Expected Answer: [1-2 precise sentences]
### Expected Items: N/A
### Expected Behavior: [what must be included]
```

---

## 2. List-Enumeration (complete sets)

Generate 2-4 list-enumeration questions. Ask for complete lists (types, components, steps).

**Critical:** Expected Items must include ALL items. This tests if retrieval finds everything.

Output format:
```
### Question: [what are the X types of...]
### Expected Answer: [explanation plus list]
### Expected Items: [item1, item2, item3, ...]
### Expected Behavior: [all items must be present]
```

---

## 3. Comparison (A vs B)

Generate 2-4 comparison questions. Compare two concepts, techniques, or approaches from the sources.

Output format:
```
### Question: [Compare X and Y]
### Expected Answer: [cover similarities AND differences]
### Expected Items: N/A
### Expected Behavior: [must explain both and contrast them]
```

---

## 4. Causality (why/how)

Generate 2-4 causality questions. Ask why something happens, how a mechanism works, or cause-effect relationships.

Output format:
```
### Question: [Why does X... / How does X cause Y...]
### Expected Answer: [explain the reasoning/mechanism]
### Expected Items: N/A
### Expected Behavior: [must explain the causal chain]
```

---

## 5. Temporal (chronology)

Generate 2-4 temporal questions. Ask about order, progression, or historical development.

Output format:
```
### Question: [What was the progression of... / In what order were...]
### Expected Answer: [clear chronological sequence]
### Expected Items: N/A
### Expected Behavior: [must maintain correct order]
```

---

## 6. Ambiguous (disambiguation)

Generate 2-4 ambiguous questions. Terms with multiple meanings in ML that require context to resolve.

Output format:
```
### Question: [What is X? where X has multiple interpretations]
### Expected Answer: [context-dependent answer]
### Expected Items: N/A
### Expected Behavior: [must correctly disambiguate based on context]
```

---

## 7. Technical (precise details)

Generate 2-4 technical questions. Formulas, notation, implementation specifics.

Output format:
```
### Question: [Write the equation for... / What is the exact notation for...]
### Expected Answer: [use precise notation/terminology from sources]
### Expected Items: N/A
### Expected Behavior: [must use exact terminology, not approximations]
```

---

## 8. Explanation (how it works)

Generate 2-4 explanation questions. Deep dive into mechanisms or processes.

Output format:
```
### Question: [How does X work? / Explain the mechanism of...]
### Expected Answer: [3-5 sentences explaining the process]
### Expected Items: N/A
### Expected Behavior: [must explain key components and their interaction]
```

---

## 9. Summarization (key takeaways)

Generate 2-4 summarization questions. Synthesize main points across multiple sources.

Output format:
```
### Question: [Summarize the main advantages of... / What are the key takeaways from...]
### Expected Answer: [synthesize 3-5 main points]
### Expected Items: N/A
### Expected Behavior: [must cover multiple aspects, not just one]
```
