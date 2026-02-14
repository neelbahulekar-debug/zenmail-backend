# 🖥️ ZenMail Backend

AI-powered email management backend with Gmail integration and Gemini AI replies.

## 🚀 Features

- ✉️ Gmail OAuth integration
- 📧 Fetch inbox and sent emails
- 🤖 AI-powered email replies using Gemini 2.5 Flash
- 📤 Send emails via Gmail API
- 🔐 Secure session management
- 📊 Email categorization

## 🛠️ Tech Stack

- **Node.js** + **Express**
- **PostgreSQL** (Supabase)
- **Google Gmail API**
- **Google Gemini AI**
- **express-session** for authentication

## 📦 Installation

```bash
# Install dependencies
npm install

# Create .env file (see .env.example)
cp .env.example .env

# Add your credentials to .env

# Start server
npm start
```

## 🔐 Environment Variables

```env
DATABASE_URL=your_supabase_connection_string
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=random_32_character_string
FRONTEND_URL=http://localhost:5173
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gmail/status` | Check Gmail connection status |
| GET | `/auth/google` | Start OAuth flow |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/gmail/emails` | Fetch inbox emails |
| GET | `/gmail/sent` | Fetch sent emails |
| POST | `/ai/generate-reply` | Generate AI email reply |
| POST | `/gmail/send` | Send email |
| POST | `/gmail/disconnect` | Disconnect Gmail |

## 🚀 Deployment

Deploy to Railway:
1. Connect this GitHub repo to Railway
2. Add environment variables
3. Deploy automatically

See `DEPLOYMENT.md` for detailed instructions.

## 📝 License

MIT
