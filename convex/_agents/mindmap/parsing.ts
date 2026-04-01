"use node"

import type { MindMapNode } from './state.js';

function cleanLeafNodes(node: MindMapNode): void {
  if (node.children && node.children.length === 0) {
    node.children = null;
  } else if (node.children) {
    node.children.forEach(c => cleanLeafNodes(c));
  }
}

/**
 * Parses markdown indentation into a JSON tree
 */
export function parseMarkdownToTree(markdown: string): MindMapNode {
  const lines = markdown.split('\n').filter(l => l.trim().length > 0);
  let root: MindMapNode = { topic: 'Knowledge Map', children: [] };

  const stack: { node: MindMapNode; level: number }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');

    if (line.trim().startsWith('#')) {
      const rootTopic = line.replace(/^#+\s*/, '').trim();
      root = { topic: rootTopic, children: [] };
      stack.length = 0;
      stack.push({ node: root, level: 0 });
      continue;
    }

    const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)/);

    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const topic = bulletMatch[2].trim();

      const level = Math.floor(indent / 2) + 1;

      const newNode: MindMapNode = { topic, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        if (!root.children) root.children = [];
        root.children.push(newNode);
        stack.push({ node: newNode, level });
      } else {
        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(newNode);
        stack.push({ node: newNode, level });
      }
    }
  }

  cleanLeafNodes(root);
  return root;
}

export { cleanLeafNodes };
