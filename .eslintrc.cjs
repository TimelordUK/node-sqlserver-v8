module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "standard-with-typescript"
  ],
  parser: '@typescript-eslint/parser',
  "plugins": [
    "@typescript-eslint"
  ],
  parserOptions: {
    parser: '@typescript-eslint/parser',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  root: true,
  rules: {
    "@typescript-eslint/no-explicit-any":0,
    "@typescript-eslint/return-await": 0,
    "@typescript-eslint/no-this-alias": 0,
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-unused-vars": 0,
    "@typescript-eslint/restrict-template-expressions": 0,
    "@typescript-eslint/no-misused-promises": 0,
    "@typescript-eslint/strict-boolean-expressions": 0,
    "@typescript-eslint/consistent-type-assertions": 0,
    "@typescript-eslint/no-extraneous-class": 0,
    "@typescript-eslint/no-dynamic-delete": 0,
    "no-this-assignment": 0,
    "no-async-promise-executor": 0,
    "valid-typeof": 0,
    "@typescript-eslint/consistent-type-imports":0,
    "@typescript-eslint/ban-types":0,
    "@typescript-eslint/prefer-ts-expect-error":0,
    "@typescript-eslint/explicit-function-return-type":0,
    "@typescript-eslint/no-unsafe-argument":0,
    "@typescript-eslint/unbound-method":0
  },
};