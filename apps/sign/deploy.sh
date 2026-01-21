#!/bin/bash

# Deploy Sign App to Firebase Hosting + Cloud Run
# Usage: ./deploy.sh

set -e

# Add gcloud to PATH
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

# Configuration
PROJECT_ID="wizcol-app"
REGION="me-west1"
SERVICE_NAME="sign-app"
IMAGE_NAME="sign-app"
ARTIFACT_REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${IMAGE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deploying Sign App to Cloud Run${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from apps/sign directory${NC}"
    exit 1
fi

# Check if gcloud is authenticated
if ! gcloud auth print-identity-token &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with gcloud. Run 'gcloud auth login'${NC}"
    exit 1
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo -e "${RED}Error: .env.local file not found. Copy .env.example to .env.local and fill in values.${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}Setting GCP project to ${PROJECT_ID}...${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs (if not already enabled)
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --quiet || true

# Create Artifact Registry repository if it doesn't exist
echo -e "${YELLOW}Creating Artifact Registry repository (if needed)...${NC}"
gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker \
    --location=${REGION} \
    --description="Cloud Run source deployments" 2>/dev/null || true

# Go to monorepo root
cd ../..

# Load production environment
echo -e "${YELLOW}Loading production environment...${NC}"
npm run env:prod

# Create cloudbuild.yaml with build args from .env.local
echo -e "${YELLOW}Building and pushing Docker image...${NC}"

# Start cloudbuild.yaml
cat > /tmp/cloudbuild-sign.yaml << 'HEADER'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
HEADER

echo "      - '${ARTIFACT_REGISTRY}'" >> /tmp/cloudbuild-sign.yaml
echo "      - '-f'" >> /tmp/cloudbuild-sign.yaml
echo "      - 'apps/sign/Dockerfile'" >> /tmp/cloudbuild-sign.yaml

# Add NEXT_PUBLIC build args using node to properly parse .env file
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/sign/.env.local', 'utf-8');
content.split('\n').forEach(line => {
  if (line.startsWith('#') || !line.trim()) return;
  const match = line.match(/^(NEXT_PUBLIC_[^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    // Remove surrounding quotes
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith(\"'\") && value.endsWith(\"'\"))) {
      value = value.slice(1, -1);
    }
    console.log(\"      - '--build-arg'\");
    console.log(\"      - '\" + match[1] + \"=\" + value + \"'\");
  }
});
" >> /tmp/cloudbuild-sign.yaml

cat >> /tmp/cloudbuild-sign.yaml << 'FOOTER'
      - '.'
images:
  - '${ARTIFACT_REGISTRY}'
timeout: '1800s'
FOOTER

# Replace placeholder in footer
sed -i.bak "s|\${ARTIFACT_REGISTRY}|${ARTIFACT_REGISTRY}|g" /tmp/cloudbuild-sign.yaml
rm -f /tmp/cloudbuild-sign.yaml.bak

# Run Cloud Build
gcloud builds submit --config=/tmp/cloudbuild-sign.yaml .

# Create env.yaml for Cloud Run runtime vars using node
echo -e "${YELLOW}Preparing runtime environment variables...${NC}"
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/sign/.env.local', 'utf-8');
const vars = { NODE_ENV: 'production' };

content.split('\n').forEach(line => {
  if (line.startsWith('#') || !line.trim()) return;
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) return;

  const key = line.substring(0, eqIndex).trim();
  let value = line.substring(eqIndex + 1).trim();

  // Skip NEXT_PUBLIC (build-time only) and emulator vars
  if (key.startsWith('NEXT_PUBLIC_')) return;
  if (key.includes('EMULATOR')) return;
  if (!value) return;

  // Remove surrounding quotes
  if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith(\"'\") && value.endsWith(\"'\"))) {
    value = value.slice(1, -1);
  }

  vars[key] = value;
});

// Output as YAML with proper escaping
let yaml = '';
for (const [k, v] of Object.entries(vars)) {
  // For private keys or values with special chars, use single quotes and escape single quotes
  if (k.includes('PRIVATE_KEY') || v.includes('-----BEGIN')) {
    // Keep \\n as literal for private keys - Cloud Run will pass them as-is
    // and the app code will convert them to real newlines
    yaml += k + \": '\" + v.replace(/'/g, \"''\") + \"'\\n\";
  } else if (v.includes(':') || v.includes('#') || v.includes('\"')) {
    yaml += k + \": '\" + v.replace(/'/g, \"''\") + \"'\\n\";
  } else {
    yaml += k + ': ' + v + '\\n';
  }
}
fs.writeFileSync('/tmp/env-sign.yaml', yaml);
console.log('Environment variables prepared');
"

# Deploy to Cloud Run with env vars file
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${ARTIFACT_REGISTRY} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --env-vars-file /tmp/env-sign.yaml

# Get the Cloud Run URL
CLOUD_RUN_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')
echo -e "${GREEN}Cloud Run deployed at: ${CLOUD_RUN_URL}${NC}"

# Deploy Firebase Hosting (rewrites to Cloud Run)
echo -e "${YELLOW}Deploying Firebase Hosting...${NC}"
firebase use ${PROJECT_ID}
firebase deploy --only hosting:sign

# Cleanup
rm -f /tmp/cloudbuild-sign.yaml /tmp/env-sign.yaml

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Cloud Run URL: ${CLOUD_RUN_URL}"
echo -e "Sign app should be available at: https://sign.wizcol.com"
