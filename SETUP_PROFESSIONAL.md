# Kadrio - Professional Setup & Production Deployment

## 🚀 Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env

# 3. Start development server
npm start

# Server runs on http://localhost:3000
```

---

## 🔐 Production Setup (Critical)

### 1. **Generate Secure Tokens**

```powershell
# In PowerShell:
$adminToken = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$sessionSecret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

Write-Host "ADMIN_TOKEN=$adminToken"
Write-Host "SESSION_SECRET=$sessionSecret"
```

**⚠️ CRITICAL:**
- `ADMIN_TOKEN` and `SESSION_SECRET` must be **different**
- Both must be **at least 32 characters**
- Store them in your deployment platform's **secret manager** (Railway, Render, GitHub Secrets)
- **Never** commit them to version control

### 2. **Environment Configuration**

Create `.env` from `.env.example` and set:

```env
# Production must-haves
NODE_ENV=production
PORT=3000
ADMIN_TOKEN=<your_generated_admin_token>
SESSION_SECRET=<your_generated_session_secret>

# Security
CORS_ORIGIN=https://kadrio.co
LOG_LEVEL=WARN

# Database (will be created automatically)
DB_PATH=./database/reeloram.db
UPLOAD_DIR=./uploads
```

### 3. **Database Setup**

The database is created automatically on first run. Schemas include:
- Users (with bcrypt password hashing)
- Reels (video content)
- Notifications
- Comments & Likes
- Admin reports
- Package requests
- Creator applications
- Analytics

### 4. **File Storage**

**Local Development:**
```
uploads/  ← Video files stored here
database/ ← SQLite database
logs/     ← Application logs
```

**Production (Recommended):**
```
Railway/Render: Use persistent volumes
- Map /uploads to persistent storage
- Map /database to persistent storage
- Map /logs to persistent storage
```

### 5. **Deploy to Railway**

```bash
# 1. Push code to GitHub
git push origin main

# 2. In Railway Dashboard:
# - Connect GitHub repository
# - Set environment variables (ADMIN_TOKEN, SESSION_SECRET, etc.)
# - Deploy

# 3. Configure domain
# - Add custom domain in Railway settings
# - Point Cloudflare DNS to Railway endpoint
```

### 6. **Deploy to Render**

```yaml
# render.yaml (already configured)
services:
  - type: web
    name: kadrio
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: ADMIN_TOKEN
        sync: false  # Store in Render secrets
      - key: SESSION_SECRET
        sync: false  # Store in Render secrets
```

---

## 🏗️ Architecture

### Directory Structure
```
kadrio/
├── lib/                    # Professional utilities
│   ├── logger.js          # Structured logging
│   ├── validator.js       # Input validation
│   ├── errorHandler.js    # Error management
│   └── config.js          # Environment config
├── server.js              # Production server
├── app.js                 # Frontend logic
├── index.html             # Main page
├── style.css              # Styling
├── package.json           # Dependencies
├── .env.example           # Config template
├── database/              # SQLite DB
├── uploads/               # User videos
├── logs/                  # Application logs
└── README.md              # Documentation
```

### Technology Stack
- **Backend:** Express.js + Node.js
- **Database:** SQLite (development), PostgreSQL (future)
- **Video Upload:** Multer with validation
- **Authentication:** HMAC-SHA256 session tokens
- **Password Hashing:** crypto.scrypt
- **Payment:** Shopier integration
- **Hosting:** Railway / Render

---

## 📊 Logging & Monitoring

### Log Files
Logs are stored in `./logs/` directory:
```
ERROR-2026-08-31.log   # Error level
WARN-2026-08-31.log    # Warning level
INFO-2026-08-31.log    # Info level
DEBUG-2026-08-31.log   # Debug level
```

### Log Levels (Production → Development)
```
PRODUCTION:  LOG_LEVEL=WARN   (minimal logs)
STAGING:     LOG_LEVEL=INFO   (standard logs)
DEVELOPMENT: LOG_LEVEL=DEBUG  (verbose logs)
```

### Health Check
```bash
curl http://localhost:3000/health
# Returns: { status: 'ok', database: 'ok', uptime: 123.45 }
```

### Admin Monitoring
```
GET /admin/analytics        # Recent analytics
GET /admin/reels            # Moderation queue
GET /admin/reports          # User reports
GET /admin/packages         # Sponsor requests
GET /admin/creators         # Creator applications
```

**Authentication:** Send header:
```
X-Admin-Token: <your_ADMIN_TOKEN>
```

---

## 🔒 Security Features

### Built-in Protections
✅ **Password Security**
- scrypt key derivation (64 iterations)
- Constant-time comparison

✅ **Session Security**
- HMAC-SHA256 signed tokens
- 7-day expiration
- Bearer token auth

✅ **Request Protection**
- Rate limiting (120 req/min global)
- 10 req/min for login/register
- 20 req/min for public writes

✅ **Content Moderation**
- Blocked term filtering (weapons, violence, explicit)
- HTTPS-only video URLs
- File upload validation

✅ **HTTP Security Headers**
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- Strict-Transport-Security
- CSP headers ready

### Production Checklist
- [ ] Set strong ADMIN_TOKEN
- [ ] Set different SESSION_SECRET
- [ ] Enable HTTPS (automatic with Railway/Render)
- [ ] Set LOG_LEVEL=WARN
- [ ] Configure CORS_ORIGIN to your domain
- [ ] Set up persistent storage backups
- [ ] Enable database backups
- [ ] Monitor error logs
- [ ] Set up alerts for 500 errors

---

## 🐛 Error Handling

### Standardized Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": { "field": "email" }
  },
  "timestamp": "2026-08-31T12:34:56.789Z"
}
```

### Error Codes
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## 📝 Input Validation

All API endpoints now validate inputs:

```javascript
// Examples
validators.email(email)           // ✓ RFC 5322
validators.password(pwd)          // ✓ Min 6 chars
validators.username(user)         // ✓ 3-30 chars, alphanumeric+._-
validators.string(text, opts)     // ✓ Length constraints
validators.url(url)               // ✓ HTTPS validation
validators.positiveInteger(num)   // ✓ Type & range
```

---

## 🚦 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/*` | 120 | 1 min |
| `/api/user/login` | 10 | 1 min |
| `/api/user/register` | 10 | 1 min |
| `/api/track` | 20 | 1 min |

Response when rate limited:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Çok fazla istek. Lütfen biraz bekleyin."
  }
}
```

---

## 🔄 Migration from Old Server

### Backup Data
```bash
# Backup database
cp database/reeloram.db database/reeloram.db.backup

# Backup uploads
cp -r uploads uploads.backup
```

### Test New Server
```bash
# Keep old server running
# Start new server on different port
PORT=3001 node server.js

# Test endpoints
curl http://localhost:3001/health
```

### Switch Over (Zero-Downtime)
```bash
# 1. Update .env with production secrets
# 2. Run migrations (if needed)
# 3. Update package.json start script
# 4. Deploy with Railway/Render (automatic rollback available)
```

---

## 🛠️ Troubleshooting

### Application won't start
```bash
# Check environment variables
echo $NODE_ENV $ADMIN_TOKEN $SESSION_SECRET

# Check database
sqlite3 database/reeloram.db "SELECT COUNT(*) FROM users;"

# Check logs
tail -f logs/ERROR-*.log
```

### High memory usage
```bash
# Check for memory leaks in logs
grep -i "memory" logs/ERROR-*.log

# Restart application
kill -SIGTERM <pid>
# Railway/Render handles restart automatically
```

### Database locked
```bash
# Close all connections
pkill -f "node server"

# Verify database integrity
sqlite3 database/reeloram.db "PRAGMA integrity_check;"

# Restart
npm start
```

---

## 📞 Support & Monitoring

### Key Metrics to Monitor
- Database response time
- API response time  
- Error rate (should be <1%)
- Active users
- Storage usage

### Alerts to Set Up
```
- 5xx errors > 5/min
- Database unavailable
- Disk space < 10%
- Memory > 80%
- Response time > 5s
```

---

## 🎯 Next Steps

1. ✅ Use `server.js` as the single production entrypoint
2. ✅ Update deployment environment variables
3. ✅ Test all API endpoints
4. ✅ Set up logging aggregation (Datadog, New Relic)
5. ✅ Configure uptime monitoring
6. ✅ Set up backup strategy

---

**Version:** 2.0.0 (Professional Edition)  
**Last Updated:** 2026-08-31  
**Status:** Production Ready ✅
