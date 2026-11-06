/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/.expo/", "/dist/"],
  moduleNameMapper: {
    "^@convex/(.*)$": "<rootDir>/../../convex/$1",
    "^@mobile/(.*)$": "<rootDir>/src/$1",
  },
};
