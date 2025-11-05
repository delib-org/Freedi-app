const tsJest = require('ts-jest').default;

module.exports = {
  process(sourceText, sourcePath, config) {
    // Replace import.meta.env with process.env for Jest
    const modifiedSource = sourceText
      .replace(/import\.meta\.env\.([A-Z_]+)/g, 'process.env.$1')
      .replace(/import\.meta\.env/g, 'process.env');

    // Use ts-jest to process the modified source
    return tsJest.createTransformer().process(modifiedSource, sourcePath, config);
  },
};
