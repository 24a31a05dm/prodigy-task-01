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
