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
  root: true,
  rules: {
    "@typescript-eslint/no-explicit-any":"off",
    "@typescript-eslint/return-await": "off",
    "@typescript-eslint/no-this-alias": "off",
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/strict-boolean-expressions": "off",
    "@typescript-eslint/consistent-type-assertions": "off",
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/no-dynamic-delete": "off",
    "no-this-assignment": "off",
    "no-async-promise-executor": "off",
    "valid-typeof": "off",
    "@typescript-eslint/consistent-type-imports":"off",
    "@typescript-eslint/ban-types":"off",
    "@typescript-eslint/prefer-ts-expect-error":"off",
    "@typescript-eslint/explicit-function-return-type":"off"
  },
};