# AuthGate - Secure User Authentication System

AuthGate is a full-stack project built for **Prodigy Infotech Full Stack Development Task 01**. It implements secure registration, login, HTTP-only session management, protected routes, and simple role-based access control.

## Features

- User registration and login
- Password hashing with Node.js `crypto.scrypt`
- Server-side sessions stored as hashed tokens
- HTTP-only, SameSite session cookies
- Protected dashboard route
- Admin-only user management route
- First registered account becomes `admin`; later accounts become `user`
- Rate limiting on authentication endpoints
- Clean responsive frontend served by Express

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- Security: HTTP-only cookies, scrypt password hashing, custom security headers, auth rate limiting
- Storage: Local JSON database for an easy internship/demo setup
- Dependencies: none

## Getting Started

```bash
node server/index.js
```

Open:

```text
http://localhost:5000
```

Optional environment setup:

```powershell
Copy-Item .env.example .env
```

If you have npm installed, these scripts are also available:

```bash
npm start
npm test
```

## Demo Flow

1. Register the first account. It will automatically receive the `admin` role.
2. Log out and register another account. It will receive the `user` role.
3. Log in as the admin account to view both the protected dashboard and admin user table.
4. Log in as a normal user to confirm the admin route is blocked.

## API Routes

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Creates an account and starts a session |
| `POST` | `/api/auth/login` | Public | Verifies credentials and starts a session |
| `POST` | `/api/auth/logout` | Authenticated | Ends the current session |
| `GET` | `/api/auth/me` | Authenticated | Returns the current signed-in user |
| `GET` | `/api/dashboard` | Authenticated | Protected dashboard data |
| `GET` | `/api/admin/users` | Admin only | Lists registered users without password hashes |

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── data/
│   ├── lib/
│   ├── middleware/
│   ├── routes/
│   ├── config.js
│   └── index.js
├── test/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Security Notes

This project uses secure concepts expected in the task: passwords are never stored directly, session tokens are stored hashed, cookies are HTTP-only, and protected routes are checked on the server. The JSON database keeps the project easy to run locally; for production, replace it with PostgreSQL, MySQL, or MongoDB.

## GitHub Upload

```bash
git init
git add .
git commit -m "Build secure authentication system"
git branch -M main
git remote add origin https://github.com/<your-username>/secure-authentication-system.git
git push -u origin main
```
