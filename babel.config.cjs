module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current',
      },
    }],
    ['@babel/preset-typescript', {
      isTSX: true,
      allExtensions: true,
      allowDeclareFields: true,
      onlyRemoveTypeImports: true,
    }],
    '@babel/preset-react',
  ],
  // Only apply in test environment
  env: {
    test: {
      plugins: [
        // Transform import.meta.env to process.env for Jest
        'babel-plugin-transform-vite-meta-env',
      ],
    },
  },
};
