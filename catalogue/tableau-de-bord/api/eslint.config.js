import antfu from '@antfu/eslint-config'

// Configuration des conventions de la Fabrique numérique (stack/eslint, projet back) :
// @antfu/eslint-config vérifie le code et le met en forme (pas de Prettier).
// « pnpm lint » vérifie, « pnpm format » corrige.
export default antfu(
  {
    ignores: ['dist/**', 'src/generated/**', 'coverage/**'],
    // Règles qui s'appuient sur les types (promesses oubliées…).
    typescript: { tsconfigPath: 'tsconfig.json' },
  },
  [
    {
      rules: {
        'style/operator-linebreak': [
          'error',
          'after',
          {
            overrides: { '?': 'before', ':': 'before' },
          },
        ],
        'style/space-before-function-paren': ['error', 'always'],
        'style/brace-style': [
          'error',
          '1tbs',
          { allowSingleLine: true },
        ],
        'curly': ['error', 'all'],
        'ts/ban-ts-comment': [
          'error',
          { 'ts-ignore': 'allow-with-description' },
        ],
        'style/comma-dangle': ['error', 'always-multiline'],
        // Espaces insécables et espaces fines insécables du français.
        'no-irregular-whitespace': 'off',
        // Projet back (stack/eslint) et NestJS : variables inutilisées en avertissement, « any » permis.
        'no-unused-vars': 'off',
        'ts/no-unused-vars': 'warn',
        'ts/no-explicit-any': 'off',
        // Règles typées trop strictes pour un POC (« any » permis plus haut) : seules les promesses oubliées,
        // les « await » inutiles… restent vérifiées.
        'ts/strict-boolean-expressions': 'off',
        'ts/no-unsafe-member-access': 'off',
        'ts/no-unsafe-assignment': 'off',
        'ts/no-unsafe-argument': 'off',
        'ts/no-unsafe-call': 'off',
        'ts/no-unsafe-return': 'off',
        // L'injection de dépendances de NestJS lit les types des constructeurs au démarrage :
        // ils ne doivent pas devenir « import type ».
        'ts/consistent-type-imports': 'off',
        // Des noms qui ont du sens : pas de « el », « x », « s »… (sauf noms imposés par les bibliothèques).
        'id-length': [
          'error',
          {
            min: 3,
            properties: 'never',
            exceptions: [
              'vi',
              'id',
              'ok',
              'fs',
              'db',
              'ui',
              'to',
              '_',
            ],
          },
        ],
      },
    },
  ],
)
