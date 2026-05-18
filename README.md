# BlogAI - AI-Powered Blog Generator

A web application that generates blog posts using LLMs and stores them in a MySQL database. Perfect for hosting on Railway.app.

## Features

- 🤖 Generate blog posts on any topic using AI (LLM)
- 💾 Store blog posts in MySQL database
- 📱 Responsive web interface
- ⚡ Built with Express.js and Bootstrap
- 🚀 Production-ready for Railway.app deployment

## Prerequisites

- Node.js 16+
- MySQL 5.7+ or MySQL 8.0+
- npm

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server
PORT=3000

# LLM Configuration
LLM_PROVIDER=anthropic
LLM_API_KEY=your_anthropic_api_key_here
LLM_ENDPOINT=https://api.anthropic.com/v1/messages
LLM_MODEL=claude-haiku-4-5

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=blogai
DB_PORT=3306
```

### 3. Create MySQL database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE blogai;
```

### 4. Start the server

```bash
npm start
```

Visit `http://localhost:3000` in your browser.

## Deployment to Railway.app

Railway is the recommended deployment platform for this application. The application now supports Railway's MySQL service with automatic DATABASE_URL parsing.

### Quick Deploy to Railway

1. **Click the Railway Deploy button** (if available in your repo) or:

2. **Manual deployment:**
   - Sign up at [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub"
   - Select your repository
   - Railway will automatically detect Node.js

### Database Setup on Railway

#### Step 1: Add MySQL Service

1. In your Railway project, click "+ Add Service"
2. Select "MySQL" and confirm
3. Railway automatically creates a database and provides connection credentials

#### Step 2: Initialize Database Schema

After MySQL is provisioned, you need to run the schema migration:

**Option A: Using Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Connect to your project
railway link

# Run the migration
railway run mysql -u $MYSQLUSER -p$MYSQLPASSWORD -h $MYSQLHOST -D $MYSQLDATABASE < migrations/001_init_schema.sql
```

**Option B: Using MySQL Workbench or DBeaver**
1. Get your database credentials from Railway dashboard
2. Connect using a MySQL client
3. Open [migrations/001_init_schema.sql](migrations/001_init_schema.sql)
4. Execute the SQL script

**Option C: Using Railway Shell**
1. Go to Railway dashboard
2. Select your MySQL service
3. Click "Shell" tab
4. Copy and paste the SQL from [migrations/001_init_schema.sql](migrations/001_init_schema.sql)

#### Step 3: Environment Variables

Your Node.js service on Railway needs these environment variables:

| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | Auto-set by Railway | `mysql://user:pass@host:3306/db` |
| `LLM_PROVIDER` | Set manually | `anthropic` |
| `LLM_API_KEY` | Set manually | Your API key |
| `LLM_ENDPOINT` | Set manually | Your LLM endpoint |
| `LLM_MODEL` | Set manually | `claude-haiku-4-5` |
| `PORT` | Auto-set by Railway | `3000` |

**In Railway Dashboard:**
1. Go to your Node.js service → Variables
2. Add the LLM configuration variables
3. `DATABASE_URL` is automatically provided by the MySQL service

### Important Notes

- The application **no longer creates tables automatically** - you must run the migration first
- `DATABASE_URL` takes precedence over individual `DB_*` variables
- All tables are verified on startup; deployment will fail if they don't exist

### Local Development Setup (for comparison)

If you want to test locally with Railway-like setup:

## API Endpoints

### GET /api/blogs
List all blog posts (ordered by newest first)

**Response:**
```json
[
  {
    "id": 1,
    "title": "Blog Title",
    "created_at": "2026-05-06T10:30:00Z"
  }
]
```

### GET /api/blogs/:id
Get a single blog post

**Response:**
```json
{
  "id": 1,
  "title": "Blog Title",
  "content": "Full blog post content...",
  "created_at": "2026-05-06T10:30:00Z",
  "updated_at": "2026-05-06T10:30:00Z"
}
```

### POST /api/blogs
Create a new blog post (generates with LLM)

**Request:**
```json
{
  "topic": "The future of AI"
}
```

**Response:**
```json
{
  "id": 1,
  "title": "Generated Title",
  "content": "Generated content...",
  "created_at": "2026-05-06T10:30:00Z"
}
```

### DELETE /api/blogs/:id
Delete a blog post

**Response:**
```json
{
  "message": "Blog deleted successfully"
}
```

## How It Works

1. **Topic Submission**: User enters a blog topic in the web interface
2. **LLM Generation**: The server sends the topic to the configured LLM service
3. **Blog Creation**: The LLM generates a blog title and content
4. **Database Storage**: The blog is saved to the MySQL database
5. **Display**: Users can view, list, and delete blog posts

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `LLM_PROVIDER` | LLM service provider | `anthropic` |
| `LLM_API_KEY` | API key for LLM service | `sk_...` |
| `LLM_ENDPOINT` | LLM API endpoint | `https://api.anthropic.com/v1/messages` |
| `LLM_MODEL` | Model name to use | `claude-haiku-4-5` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_USER` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | `password` |
| `DB_NAME` | Database name | `blogai` |
| `DB_PORT` | MySQL port | `3306` |

## Supported LLM Providers

- **Anthropic** (Default)
- **OpenAI** / ChatGPT
- Any provider compatible with the configured endpoint

## Troubleshooting

### Database connection errors
- Ensure MySQL is running
- Check credentials in `.env`
- Verify database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### LLM API errors
- Verify API key is correct and valid
- Check API endpoint is reachable
- Ensure account has sufficient credits

### Port already in use
- Change `PORT` in `.env`
- Or kill existing process: `lsof -i :3000` → `kill -9 <PID>`

## License

ISC
