const fs = require('fs');
const path = require('path');

// List of components to convert
const componentsToConvert = [
  // Notification components
  { tsx: 'src/view/components/notifications/NotificationPreferences.tsx', scss: 'notificationPreferences.scss' },
  { tsx: 'src/view/components/notifications/FCMTokenDisplay.tsx', scss: 'fcmTokenDisplay.scss' },
  { tsx: 'src/view/components/notifications/NotificationPrompt.tsx', scss: 'notificationPrompt.scss' },
  { tsx: 'src/view/components/notifications/NotificationSubscriptionButton.tsx', scss: 'notificationSubscriptionButton.scss' },
  
  // PWA components
  { tsx: 'src/view/components/pwa/PWAUpdateToast.tsx', scss: 'pwaUpdateToast.scss' },
  
  // Switch components
  { tsx: 'src/view/components/switch/customSwitchSmall/CustomSwitchSmall.tsx', scss: 'CustomSwitchSmall.scss' },
  
  // Other components
  { tsx: 'src/view/components/iconButton/IconButton.tsx', scss: 'IconButton.scss' },
  { tsx: 'src/view/components/accessibility/Accessibility.tsx', scss: 'Accessibility.scss' },
  { tsx: 'src/view/components/termsOfUse/TermsOfUse.tsx', scss: 'TermsOfUse.scss' },
  { tsx: 'src/view/components/uploadImage/UploadImage.tsx', scss: 'UploadImage.scss' },
  
  // Page components
  { tsx: 'src/view/pages/home/main/hometabs/HomeTabs.tsx', scss: 'home-tabs.scss' },
  { tsx: 'src/view/pages/home/main/mainCard/resultsNode/ResultsNode.tsx', scss: 'ResultsNode.scss' },
  { tsx: 'src/view/pages/home/main/addStatement/AddStatement.tsx', scss: 'AddStatement.scss' },
  { tsx: 'src/view/pages/unAuthorizedPage/UnAuthorizedPage.tsx', scss: 'unAuthorizedPage.scss' },
  { tsx: 'src/view/pages/page401/Page401.tsx', scss: 'page401.scss' },
  { tsx: 'src/view/pages/memberRejection/MemberRejection.tsx', scss: 'style.scss' },
  { tsx: 'src/view/pages/my/My.tsx', scss: 'my.scss' },
  { tsx: 'src/view/pages/page404/Page404.tsx', scss: 'page404.scss' },
  { tsx: 'src/view/pages/pricing/PricingPlan.tsx', scss: 'PricingPlan.scss' },
  { tsx: 'src/view/pages/login/LoginFirst.tsx', scss: 'LoginFirst.scss' },
  
  // Statement components
  { tsx: 'src/view/pages/statement/components/statementTypes/group/GroupPage.tsx', scss: 'groupPage.scss' },
  { tsx: 'src/view/pages/statement/components/vote/StatementVote.tsx', scss: 'StatementVote.scss' },
  { tsx: 'src/view/pages/statement/components/vote/components/optionBar/OptionBar.tsx', scss: 'OptionBar.scss' },
  { tsx: 'src/view/pages/statement/components/vote/components/info/StatementInfo.tsx', scss: 'StatementInfo.scss' },
  { tsx: 'src/view/pages/statement/components/vote/components/votingArea/VotingArea.tsx', scss: 'VotingArea.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/QuestionSettings/QuestionSettings.tsx', scss: 'QuestionSettings.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/QuestionSettings/QuestionStageRadioBtn/QuestionStageRadioBtn.tsx', scss: 'QuestionStageRadioBtn.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/titleAndDescription/TitleAndDescription.tsx', scss: 'TitleAndDescription.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/resultsRange/ResultsRange.tsx', scss: 'ResultsRange.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/sectionTitle/SectionTitle.tsx', scss: 'SectionTitle.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx', scss: 'AdvancedSettings.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/membership/MembersSettings.tsx', scss: 'MembersSettings.scss' },
  { tsx: 'src/view/pages/statement/components/settings/components/membership/membersChipsList/MembersChipList.tsx', scss: 'MembersChipList.scss' },
  { tsx: 'src/view/pages/statement/components/newStatement/NewStatement.tsx', scss: 'newStatement.scss' },
  { tsx: 'src/view/pages/statement/components/evaluations/components/evaluation/simpleEvaluation/SimpleEvaluation.tsx', scss: 'SimpleEvaluation.scss' },
  { tsx: 'src/view/pages/statement/components/chat/components/messageBoxCounter/MessageBoxCounter.tsx', scss: 'message-box-counter.scss' },
  { tsx: 'src/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore.tsx', scss: 'StatementChatMore.scss' },
  { tsx: 'src/view/pages/statement/components/chat/components/chatMessageNotify/ChatMessageNotify.tsx', scss: 'chat-message-notify.scss' },
  { tsx: 'src/view/pages/statement/components/chat/components/chatMessageCard/ChatMessageCard.tsx', scss: 'ChatMessageCard.scss' },
  { tsx: 'src/view/pages/statement/components/chat/components/userAvatar/UserAvatar.tsx', scss: 'UserAvatar.scss' },
  { tsx: 'src/view/pages/statement/components/createStatementModal/CreateStatementModal.tsx', scss: 'CreateStatementModal.scss' },
  { tsx: 'src/view/pages/statement/components/nav/bottom/StatementBottomNav.tsx', scss: 'StatementBottomNav.scss' },
  { tsx: 'src/view/pages/statement/components/followMeToast/FollowMeToast.tsx', scss: 'FollowMeToast.scss' },
];

// Function to convert camelCase/kebab-case to camelCase
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

// Function to process each component
function processComponent(component) {
  try {
    const tsxPath = path.join(__dirname, component.tsx);
    const dir = path.dirname(tsxPath);
    const scssPath = path.join(dir, component.scss);
    const moduleName = component.scss.replace('.scss', '.module.scss');
    const moduleScssPath = path.join(dir, moduleName);
    
    // Check if files exist
    if (!fs.existsSync(tsxPath)) {
      console.log(`TSX file not found: ${tsxPath}`);
      return;
    }
    
    if (!fs.existsSync(scssPath)) {
      console.log(`SCSS file not found: ${scssPath}`);
      return;
    }
    
    // Read TSX file
    let tsxContent = fs.readFileSync(tsxPath, 'utf8');
    
    // Update import statement
    const importRegex = new RegExp(`import\\s+['"]\\.\/${component.scss.replace('.', '\\.')}['"];?`);
    tsxContent = tsxContent.replace(importRegex, `import styles from './${moduleName}';`);
    
    // Read SCSS file
    let scssContent = fs.readFileSync(scssPath, 'utf8');
    
    // Find all class names in SCSS
    const classRegex = /\.([a-zA-Z][a-zA-Z0-9-_]*)/g;
    const classNames = new Set();
    let match;
    while ((match = classRegex.exec(scssContent)) !== null) {
      classNames.add(match[1]);
    }
    
    // Replace className usage in TSX
    classNames.forEach(className => {
      const camelCaseClass = toCamelCase(className);
      
      // Replace className="class-name"
      const regex1 = new RegExp(`className\\s*=\\s*["']${className}["']`, 'g');
      tsxContent = tsxContent.replace(regex1, `className={styles.${camelCaseClass}}`);
      
      // Replace className={`class-name`}
      const regex2 = new RegExp(`className\\s*=\\s*{\\s*\`${className}\`\\s*}`, 'g');
      tsxContent = tsxContent.replace(regex2, `className={styles.${camelCaseClass}}`);
      
      // Replace inside template literals
      const regex3 = new RegExp(`\\\${([^}]*)}\\s+${className}`, 'g');
      tsxContent = tsxContent.replace(regex3, (match, condition) => {
        return `\${${condition}} \${${condition} ? styles.${camelCaseClass} : ''}`;
      });
    });
    
    // Convert kebab-case to camelCase in SCSS
    classNames.forEach(className => {
      if (className.includes('-')) {
        const camelCaseClass = toCamelCase(className);
        scssContent = scssContent.replace(new RegExp(`\\.${className}`, 'g'), `.${camelCaseClass}`);
      }
    });
    
    // Write updated files
    fs.writeFileSync(tsxPath, tsxContent);
    fs.writeFileSync(moduleScssPath, scssContent);
    
    // Delete old SCSS file
    fs.unlinkSync(scssPath);
    
    console.log(`✓ Converted: ${component.tsx}`);
    
  } catch (error) {
    console.error(`Error processing ${component.tsx}:`, error);
  }
}

// Process all components
console.log('Starting SCSS module conversion...\n');
componentsToConvert.forEach(processComponent);
console.log('\nConversion complete!');