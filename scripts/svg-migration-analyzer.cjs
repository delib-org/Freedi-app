#!/usr/bin/env node

// svg-migration-analyzer.js - Analyze SVG imports and suggest migrations
const fs = require('fs');
const path = require('path');

// Icon mappings from old names to new bundle names
const iconMappings = {
  'deleteIcon': 'delete',
  'delete': 'delete',
  'plusIcon': 'plus',
  'plus': 'plus',
  'editIcon': 'edit',
  'edit': 'edit',
  'lightBulbIcon': 'lightBulb',
  'lightBulb': 'lightBulb',
  'handIcon': 'hand',
  'hand': 'hand',
  'xIcon': 'x',
  'x': 'x',
  'ellipsisIcon': 'ellipsis',
  'ellipsis': 'ellipsis',
  'homeIcon': 'home',
  'home': 'home',
  'settingsIcon': 'settings',
  'settings': 'settings',
  'shareIcon': 'share',
  'share': 'share',
  'questionIcon': 'question',
  'navQuestionsIcon': 'question',
  'question': 'question',
  'groupIcon': 'group',
  'group': 'group',
  'chevronLeftIcon': 'chevronLeft',
  'chevronLeft': 'chevronLeft',
  'chevronRightIcon': 'chevronRight',
  'chevronRight': 'chevronRight',
  'checkIcon': 'check',
  'check': 'check',
  'infoCircleIcon': 'info',
  'info': 'info',
  'sendIcon': 'send',
  'send-icon-pointing-up-and-right': 'send',
  'send': 'send',
  'likeIcon': 'like',
  'like': 'like',
  'smileIcon': 'smile',
  'smile': 'smile',
  'frownIcon': 'frown',
  'frown': 'frown',
  'burgerIcon': 'burger',
  'burger': 'burger',
  'bellIcon': 'notification',
  'notification': 'notification',
  'disconnectIcon': 'disconnect',
  'disconnect': 'disconnect',
  'target': 'target',
  'saveIcon': 'save',
  'save': 'save',
  'view': 'view',
  'navMainPageIcon': 'map',
  'map': 'map',
  'mailIcon': 'mail',
  'mail': 'mail',
  'languagesIcon': 'language',
  'language': 'language',
  'installIcon': 'install',
  'install': 'install'
};

function findSvgImports(directory) {
  const results = [];
  
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const content = fs.readFileSync(filePath, 'utf8');
        const svgImports = content.match(/import\s+(\w+)\s+from\s+['"]@\/assets\/icons\/[\w\-\.]+\.svg\?react['"];?/g);
        
        if (svgImports) {
          svgImports.forEach(importLine => {
            const match = importLine.match(/import\s+(\w+)\s+from\s+['"]@\/assets\/icons\/([\w\-\.]+)\.svg\?react['"];?/);
            if (match) {
              const [fullMatch, importName, fileName] = match;
              const bundleName = iconMappings[importName] || iconMappings[fileName] || fileName;
              const isInBundle = !!iconMappings[importName] || !!iconMappings[fileName];
              
              results.push({
                file: filePath.replace(process.cwd(), '.'),
                importName,
                fileName,
                bundleName,
                isInBundle,
                originalLine: fullMatch.trim()
              });
            }
          });
        }
      }
    });
  }
  
  scanDirectory(directory);
  return results;
}

function generateMigrationReport(imports) {
  const bundledIcons = imports.filter(imp => imp.isInBundle);
  const unbundledIcons = imports.filter(imp => !imp.isInBundle);
  
  console.log('🔍 SVG Import Migration Analysis');
  console.log('================================\n');
  
  console.log(`📊 Summary:`);
  console.log(`  Total SVG imports found: ${imports.length}`);
  console.log(`  Icons in bundle: ${bundledIcons.length} (${Math.round(bundledIcons.length/imports.length*100)}%)`);
  console.log(`  Icons NOT in bundle: ${unbundledIcons.length} (${Math.round(unbundledIcons.length/imports.length*100)}%)`);
  console.log(`  Potential request reduction: ~${bundledIcons.length} requests\n`);
  
  if (bundledIcons.length > 0) {
    console.log('✅ Icons ready for migration (in bundle):');
    console.log('==========================================');
    bundledIcons.forEach(imp => {
      console.log(`📄 ${imp.file}`);
      console.log(`   Before: ${imp.originalLine}`);
      console.log(`   After:  <Icon name="${imp.bundleName}" />`);
      console.log('');
    });
  }
  
  if (unbundledIcons.length > 0) {
    console.log('⚠️  Icons requiring fallback (not in bundle):');
    console.log('=============================================');
    unbundledIcons.forEach(imp => {
      console.log(`📄 ${imp.file}`);
      console.log(`   Import: ${imp.originalLine}`);
      console.log(`   Suggest: <Icon name="${imp.bundleName}" fallbackToOriginal={true} />`);
      console.log('');
    });
  }
  
  // Generate frequency report
  const iconFrequency = {};
  imports.forEach(imp => {
    iconFrequency[imp.bundleName] = (iconFrequency[imp.bundleName] || 0) + 1;
  });
  
  const sortedIcons = Object.entries(iconFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  console.log('📈 Top 10 Most Used Icons:');
  console.log('==========================');
  sortedIcons.forEach(([icon, count], index) => {
    const inBundle = Object.values(iconMappings).includes(icon) ? '✅' : '❌';
    console.log(`${index + 1}. ${icon}: ${count} uses ${inBundle}`);
  });
  
  console.log('\n🚀 Next Steps:');
  console.log('==============');
  console.log('1. Start with the most frequently used bundled icons');
  console.log('2. Replace imports with: import { Icon } from "@/view/components/icons"');
  console.log('3. Replace usage: <IconComponent /> → <Icon name="iconName" />');
  console.log('4. Test thoroughly before removing old imports');
  console.log('5. Measure request reduction in browser dev tools');
}

// Run the analysis
console.log('🔍 Starting SVG migration analysis...');
const srcDirectory = path.join(process.cwd(), 'src');
console.log('📁 Source directory:', srcDirectory);

if (fs.existsSync(srcDirectory)) {
  console.log('✅ Source directory found, scanning for SVG imports...');
  const imports = findSvgImports(srcDirectory);
  console.log(`📊 Found ${imports.length} SVG imports`);
  generateMigrationReport(imports);
} else {
  console.error('❌ src directory not found. Run this script from the project root.');
  process.exit(1);
}
