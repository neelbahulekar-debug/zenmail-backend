// server.js — PRODUCTION READY VERSION

const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const cors = require('cors');
const session = require('express-session');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CORS WITH CREDENTIALS ================= */

app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://zenmail-frontend.vercel.app',
  credentials: true // CRITICAL: Allow cookies to be sent
}));

app.use(express.json());

/* ================= SESSION MANAGEMENT ================= */

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production (HTTPS)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

/* ================= DATABASE ================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(() => console.log("✅ Database connected"))
  .catch(err => console.error("❌ DB Error:", err.message));

/* ================= GOOGLE OAUTH ================= */

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/* ================= HEALTH CHECK ================= */

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'ZenMail Backend API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

/* ================= TEST ROUTE ================= */

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= CHECK GMAIL STATUS ================= */

app.get('/gmail/status', async (req, res) => {
  try {
    console.log('📧 Checking Gmail status...');
    console.log('Session ID:', req.sessionID);

    // Check if user has a connected account in session
    if (req.session.gmailEmail) {
      console.log('✅ Found in session:', req.session.gmailEmail);
      return res.json({
        connected: true,
        email: req.session.gmailEmail
      });
    }

    // Fallback: check database
    const result = await pool.query(`
      SELECT gmail_email
      FROM gmail_accounts
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (!result.rows.length) {
      console.log('❌ No Gmail account found');
      return res.json({
        connected: false
      });
    }

    const email = result.rows[0].gmail_email;
    
    // Store in session for future requests
    req.session.gmailEmail = email;
    
    console.log('✅ Found in database:', email);
    
    res.json({
      connected: true,
      email: email
    });

  } catch (err) {
    console.error('❌ Status check error:', err.message);
    res.json({
      connected: false
    });
  }
});

/* ================= START AUTH ================= */

app.get('/auth/google', (req, res) => {
  console.log('🔐 Starting Google OAuth...');
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ],
  });

  res.redirect(url);
});

/* ================= CALLBACK ================= */

app.get('/auth/google/callback', async (req, res) => {
  try {
    console.log('🔄 Processing OAuth callback...');
    
    const { code } = req.query;

    if (!code) {
      console.error('❌ No authorization code received');
      const frontendUrl = process.env.FRONTEND_URL || 'https://zenmail-frontend.vercel.app';
      return res.redirect(`${frontendUrl}?error=no_code`);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    console.log('📧 User email:', email);

    // Save into database
    await pool.query(
      `
      INSERT INTO gmail_accounts
      (gmail_email, access_token, refresh_token, token_expiry)
      VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
      ON CONFLICT (gmail_email)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expiry = EXCLUDED.token_expiry,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        email,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date || Date.now() + 3600000
      ]
    );

    // CRITICAL: Store email in session
    req.session.gmailEmail = email;
    
    console.log('✅ Gmail connected:', email);
    console.log('✅ Session saved:', req.sessionID);

    // Save session before redirecting
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'https://zenmail-frontend.vercel.app';
      res.redirect(`${frontendUrl}?success=true`);
    });

  } catch (err) {
    console.error('❌ OAuth error:', err.message);
    console.error(err.stack);
    const frontendUrl = process.env.FRONTEND_URL || 'https://zenmail-frontend.vercel.app';
    res.redirect(`${frontendUrl}?error=oauth_failed`);
  }
});

/* ================= FETCH EMAILS ================= */

app.get('/gmail/emails', async (req, res) => {
  try {
    console.log('📬 Fetching emails...');

    // Get the most recent account
    const result = await pool.query(`
      SELECT gmail_email, access_token, refresh_token
      FROM gmail_accounts
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (!result.rows.length) {
      console.log('❌ No account connected');
      return res.json({ 
        success: false, 
        message: "No account connected" 
      });
    }

    const { gmail_email, access_token, refresh_token } = result.rows[0];
    
    console.log('📧 Fetching for:', gmail_email);

    // Set credentials
    oauth2Client.setCredentials({
      access_token,
      refresh_token
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    // Fetch message list
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 20
    });

    const messages = list.data.messages || [];
    
    console.log(`📨 Found ${messages.length} messages`);

    const emails = [];

    // Fetch details for each message
    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const headers = full.data.payload.headers;

        const subject =
          headers.find(h => h.name === 'Subject')?.value || "(No Subject)";

        const from =
          headers.find(h => h.name === 'From')?.value || "Unknown";

        // Extract body - handle different formats
        let body = '';
        
        if (full.data.payload.body.data) {
          body = Buffer.from(full.data.payload.body.data, 'base64').toString('utf-8');
        } else if (full.data.payload.parts) {
          const textPart = full.data.payload.parts.find(
            part => part.mimeType === 'text/plain'
          );
          if (textPart && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        // Clean and truncate body
        body = body
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ')     // Normalize whitespace
          .trim()
          .substring(0, 500);       // Limit length

        emails.push({
          id: msg.id,
          subject,
          from,
          body
        });

      } catch (msgErr) {
        console.error(`❌ Error fetching message ${msg.id}:`, msgErr.message);
        // Continue with other messages
      }
    }

    console.log(`✅ Successfully processed ${emails.length} emails`);

    res.json({
      success: true,
      emails
    });

  } catch (err) {
    console.error('❌ Fetch error:', err.message);
    console.error(err.stack);

    res.json({
      success: false,
      message: err.message
    });
  }
});

/* ================= FETCH SENT EMAILS ================= */

app.get('/gmail/sent', async (req, res) => {
  try {
    console.log('📤 Fetching sent emails...');

    // Get the most recent account
    const result = await pool.query(`
      SELECT gmail_email, access_token, refresh_token
      FROM gmail_accounts
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (!result.rows.length) {
      console.log('❌ No account connected');
      return res.json({ 
        success: false, 
        message: "No account connected" 
      });
    }

    const { gmail_email, access_token, refresh_token } = result.rows[0];
    
    console.log('📧 Fetching sent emails for:', gmail_email);

    // Set credentials
    oauth2Client.setCredentials({
      access_token,
      refresh_token
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    // Fetch sent messages
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['SENT'],
      maxResults: 20
    });

    const messages = list.data.messages || [];
    
    console.log(`📨 Found ${messages.length} sent messages`);

    const emails = [];

    // Fetch details for each message
    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const headers = full.data.payload.headers;

        const subject =
          headers.find(h => h.name === 'Subject')?.value || "(No Subject)";

        const to =
          headers.find(h => h.name === 'To')?.value || "Unknown";

        // Extract body
        let body = '';
        
        if (full.data.payload.body.data) {
          body = Buffer.from(full.data.payload.body.data, 'base64').toString('utf-8');
        } else if (full.data.payload.parts) {
          const textPart = full.data.payload.parts.find(
            part => part.mimeType === 'text/plain'
          );
          if (textPart && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        // Clean and truncate body
        body = body
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500);

        emails.push({
          id: msg.id,
          subject,
          from: `To: ${to}`, // Show recipient instead of sender
          body
        });

      } catch (msgErr) {
        console.error(`❌ Error fetching sent message ${msg.id}:`, msgErr.message);
      }
    }

    console.log(`✅ Successfully processed ${emails.length} sent emails`);

    res.json({
      success: true,
      emails
    });

  } catch (err) {
    console.error('❌ Fetch sent emails error:', err.message);
    console.error(err.stack);

    res.json({
      success: false,
      message: err.message
    });
  }
});

/* ================= GENERATE AI REPLY ================= */

app.post('/ai/generate-reply', async (req, res) => {
  try {
    console.log('🤖 Generating AI reply with Gemini...');

    const { from, subject, body } = req.body;

    if (!from || !subject || !body) {
      return res.json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not configured');
      return res.json({
        success: false,
        message: 'AI service not configured. Please add GEMINI_API_KEY to .env'
      });
    }

    const prompt = `Generate a professional, friendly reply to this email. Keep it concise and appropriate.

Email From: ${from}
Subject: ${subject}
Body: ${body}

Generate only the reply text, no additional formatting or explanations.`;

    // Using Gemini 2.5 Flash (latest model)
    const API_VERSION = "v1beta";
    const MODEL_NAME = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    console.log(`📤 Sending request to Gemini 2.5 Flash...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      })
    });

    const data = await response.json();
    
    console.log('📥 Gemini API response status:', response.status);
    
    if (!response.ok) {
      console.error(`❌ API Error (${response.status}):`, data.error?.message || 'Unknown Error');
      
      return res.json({
        success: false,
        message: `Gemini API error: ${data.error?.message || 'Unknown error'}`
      });
    }
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const reply = data.candidates[0].content.parts[0].text;
      console.log('✅ AI reply generated successfully with Gemini 2.5 Flash');
      res.json({
        success: true,
        reply: reply.trim()
      });
    } else {
      console.error('❌ Unexpected response format or safety filters blocked the response');
      console.error('Response:', JSON.stringify(data, null, 2));
      res.json({
        success: false,
        message: 'Unexpected response format. Safety filters may have blocked the response.'
      });
    }

  } catch (err) {
    console.error('❌ AI generation error:', err.message);
    console.error(err.stack);
    res.json({
      success: false,
      message: `Error: ${err.message}`
    });
  }
});

/* ================= SEND EMAIL ================= */

app.post('/gmail/send', async (req, res) => {
  try {
    console.log('📤 Sending email...');

    const { to, subject, body, threadId } = req.body;

    if (!to || !subject || !body) {
      return res.json({
        success: false,
        message: 'Missing required fields: to, subject, body'
      });
    }

    // Get the most recent account
    const result = await pool.query(`
      SELECT gmail_email, access_token, refresh_token
      FROM gmail_accounts
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (!result.rows.length) {
      console.log('❌ No account connected');
      return res.json({
        success: false,
        message: 'No account connected'
      });
    }

    const { gmail_email, access_token, refresh_token } = result.rows[0];
    
    console.log('📧 Sending from:', gmail_email);

    // Set credentials
    oauth2Client.setCredentials({
      access_token,
      refresh_token
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    // Create email message in RFC 2822 format
    const emailLines = [
      `From: ${gmail_email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body
    ];

    const email = emailLines.join('\r\n');
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send the email
    const sendResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: threadId || undefined
      }
    });

    console.log('✅ Email sent successfully:', sendResult.data.id);

    res.json({
      success: true,
      messageId: sendResult.data.id
    });

  } catch (err) {
    console.error('❌ Send error:', err.message);
    console.error(err.stack);

    res.json({
      success: false,
      message: err.message
    });
  }
});

/* ================= DISCONNECT GMAIL ================= */

app.post('/gmail/disconnect', async (req, res) => {
  try {
    console.log('🚪 Disconnecting Gmail...');
    
    // Get email from session
    const email = req.session.gmailEmail;
    
    // Delete from database
    if (email) {
      await pool.query(
        'DELETE FROM gmail_accounts WHERE gmail_email = $1',
        [email]
      );
      console.log('✅ Deleted from database:', email);
    }
    
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Session destroy error:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to destroy session'
        });
      }
      
      console.log('✅ Session destroyed');
      
      res.json({
        success: true,
        message: 'Disconnected successfully'
      });
    });
    
  } catch (err) {
    console.error('❌ Disconnect error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log('\n🚀 ZenMail Backend Running');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📍 Frontend: ${process.env.FRONTEND_URL || 'https://zenmail-frontend.vercel.app'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});