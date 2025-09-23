#!/bin/bash

# Hikma Health Server - Local Setup Verification
# Run this script to verify your local environment is ready for deployment

set -e

echo "🔍 Hikma Health Server - Local Verification"
echo "============================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        return 1
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo "📁 Project directory: $(pwd)"
echo ""

# 1. Check Prerequisites
echo "🔧 Checking Prerequisites..."
echo "----------------------------"

# Check Node.js version
if command -v node &> /dev/null; then
    node_version=$(node --version)
    print_status $? "Node.js installed: $node_version"
    
    # Check if it's the right version
    if [[ "$node_version" == v22* ]] || [[ "$node_version" == v20* ]] || [[ "$node_version" == v18* ]]; then
        print_status 0 "Node.js version is compatible"
    else
        print_warning "Node.js version should be 18+, 20+, or 22+ for best compatibility"
    fi
else
    print_status 1 "Node.js not found"
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    pnpm_version=$(pnpm --version)
    print_status $? "pnpm installed: $pnpm_version"
else
    print_status 1 "pnpm not found - install with: npm install -g pnpm"
fi

# Check git
if command -v git &> /dev/null; then
    git_version=$(git --version)
    print_status $? "Git installed: $git_version"
else
    print_status 1 "Git not found"
fi

echo ""

# 2. Check Project Structure
echo "📂 Checking Project Structure..."
echo "--------------------------------"

required_files=(
    "package.json"
    "src/env.ts"
    "src/routes/api/health.tsx"
    ".github/workflows/ci.yaml"
    ".github/workflows/deploy-staging.yml"
    ".github/workflows/deploy-production.yml"
    "render-staging.yaml"
    "render-production.yaml"
    "docs/DEPLOYMENT_GUIDE.md"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        print_status 0 "Found: $file"
    else
        print_status 1 "Missing: $file"
    fi
done

echo ""

# 3. Install Dependencies
echo "📦 Installing Dependencies..."
echo "-----------------------------"

if pnpm install; then
    print_status 0 "Dependencies installed successfully"
else
    print_status 1 "Failed to install dependencies"
    exit 1
fi

echo ""

# 4. Run Tests
echo "🧪 Running Tests..."
echo "-------------------"

if pnpm test; then
    print_status 0 "All tests passed"
else
    print_status 1 "Some tests failed"
fi

echo ""

# 5. Run Linting
echo "🔍 Running Linting..."
echo "---------------------"

if pnpm run lint; then
    print_status 0 "Linting passed"
else
    print_status 1 "Linting failed"
fi

echo ""

# 6. Check Build
echo "🏗️  Testing Build..."
echo "--------------------"

if pnpm run build; then
    print_status 0 "Build successful"
    
    # Check if build output exists
    if [ -d ".output" ]; then
        print_status 0 "Build output directory exists"
        
        # Check build size
        build_size=$(du -sh .output 2>/dev/null | cut -f1)
        print_info "Build size: $build_size"
    else
        print_warning "Build output directory not found"
    fi
else
    print_status 1 "Build failed"
fi

echo ""

# 7. Check Environment Configuration
echo "🌍 Checking Environment Configuration..."
echo "---------------------------------------"

# Check if env.ts is properly configured
if grep -q "VITE_APP_TITLE" src/env.ts; then
    print_status 0 "Environment configuration found"
else
    print_status 1 "Environment configuration missing"
fi

# Check for local env files
if [ -f ".env" ]; then
    print_warning "Local .env file found - ensure it's in .gitignore"
    if grep -q ".env" .gitignore; then
        print_status 0 ".env is properly ignored"
    else
        print_status 1 ".env should be added to .gitignore"
    fi
fi

echo ""

# 8. Check Git Configuration
echo "📝 Checking Git Configuration..."
echo "--------------------------------"

# Check current branch
current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
print_info "Current branch: $current_branch"

# Check if we have uncommitted changes
if git diff-index --quiet HEAD --; then
    print_status 0 "No uncommitted changes"
else
    print_warning "You have uncommitted changes"
    git status --porcelain
fi

# Check if develop branch exists
if git show-ref --verify --quiet refs/heads/develop; then
    print_status 0 "Develop branch exists"
else
    print_warning "Develop branch doesn't exist - you'll need to create it"
    print_info "Run: git checkout -b develop && git push -u origin develop"
fi

# Check remote origin
if git remote get-url origin &>/dev/null; then
    origin_url=$(git remote get-url origin)
    print_status 0 "Git origin configured: $origin_url"
    
    if [[ "$origin_url" == *"UOSSM-USA"* ]]; then
        print_status 0 "Correct GitHub organization detected"
    else
        print_warning "Make sure this is the UOSSM-USA repository"
    fi
else
    print_status 1 "Git origin not configured"
fi

echo ""

# 9. Check Workflow Files
echo "⚙️  Checking Workflow Files..."
echo "------------------------------"

# Check if workflow files are valid YAML
for workflow in .github/workflows/*.yml .github/workflows/*.yaml; do
    if [ -f "$workflow" ]; then
        if command -v yamllint &> /dev/null; then
            if yamllint "$workflow" &>/dev/null; then
                print_status 0 "Valid YAML: $(basename $workflow)"
            else
                print_status 1 "Invalid YAML: $(basename $workflow)"
            fi
        else
            print_info "YAML validation skipped (yamllint not installed)"
        fi
    fi
done

echo ""

# 10. Database Migration Check
echo "🗄️  Checking Database Setup..."
echo "------------------------------"

if [ -d "db/migrations" ]; then
    migration_count=$(ls -1 db/migrations/*.ts 2>/dev/null | wc -l)
    print_status 0 "Found $migration_count database migrations"
else
    print_warning "No database migrations directory found"
fi

# Check if db commands exist
if grep -q "db:migrate" package.json; then
    print_status 0 "Database migration script found"
else
    print_status 1 "Database migration script missing"
fi

echo ""

# Summary
echo "📊 Verification Summary"
echo "======================="

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 Local setup verification completed!${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Create develop branch if needed"
    echo "2. Set up Render services using the YAML configurations"
    echo "3. Configure GitHub secrets"
    echo "4. Set up DNS records"
    echo "5. Test deployment to staging"
    echo ""
    echo -e "${BLUE}For detailed instructions, see: docs/DEPLOYMENT_GUIDE.md${NC}"
else
    echo -e "${RED}❌ Some verification steps failed. Please fix the issues above before proceeding.${NC}"
fi
