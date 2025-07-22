#!/bin/bash

# Script to convert SCSS files to CSS modules
# This script will:
# 1. Rename .scss files to .module.scss
# 2. Update imports in TSX files
# 3. Convert className usage to CSS modules format

echo "Starting SCSS to CSS modules conversion..."

# Find all TSX files that import non-module SCSS files
files_to_convert=(
    "src/view/pages/login/LoginFirst.tsx|LoginFirst.scss"
    "src/view/pages/pricing/PricingPlan.tsx|PricingPlan.scss"
    "src/view/pages/page404/Page404.tsx|page404.scss"
    "src/view/pages/my/My.tsx|my.scss"
    "src/view/pages/memberRejection/MemberRejection.tsx|style.scss"
    "src/view/pages/page401/Page401.tsx|page401.scss"
    "src/view/pages/unAuthorizedPage/UnAuthorizedPage.tsx|unAuthorizedPage.scss"
    "src/view/components/radioBox/RadioBox.tsx|RadioBox.scss"
    "src/view/components/notifications/NotificationSubscriptionButton.tsx|notificationSubscriptionButton.scss"
    "src/view/components/notifications/NotificationPrompt.tsx|notificationPrompt.scss"
    "src/view/components/accessibility/Accessibility.tsx|Accessibility.scss"
    "src/view/components/radioButtonWithLabel/RadioButtonWithLabel.tsx|RadioButtonWithLabel.scss"
    "src/view/components/loaders/LoaderGlass.tsx|loaderGlass.scss"
    "src/view/components/modal/InviteModal.tsx|inviteModal.scss"
    "src/view/components/modal/Modal.tsx|Modal.scss"
    "src/view/components/iconButton/IconButton.tsx|IconButton.scss"
    "src/view/components/menu/MenuOption.tsx|MenuOption.scss"
    "src/view/components/menu/Menu.tsx|Menu.scss"
    "src/view/components/switch/customSwitchSmall/CustomSwitchSmall.tsx|CustomSwitchSmall.scss"
    "src/view/components/uploadImage/UploadImage.tsx|UploadImage.scss"
    "src/view/components/notifications/FCMTokenDisplay.tsx|fcmTokenDisplay.scss"
    "src/view/components/pwa/PWAUpdateToast.tsx|pwaUpdateToast.scss"
    "src/view/components/termsOfUse/TermsOfUse.tsx|TermsOfUse.scss"
    "src/view/components/fullScreenModal/FullScreenModal.tsx|fullScreenModal.scss"
    "src/view/components/checkbox/Checkbox.tsx|Checkbox.scss"
    "src/view/components/toast/Toast.tsx|Toast.scss"
)

# Function to rename SCSS file and update imports
convert_file() {
    local tsx_file="$1"
    local scss_file="$2"
    
    local tsx_path="/Users/talyaron/Documents/Freedi-app/$tsx_file"
    local scss_path="/Users/talyaron/Documents/Freedi-app/$(dirname "$tsx_file")/$scss_file"
    local module_scss_path="/Users/talyaron/Documents/Freedi-app/$(dirname "$tsx_file")/$(basename "$scss_file" .scss).module.scss"
    
    echo "Converting: $tsx_file -> $scss_file"
    
    # Check if files exist
    if [[ ! -f "$tsx_path" ]]; then
        echo "  TSX file not found: $tsx_path"
        return 1
    fi
    
    if [[ ! -f "$scss_path" ]]; then
        echo "  SCSS file not found: $scss_path"
        return 1
    fi
    
    # Rename SCSS file to module.scss
    mv "$scss_path" "$module_scss_path"
    echo "  Renamed SCSS file to module.scss"
    
    # Update import in TSX file
    local old_import="import './$scss_file';"
    local new_import="import styles from './$(basename "$scss_file" .scss).module.scss';"
    
    # Also handle different quote styles
    sed -i '' "s|import './${scss_file}';|${new_import}|g" "$tsx_path"
    sed -i '' "s|import \"\./${scss_file}\";|${new_import}|g" "$tsx_path"
    
    echo "  Updated import in TSX file"
}

# Convert each file
for file_pair in "${files_to_convert[@]}"; do
    IFS='|' read -r tsx_file scss_file <<< "$file_pair"
    convert_file "$tsx_file" "$scss_file"
    echo ""
done

echo "Conversion completed! Next step: manually update className usage in each TSX file."
echo "Note: You'll need to update className='example' to className={styles.example} or className={styles['example']} for CSS classes with dashes."
