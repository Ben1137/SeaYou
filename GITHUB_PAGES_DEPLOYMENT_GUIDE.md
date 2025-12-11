# 🚀 SeaMe - Deployment Guide

This project is **already configured** for automatic deployment to GitHub Pages using GitHub Actions.

## ✅ Current Deployment Status

- **Live Site**: [https://ben1137.github.io/SeaMe/](https://ben1137.github.io/SeaMe/)
- **Deployment Method**: GitHub Actions (automatic)
- **Trigger**: Every push to `main` branch
- **Build Time**: ~2-3 minutes

## 📊 How It Works

### Automatic Deployment

1. You push code to the `main` branch
2. GitHub Actions automatically:
   - Installs dependencies
   - Builds the app with Vite
   - Deploys to GitHub Pages
3. Your changes are live within 2-3 minutes

### Configuration Files

The deployment is configured through:

- **`.github/workflows/deploy.yml`** - GitHub Actions workflow
- **`vite.config.ts`** - Build configuration with `base: '/SeaMe/'`
- **GitHub Pages Settings** - Source set to "GitHub Actions"

## 🔍 Monitoring Deployments

### Check Deployment Status

1. Go to: [https://github.com/Ben1137/SeaMe/actions](https://github.com/Ben1137/SeaMe/actions)
2. Look for "Deploy to GitHub Pages" workflows
3. Green checkmark ✅ = successful deployment
4. Red X ❌ = deployment failed (click to see logs)

### Deployment Badge

Add this to your README to show deployment status:

```markdown
[![Deploy to GitHub Pages](https://github.com/Ben1137/SeaMe/actions/workflows/deploy.yml/badge.svg)](https://github.com/Ben1137/SeaMe/actions/workflows/deploy.yml)
```

## 🛠️ Manual Deployment

You can manually trigger a deployment:

1. Go to [Actions tab](https://github.com/Ben1137/SeaMe/actions)
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"
4. Select branch: `main`
5. Click "Run workflow"

## 🔄 Making Updates

### Standard Workflow

```bash
# Make your changes
git add .
git commit -m "Your commit message"
git push origin main

# Deployment happens automatically!
```

### Verify Deployment

1. Wait 2-3 minutes for build to complete
2. Check [Actions tab](https://github.com/Ben1137/SeaMe/actions) for green checkmark
3. Visit [https://ben1137.github.io/SeaMe/](https://ben1137.github.io/SeaMe/)
4. Hard refresh (Ctrl+F5 / Cmd+Shift+R) to clear cache

## 🐛 Troubleshooting

### Build Fails

**Check the logs:**

1. Go to [Actions tab](https://github.com/Ben1137/SeaMe/actions)
2. Click on the failed workflow
3. Expand the failed step to see error details

**Common issues:**

- TypeScript errors → Fix type issues in your code
- Missing dependencies → Run `npm install` locally first
- Build errors → Test with `npm run build` locally

### Site Shows Old Version

**Solution:** Clear browser cache

- Chrome/Edge: Ctrl+Shift+Delete
- Firefox: Ctrl+Shift+Delete
- Safari: Cmd+Option+E
- Or use Incognito/Private mode

### 404 Errors on Assets

**Check:**

- `vite.config.ts` has `base: '/SeaMe/'`
- All imports use relative paths
- No hardcoded absolute paths

## 📱 Sharing Your App

### Beta Testing

Share this link with friends: **https://ben1137.github.io/SeaMe/**

They can:

- ✅ Access from any device (desktop, mobile, tablet)
- ✅ Use any modern browser
- ✅ Bookmark for easy access
- ✅ See real-time marine weather data
- ✅ No installation required

### Collecting Feedback

Consider adding:

- Feedback form in the app
- GitHub Issues for bug reports
- Analytics (Google Analytics, Plausible, etc.)

## 🎯 Advanced Configuration

### Custom Domain (Optional)

To use a custom domain like `seame.yourdomain.com`:

1. Go to **Settings** → **Pages**
2. Add your custom domain
3. Configure DNS with your domain provider:
   ```
   Type: CNAME
   Name: seame (or your subdomain)
   Value: ben1137.github.io
   ```
4. Wait for DNS propagation (up to 24 hours)

### Environment Variables

If you need environment variables:

1. Add them to GitHub Secrets:

   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click "New repository secret"

2. Use in workflow (`.github/workflows/deploy.yml`):
   ```yaml
   - name: Build
     run: npm run build
     env:
       VITE_API_KEY: ${{ secrets.API_KEY }}
   ```

## 📚 Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

## ✨ Summary

Your SeaMe app is fully configured for automatic deployment. Just push to `main` and your changes go live automatically!

**Live Site:** [https://ben1137.github.io/SeaMe/](https://ben1137.github.io/SeaMe/) 🌊
