# Deployment Guide

## Backend Deployment to Render

Your backend is deployed at: **https://joby-7b07.onrender.com**

### Render Configuration (FIXED - No Docker Issues)

I've created a `render.yaml` file that configures Render to use **Node.js** instead of Docker. This eliminates the Dockerfile error.

**Configuration:**
- ✅ Runtime: Node.js 20
- ✅ Root Directory: `backend`
- ✅ Build Command: `npm install && npm run build`
- ✅ Start Command: `npm start`

### How to Deploy/Redeploy:

#### Option 1: Using render.yaml (Recommended)
1. Commit and push the new `render.yaml` file:
   ```bash
   git add render.yaml backend/.renderignore
   git commit -m "Add Render configuration"
   git push origin main
   ```

2. In Render Dashboard:
   - Go to your service settings
   - Change **Runtime** from "Docker" to "Node"
   - Set **Root Directory** to `backend`
   - Set **Build Command** to `npm install && npm run build`
   - Set **Start Command** to `npm start`
   - Click "Save Changes"
   - Render will auto-redeploy

#### Option 2: Manual Configuration in Render Dashboard
1. Go to https://dashboard.render.com
2. Click on your service (joby-backend or similar)
3. Click "Settings" tab
4. Scroll to "Build & Deploy" section
5. Change these settings:
   - **Runtime:** Node
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Node Version:** 20.11.0 (optional, but recommended)
6. Click "Save Changes"
7. Go to "Manual Deploy" and click "Deploy latest commit"

### Required Environment Variables on Render

Add these in Render Dashboard → Your Service → Environment:

#### Required (App will fail without these):
- `DATABASE_URL` - Your PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens

#### Optional (Feature-specific):
- `GROQ_API_KEY` - For AI generation features
- `STRIPE_SECRET_KEY` - For payment processing
- `STRIPE_WEBHOOK_SECRET` - For Stripe webhooks
- `GOOGLE_CLIENT_ID` - For Google OAuth
- `GOOGLE_CLIENT_SECRET` - For Google OAuth
- `SMTP_HOST` - For email functionality
- `SMTP_PORT` - SMTP port (usually 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password

**Note:** Do NOT add `PORT` - Render assigns this automatically.

### Build Configuration on Render

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Dockerfile:** `backend/Dockerfile` (if using Docker)

## Extension Configuration

The Chrome extension has been updated to use your Render backend URL.

### Files Updated:
- ✅ `extension/src/background.js` - Main API URL configuration
- ✅ `extension/popup/popup.js` - Popup API calls
- ✅ `extension/src/content.js` - Content script API calls

### To Deploy Extension Updates:

1. **Build the extension** (if you have a build step):
   ```bash
   cd extension
   npm run build  # if applicable
   ```

2. **Load in Chrome**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

3. **Test the connection**:
   - Open the extension popup
   - Try logging in or registering
   - Check browser console for any errors

## Troubleshooting

### Backend Issues:
- Check Render logs for errors
- Verify all required environment variables are set
- Ensure database migrations ran successfully

### Extension Issues:
- Check browser console (F12) for errors
- Verify the backend URL is accessible: https://auto-job-helper-backend.onrender.com
- Check Network tab to see API requests

### CORS Issues:
If you get CORS errors, ensure your backend allows requests from the Chrome extension origin.

## Next Steps

1. ✅ Backend deployed to Render
2. ✅ Extension configured with Render URL
3. ⏳ Set environment variables on Render
4. ⏳ Test the full flow (register → login → upload resume → apply to job)
5. ⏳ Monitor Render logs for any issues
