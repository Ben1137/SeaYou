#!/bin/bash

# SeaYou GitHub Pages Quick Setup Script
# This script helps you set up GitHub Pages deployment

echo "🌊 SeaYou - GitHub Pages Setup Script"
echo "====================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not a git repository!${NC}"
    echo "Please run this script from your SeaYou repository root."
    exit 1
fi

echo -e "${GREEN}✅ Git repository detected${NC}"
echo ""

# Create .github/workflows directory if it doesn't exist
if [ ! -d ".github/workflows" ]; then
    echo "📁 Creating .github/workflows directory..."
    mkdir -p .github/workflows
    echo -e "${GREEN}✅ Directory created${NC}"
else
    echo -e "${GREEN}✅ .github/workflows directory exists${NC}"
fi
echo ""

# Create deploy.yml workflow file
echo "📝 Creating GitHub Actions workflow..."
cat > .github/workflows/deploy.yml << 'EOF'
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
EOF

echo -e "${GREEN}✅ Workflow file created${NC}"
echo ""

# Update vite.config.ts
echo "⚙️  Updating vite.config.ts..."

if [ -f "vite.config.ts" ]; then
    # Backup original file
    cp vite.config.ts vite.config.ts.backup
    echo -e "${YELLOW}📋 Backup created: vite.config.ts.backup${NC}"
    
    # Check if base path is already set
    if grep -q "base:" vite.config.ts; then
        echo -e "${YELLOW}⚠️  Base path already exists in vite.config.ts${NC}"
        echo "Please manually verify it's set to: base: '/SeaYou/'"
    else
        echo "Adding base path configuration..."
        # This is a simple approach - you may need to adjust manually
        echo -e "${YELLOW}⚠️  Please manually add this line to your vite.config.ts:${NC}"
        echo "  base: '/SeaYou/',"
    fi
else
    echo -e "${RED}❌ vite.config.ts not found!${NC}"
    echo "Creating default vite.config.ts..."
    cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/SeaYou/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
EOF
    echo -e "${GREEN}✅ vite.config.ts created${NC}"
fi
echo ""

# Check git status
echo "📊 Checking repository status..."
git status --short
echo ""

# Offer to commit and push
echo -e "${YELLOW}📤 Ready to commit and push changes?${NC}"
echo "This will:"
echo "  1. Add the new workflow file"
echo "  2. Add updated vite.config.ts"
echo "  3. Commit with message: 'Configure GitHub Pages deployment'"
echo "  4. Push to origin/main"
echo ""

read -p "Continue? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Staging files..."
    git add .github/workflows/deploy.yml
    git add vite.config.ts
    
    echo "💾 Committing changes..."
    git commit -m "Configure GitHub Pages deployment"
    
    echo "🚀 Pushing to GitHub..."
    git push origin main
    
    echo ""
    echo -e "${GREEN}✅ All done!${NC}"
    echo ""
    echo "🎉 Next steps:"
    echo "  1. Go to https://github.com/Ben1137/SeaYou/settings/pages"
    echo "  2. Under 'Source', select 'GitHub Actions'"
    echo "  3. Wait 2-3 minutes for deployment"
    echo "  4. Access your app at: https://ben1137.github.io/SeaYou/"
    echo ""
    echo "Monitor deployment: https://github.com/Ben1137/SeaYou/actions"
else
    echo ""
    echo -e "${YELLOW}⏸️  Deployment preparation complete but not pushed.${NC}"
    echo "When ready, run:"
    echo "  git add .github/workflows/deploy.yml vite.config.ts"
    echo "  git commit -m 'Configure GitHub Pages deployment'"
    echo "  git push origin main"
fi

echo ""
echo -e "${GREEN}Setup script completed! 🌊${NC}"
