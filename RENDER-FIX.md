# Quick Fix for Render Docker Error

## Problem
```
error: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

## Solution
Switch from Docker to Node.js runtime in Render.

---

## Fix Steps (Choose One Method)

### Method 1: Update in Render Dashboard (Fastest)

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Click on your service: `joby-7b07` or similar

2. **Go to Settings**
   - Click "Settings" tab on the left

3. **Change Build Settings**
   Scroll to "Build & Deploy" section and update:
   
   | Setting | Old Value | New Value |
   |---------|-----------|-----------|
   | **Runtime** | Docker | **Node** |
   | **Root Directory** | (empty) | **backend** |
   | **Build Command** | (auto) | **npm install && npm run build** |
   | **Start Command** | (auto) | **npm start** |

4. **Save and Deploy**
   - Click "Save Changes" at the bottom
   - Render will automatically redeploy
   - Wait 2-3 minutes for build to complete

5. **Verify**
   - Check logs for "Server listening on port..."
   - Visit: https://joby-7b07.onrender.com/health
   - Should see: `{"data":{"status":"ok"},...}`

---

### Method 2: Use render.yaml (Automated)

1. **Commit the render.yaml file** (already created):
   ```bash
   git add render.yaml backend/.renderignore
   git commit -m "Switch to Node.js runtime"
   git push origin main
   ```

2. **Update Render to use render.yaml**:
   - Go to Render Dashboard → Your Service → Settings
   - Look for "Blueprint" or "Infrastructure as Code"
   - Enable "Use render.yaml"
   - Save and redeploy

---

## Why This Happened

Render was looking for a Dockerfile in the **root directory**, but your Dockerfile is in the **backend/** folder. 

Instead of fixing the Docker path, we switched to Node.js runtime which is:
- ✅ Simpler
- ✅ Faster builds
- ✅ No Docker complexity
- ✅ Works perfectly for Node.js apps

---

## After Fix - Test Checklist

- [ ] Render shows green "Live" status
- [ ] Logs show "Server listening on port..."
- [ ] https://joby-7b07.onrender.com/health returns `{"data":{"status":"ok"}}`
- [ ] No errors in Render logs
- [ ] Chrome extension can connect (after reloading extension)

---

## Still Having Issues?

Check these:

1. **Environment Variables Set?**
   - Go to Render → Environment tab
   - Verify DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET are set

2. **Build Logs Show Errors?**
   - Go to Render → Logs tab
   - Look for red error messages
   - Common issues: missing dependencies, TypeScript errors

3. **Database Connection Failed?**
   - Verify DATABASE_URL is correct
   - Check database is accessible from Render's IP

---

## Quick Commands Reference

```bash
# Push changes to trigger redeploy
git add .
git commit -m "Update configuration"
git push origin main

# Test backend locally
cd backend
npm install
npm run build
npm start

# Test health endpoint
curl https://joby-7b07.onrender.com/health
```
