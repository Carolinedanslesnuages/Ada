import antfu from '@antfu/eslint-config'

// Configuration des conventions de la Fabrique numérique : @antfu/eslint-config vérifie le code
// et le met en forme (pas de Prettier). « pnpm lint » vérifie, « pnpm format » corrige.
export default antfu(
  {
    // Accessibilité vérifiée à l'écriture (images, étiquettes, clavier, ARIA…) : la CI échoue sinon.
    vue: { a11y: true },
    ignores: ['**/dist/**', '**/coverage/**'],
  },
  [
    {
      // Règles des conventions (stack/eslint), sauf « import/order » : cette règle n'existe plus dans
      // @antfu/eslint-config, qui trie déjà les imports.
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
        'vue/no-irregular-whitespace': 'off',
      },
    },
    {
      rules: {
        // Le DSFR relie l'étiquette au champ par for/id (conforme RGAA) : l'imbrication n'est pas exigée.
        'vue-a11y/label-has-for': [
          'error',
          {
            required: {
              some: ['nesting', 'id'],
            },
          },
        ],
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
