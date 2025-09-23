#!/bin/bash

# Hikma Health Server - Deployment Setup Script
# This script helps configure the initial deployment setup

set -e

echo "🏥 Hikma Health Server - Deployment Setup"
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if required tools are installed
echo "🔍 Checking prerequisites..."

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ git is not installed. Please install git first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Check current branch
current_branch=$(git branch --show-current)
echo "📍 Current branch: $current_branch"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Run tests to ensure everything is working
echo "🧪 Running tests..."
pnpm test

# Run build to ensure it works
echo "🏗️  Building application..."
pnpm build

echo ""
echo "✅ Local setup completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "==============="
echo ""
echo "1. 🔐 Set up GitHub Secrets:"
echo "   - Go to GitHub repository settings"
echo "   - Add these secrets:"
echo "     * RENDER_API_KEY"
echo "     * RENDER_STAGING_SERVICE_ID"
echo "     * RENDER_PRODUCTION_SERVICE_ID"
echo ""
echo "2. 🚀 Set up Render Services:"
echo "   - Create staging service using render-staging.yaml"
echo "   - Create production service using render-production.yaml"
echo "   - Configure custom domains in Render dashboard"
echo ""
echo "3. 🌐 Configure DNS:"
echo "   - Set up CNAME records for:"
echo "     * ehr-staging.uossm.us → <staging-service>.onrender.com"
echo "     * ehr.uossm.us → <production-service>.onrender.com"
echo ""
echo "4. 📊 Set up Sentry:"
echo "   - Create projects for staging and production"
echo "   - Add Sentry tokens to Render environment variables"
echo ""
echo "5. 🌿 Create develop branch:"
if [ "$current_branch" != "develop" ]; then
    echo "   git checkout -b develop"
    echo "   git push -u origin develop"
else
    echo "   ✅ Already on develop branch"
fi
echo ""
echo "📖 For detailed instructions, see: docs/DEPLOYMENT_GUIDE.md"
echo ""
echo "🎉 Setup complete! Ready for deployment."
