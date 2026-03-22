import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool';
import { validateRegisterBody } from '../middleware/validate';
import { signAccessToken, generateRefreshToken, hashToken } from '../lib/tokens';

const router = Router();

const BCRYPT_COST = 12;

// POST /auth/register
router.post('/register', validateRegisterBody, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  try {
    // Check for duplicate email
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ data: null, error: 'Email already registered.', status: 409 });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Insert new user with free tier
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, subscription_tier)
       VALUES ($1, $2, 'free')
       RETURNING id, email, subscription_tier`,
      [email, passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({ data: { id: user.id, email: user.email, subscription_tier: user.subscription_tier }, error: null, status: 201 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ data: null, error: 'Email and password are required.', status: 400 });
    return;
  }

  try {
    // Look up user by email
    const result = await pool.query(
      'SELECT id, email, password_hash, subscription_tier FROM users WHERE email = $1',
      [email]
    );

    if (!result.rowCount || result.rowCount === 0) {
      res.status(401).json({ data: null, error: 'Invalid credentials', status: 401 });
      return;
    }

    const user = result.rows[0];

    // Compare password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ data: null, error: 'Invalid credentials', status: 401 });
      return;
    }

    // Issue access token
    const accessToken = signAccessToken({ sub: user.id, email: user.email, tier: user.subscription_tier });

    // Issue refresh token
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES ($1, $2, $3, false)',
      [user.id, tokenHash, expiresAt]
    );

    res.status(200).json({
      data: {
        accessToken,
        refreshToken: rawRefreshToken,
        user: { id: user.id, email: user.email, subscription_tier: user.subscription_tier },
      },
      error: null,
      status: 200,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({ data: null, error: 'refreshToken is required.', status: 400 });
    return;
  }

  try {
    // Fetch all non-revoked, non-expired refresh tokens
    // NOTE: In production, store a fast-lookup prefix/ID in the token to avoid full-table scan
    const result = await pool.query(
      `SELECT id, user_id, token_hash, expires_at
       FROM refresh_tokens
       WHERE revoked = false AND expires_at > NOW()`
    );

    // Find the matching token via bcrypt comparison
    let matchedRow: { id: string; user_id: string; expires_at: Date } | null = null;
    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
      if (isMatch) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      res.status(401).json({ data: null, error: 'Invalid or expired refresh token', status: 401 });
      return;
    }

    // Look up the user
    const userResult = await pool.query(
      'SELECT id, email, subscription_tier FROM users WHERE id = $1',
      [matchedRow.user_id]
    );

    if (!userResult.rowCount || userResult.rowCount === 0) {
      res.status(401).json({ data: null, error: 'Invalid or expired refresh token', status: 401 });
      return;
    }

    const user = userResult.rows[0];

    // Issue a new access token
    const accessToken = signAccessToken({ sub: user.id, email: user.email, tier: user.subscription_tier });

    res.status(200).json({ data: { accessToken }, error: null, status: 200 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({ data: null, error: 'refreshToken is required.', status: 400 });
    return;
  }

  try {
    // Fetch all non-revoked refresh tokens
    const result = await pool.query(
      `SELECT id, token_hash FROM refresh_tokens WHERE revoked = false`
    );

    // Find the matching token via bcrypt comparison
    let matchedId: string | null = null;
    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
      if (isMatch) {
        matchedId = row.id;
        break;
      }
    }

    // Revoke if found
    if (matchedId) {
      await pool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [matchedId]);
    }

    // Always return 200 to avoid token enumeration
    res.status(200).json({ data: { message: 'Logged out successfully' }, error: null, status: 200 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/google
router.post('/google', async (req: Request, res: Response) => {
  const { idToken } = req.body as { idToken?: string };

  if (!idToken) {
    res.status(400).json({ data: null, error: 'idToken is required.', status: 400 });
    return;
  }

  try {
    // Validate the Google ID token via tokeninfo endpoint
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );

    if (!tokenInfoRes.ok) {
      res.status(401).json({ data: null, error: 'Invalid Google ID token', status: 401 });
      return;
    }

    const tokenInfo = (await tokenInfoRes.json()) as { aud?: string; sub?: string; email?: string };

    // Verify audience matches our client ID
    const expectedClientId = process.env.GOOGLE_CLIENT_ID;
    if (!expectedClientId || tokenInfo.aud !== expectedClientId) {
      res.status(401).json({ data: null, error: 'Invalid Google ID token', status: 401 });
      return;
    }

    const { sub, email } = tokenInfo;
    if (!sub || !email) {
      res.status(401).json({ data: null, error: 'Invalid Google ID token', status: 401 });
      return;
    }

    // Upsert user: look up by oauth_provider + oauth_sub, or insert new
    const existing = await pool.query(
      `SELECT id, email, subscription_tier FROM users WHERE oauth_provider = 'google' AND oauth_sub = $1`,
      [sub]
    );

    let user: { id: string; email: string; subscription_tier: string };

    if (existing.rowCount && existing.rowCount > 0) {
      user = existing.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (email, oauth_provider, oauth_sub, subscription_tier, password_hash)
         VALUES ($1, 'google', $2, 'free', null)
         RETURNING id, email, subscription_tier`,
        [email, sub]
      );
      user = inserted.rows[0];
    }

    // Issue access token
    const accessToken = signAccessToken({ sub: user.id, email: user.email, tier: user.subscription_tier });

    // Issue refresh token
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES ($1, $2, $3, false)',
      [user.id, tokenHash, expiresAt]
    );

    res.status(200).json({
      data: {
        accessToken,
        refreshToken: rawRefreshToken,
        user: { id: user.id, email: user.email, subscription_tier: user.subscription_tier },
      },
      error: null,
      status: 200,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/password-reset/request
router.post('/password-reset/request', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  const successResponse = {
    data: { message: 'If that email exists, a reset link has been sent.' },
    error: null,
    status: 200,
  };

  if (!email) {
    res.status(200).json(successResponse);
    return;
  }

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (!result.rowCount || result.rowCount === 0) {
      // Avoid email enumeration — always return 200
      res.status(200).json(successResponse);
      return;
    }

    const userId: string = result.rows[0].id;

    // Generate a random 32-byte hex token
    const { randomBytes } = await import('crypto');
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_COST);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );

    console.log(`[password-reset] link: /auth/password-reset/confirm?token=${rawToken}&userId=${userId}`);

    res.status(200).json(successResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// POST /auth/password-reset/confirm
router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  const { token, userId, newPassword } = req.body as {
    token?: string;
    userId?: string;
    newPassword?: string;
  };

  if (!token || !userId || !newPassword) {
    res.status(400).json({ data: null, error: 'token, userId, and newPassword are required.', status: 400 });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ data: null, error: 'newPassword must be at least 8 characters.', status: 400 });
    return;
  }

  try {
    // Fetch all non-used, non-expired reset tokens for this user
    const result = await pool.query(
      `SELECT id, token_hash FROM password_reset_tokens
       WHERE user_id = $1 AND used = false AND expires_at > NOW()`,
      [userId]
    );

    // Find matching token via bcrypt comparison
    let matchedId: string | null = null;
    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(token, row.token_hash);
      if (isMatch) {
        matchedId = row.id;
        break;
      }
    }

    if (!matchedId) {
      res.status(400).json({ data: null, error: 'Invalid or expired reset token', status: 400 });
      return;
    }

    // Hash the new password and update the user
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

    // Mark the reset token as used
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [matchedId]);

    res.status(200).json({ data: { message: 'Password updated successfully.' }, error: null, status: 200 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
