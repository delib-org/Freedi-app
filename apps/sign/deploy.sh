#!/bin/bash

# Deploy Sign App to Firebase Hosting + Cloud Run
# Usage: ./deploy.sh

set -e

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

# Parse .env.local and separate build-time (NEXT_PUBLIC_*) from runtime vars
echo -e "${YELLOW}Parsing environment variables from .env.local...${NC}"
BUILD_ARGS=""
RUNTIME_VARS="NODE_ENV=production"

while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue

    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)

    # Skip empty keys
    [[ -z "$key" ]] && continue

    # Skip emulator-related vars
    [[ "$key" =~ ^USE_FIREBASE_EMULATOR.*$ ]] && continue
    [[ "$key" =~ ^FIRESTORE_EMULATOR.*$ ]] && continue

    # Get value (everything after first =)
    value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')

    # Add to appropriate list
    if [ -n "$value" ]; then
        if [[ "$key" =~ ^NEXT_PUBLIC_.* ]]; then
            # Build-time variables (inlined by Next.js)
            BUILD_ARGS="${BUILD_ARGS} --build-arg ${key}=${value}"
        else
            # Runtime variables
            RUNTIME_VARS="${RUNTIME_VARS},${key}=${value}"
        fi
    fi
done < .env.local

# Go to monorepo root
cd ../..

# Load production environment
echo -e "${YELLOW}Loading production environment...${NC}"
npm run env:prod

# Create a cloudbuild.yaml for the build with args
echo -e "${YELLOW}Building and pushing Docker image...${NC}"
cat > /tmp/cloudbuild-sign.yaml << EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${ARTIFACT_REGISTRY}'
      - '-f'
      - 'apps/sign/Dockerfile'
EOF

# Add build args to cloudbuild.yaml
while IFS='=' read -r key value || [ -n "$key" ]; do
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    [[ -z "$key" ]] && continue
    [[ "$key" =~ ^USE_FIREBASE_EMULATOR.*$ ]] && continue
    [[ "$key" =~ ^FIRESTORE_EMULATOR.*$ ]] && continue
    value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')
    if [ -n "$value" ] && [[ "$key" =~ ^NEXT_PUBLIC_.* ]]; then
        echo "      - '--build-arg'" >> /tmp/cloudbuild-sign.yaml
        echo "      - '${key}=${value}'" >> /tmp/cloudbuild-sign.yaml
    fi
done < apps/sign/.env.local

cat >> /tmp/cloudbuild-sign.yaml << EOF
      - '.'
images:
  - '${ARTIFACT_REGISTRY}'
timeout: '1800s'
EOF

# Run Cloud Build
gcloud builds submit --config=/tmp/cloudbuild-sign.yaml .

# Deploy to Cloud Run
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
    --set-env-vars "${RUNTIME_VARS}"

# Get the Cloud Run URL
CLOUD_RUN_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')
echo -e "${GREEN}Cloud Run deployed at: ${CLOUD_RUN_URL}${NC}"

# Deploy Firebase Hosting (rewrites to Cloud Run)
echo -e "${YELLOW}Deploying Firebase Hosting...${NC}"
firebase use ${PROJECT_ID}
firebase deploy --only hosting:sign

# Cleanup
rm -f /tmp/cloudbuild-sign.yaml

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Cloud Run URL: ${CLOUD_RUN_URL}"
echo -e "Sign app should be available at: https://sign.wizcol.com"
