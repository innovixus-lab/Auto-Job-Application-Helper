# Deployment Guide

## Backend Deployment to Render

Your backend is deployed at: **https://auto-job-helper-backend.onrender.com**

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
