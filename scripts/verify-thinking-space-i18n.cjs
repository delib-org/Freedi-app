const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'src/view/components/atomic/organisms/ThinkingSpace');
const files = fs.readdirSync(directory).filter(file => file.endsWith('.tsx')).map(file => path.join(directory,file));
files.push(path.join(root,'apps/sign/src/components/document/AgreementJourney.tsx'),path.join(root,'apps/sign/src/components/auth/AuthSync.tsx'));
const keys = new Set();
const strings = node => {
 if(ts.isStringLiteral(node)) keys.add(node.text);
 else if(ts.isConditionalExpression(node)){strings(node.whenTrue);strings(node.whenFalse);}
 else if(ts.isParenthesizedExpression(node)) strings(node.expression);
};
for(const file of files){
 const source = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit = node => {
  if(ts.isCallExpression(node) && node.expression.getText(source)==='t') node.arguments.forEach(strings);
  if(file.endsWith('MapExplorer.tsx') && ts.isPropertyAssignment(node) && ['group','title','description'].includes(node.name.getText(source))) strings(node.initializer);
  ts.forEachChild(node,visit);
 };
 visit(source);
}
for(const language of ['en','he','ar','fa','de','es','nl']){
 const dictionary = JSON.parse(fs.readFileSync(path.join(root,`packages/shared-i18n/src/languages/${language}.json`),'utf8'));
 for(const key of keys) assert.ok(dictionary[key] || key.split('.').reduce((value,part)=>value?.[part],dictionary),`${language}: missing ${key}`);
}
console.log(`PASS: ${keys.size} live workflow/map translation keys present in all seven languages.`);
