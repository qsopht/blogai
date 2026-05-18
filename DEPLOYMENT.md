# Railway Deployment Guide

## Overview

This application has been updated for Railway deployment with MySQL. The key change is that **table creation is removed** - all tables must exist before the application starts.

## Changes Made

### 1. Database Configuration (`server.js`)
- ✅ Added support for Railway's `DATABASE_URL` environment variable
- ✅ Automatically parses `mysql://user:password@host:port/database` format
- ✅ Falls back to individual `DB_*` variables for local development
- ❌ Removed `CREATE TABLE IF NOT EXISTS` statements
- ❌ Removed `ALTER TABLE` statements for adding columns

### 2. Database Schema
- Created `migrations/001_init_schema.sql` with complete table definitions
- Includes default prompt version insertion

### 3. Docker Support
- Added `Dockerfile` for containerized deployment
- Added `.dockerignore` to optimize image size

### 4. Configuration Files
- Updated `.env.example` with Railway DATABASE_URL format
- Created `railway.json` for Railway deployment settings
- Updated `README.md` with Railway deployment instructions

## Deployment Checklist

### Before Deploying to Railway

- [ ] Push code to GitHub repository
- [ ] Have your LLM API credentials ready (API key, endpoint, model)

### Railway Setup Steps

1. **Create Railway Account**
   - Visit [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project" → "Deploy from GitHub"
   - Select your repository

3. **Add MySQL Service**
   - Click "+ Add Service"
   - Select "MySQL"
   - Wait for provisioning

4. **Initialize Database**
   - Get MySQL credentials from Railway dashboard
   - Run the migration SQL:
     ```bash
     # Using Railway CLI
     railway run mysql -u $MYSQLUSER -p$MYSQLPASSWORD -h $MYSQLHOST -D $MYSQLDATABASE < migrations/001_init_schema.sql
     ```

5. **Configure Environment Variables**
   - In Railway dashboard, go to Node.js service → Variables
   - Add these variables:
     ```
     LLM_PROVIDER=anthropic
     LLM_API_KEY=<your_api_key>
     LLM_ENDPOINT=<your_endpoint>
     LLM_MODEL=claude-haiku-4-5
     PORT=3000
     AUTO_GENERATE_BLOGS=false
     ```

6. **Deploy**
   - Push to GitHub or click "Deploy"
   - Railway automatically deploys on push

## Troubleshooting

### "blogs table does not exist" Error
- The migration SQL hasn't been run
- Connect to MySQL and execute `migrations/001_init_schema.sql`

### "prompt_versions table does not exist" Error
- Same as above - run the migration

### DATABASE_URL not found
- Make sure MySQL service is running in Railway
- Check that it's linked to the Node.js service

### Connection refused
- Verify DATABASE_URL is correct
- Check MySQL service status in Railway dashboard

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes (Railway) | MySQL connection string | `mysql://user:pass@host:3306/db` |
| `DB_HOST` | No | Host (if not using DATABASE_URL) | `localhost` |
| `DB_USER` | No | Username (if not using DATABASE_URL) | `root` |
| `DB_PASSWORD` | No | Password (if not using DATABASE_URL) | - |
| `DB_NAME` | No | Database (if not using DATABASE_URL) | `blogai` |
| `DB_PORT` | No | Port (if not using DATABASE_URL) | `3306` |
| `LLM_PROVIDER` | Yes | LLM provider | `anthropic` |
| `LLM_API_KEY` | Yes | API key | - |
| `LLM_ENDPOINT` | Yes | API endpoint | - |
| `LLM_MODEL` | No | Model name | `claude-haiku-4-5` |
| `PORT` | No | Server port (set by Railway) | `3000` |
| `AUTO_GENERATE_BLOGS` | No | Enable auto-generation | `false` |

## Local Development with Railway Database

To test with Railway's database locally:

1. Get your Railway MySQL credentials
2. Create `.env` with `DATABASE_URL`:
   ```
   DATABASE_URL=mysql://user:password@your-railway-host:3306/database_name
   LLM_PROVIDER=anthropic
   LLM_API_KEY=your_key
   LLM_ENDPOINT=your_endpoint
   LLM_MODEL=claude-haiku-4-5
   ```
3. Run `npm start`

## Support

- Railway Docs: https://docs.railway.app
- MySQL Reference: https://dev.mysql.com/doc
- Node.js with Express: https://expressjs.com
