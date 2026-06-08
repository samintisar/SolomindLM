#!/usr/bin/env bun

import { randomBytes } from "node:crypto";
import { isValidIndexNowKey } from "../src/shared/seo/indexNow.ts";

function generateIndexNowKey(length = 32): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  let key = "";
  for (let index = 0; index < length; index += 1) {
    key += alphabet[bytes[index]! % alphabet.length];
  }
  if (!isValidIndexNowKey(key)) {
    throw new Error("Generated key failed validation");
  }
  return key;
}

const key = generateIndexNowKey();
console.log(key);
console.error(
  "[generate-indexnow-key] Add to Vercel production env as INDEXNOW_KEY, then redeploy to write the key file and enable submissions."
);
