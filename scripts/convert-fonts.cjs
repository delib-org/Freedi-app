const fs = require('fs');
const path = require('path');
const ttf2woff2 = require('ttf2woff2').default || require('ttf2woff2');

// Define font paths to convert (only the variable fonts we actually use)
const fontsToConvert = [
    'src/assets/fonts/Assistant/Assistant-VariableFont_wght.ttf',
    'src/assets/fonts/Open_Sans/OpenSans-VariableFont_wdth,wght.ttf',
    'src/assets/fonts/Open_Sans/OpenSans-Italic-VariableFont_wdth,wght.ttf',
    'src/assets/fonts/Quicksand/Quicksand-VariableFont_wght.ttf',
    'src/assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf',
    'src/assets/fonts/Roboto/Roboto-Italic-VariableFont_wdth,wght.ttf',
    'src/assets/fonts/Source_Sans_3/SourceSans3-VariableFont_wght.ttf',
    'src/assets/fonts/Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf'
];

console.log('🔄 Starting font conversion from TTF to WOFF2...\n');

let totalSaved = 0;
let convertedCount = 0;

fontsToConvert.forEach((fontPath) => {
    const fullPath = path.join(__dirname, '..', fontPath);
    const woff2Path = fullPath.replace('.ttf', '.woff2');

    try {
        // Read TTF file
        const ttfBuffer = fs.readFileSync(fullPath);
        const originalSize = ttfBuffer.length;

        // Convert to WOFF2
        const woff2Buffer = ttf2woff2(ttfBuffer);
        const compressedSize = woff2Buffer.length;

        // Write WOFF2 file
        fs.writeFileSync(woff2Path, woff2Buffer);

        // Calculate savings
        const savedBytes = originalSize - compressedSize;
        const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);
        totalSaved += savedBytes;
        convertedCount++;

        console.log(`✅ ${path.basename(fontPath)}`);
        console.log(`   Original: ${(originalSize / 1024).toFixed(0)}KB → WOFF2: ${(compressedSize / 1024).toFixed(0)}KB`);
        console.log(`   Saved: ${(savedBytes / 1024).toFixed(0)}KB (${savedPercent}%)\n`);

    } catch (error) {
        console.error(`❌ Error converting ${path.basename(fontPath)}: ${error.message}\n`);
    }
});

console.log('========================================');
console.log(`📊 Conversion complete!`);
console.log(`   Converted: ${convertedCount}/${fontsToConvert.length} fonts`);
console.log(`   Total saved: ${(totalSaved / 1024).toFixed(0)}KB`);
console.log(`   That's ${(totalSaved / (1024 * 1024)).toFixed(2)}MB saved!`);
console.log('========================================\n');
console.log('📝 Next step: Update src/assets/fonts.css to use .woff2 files');