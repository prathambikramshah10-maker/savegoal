# SaveGoal - Savings Money Management Website

A complete, modern, responsive savings tracking platform that helps users create savings goals and track their progress. Built as a fully-functional premium product — not a demo.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js + Express.js
- **Database:** MongoDB
- **Authentication:** JWT + Email OTP (One-Time Password) verification via Gmail SMTP
- **Design:** Luxury Obsidian Black + Champagne Gold + Ivory theme

## Features

- **Secure registration/login** — login is protected by a real email OTP sent to the user's inbox
- **Savings goals** with target amount, deadline, and progress tracking
- **Goal locking** — lock a goal to prevent deposits/withdrawals
- **Withdrawal rules** — withdraw funds with OTP approval (only confirmed deposits count)
- **Pending → confirmed savings** — money is only reflected in "Total Saved" after you confirm the deposit with an emailed code
- **Dashboard** with savings statistics, monthly progress chart, and at-risk goals
- **Transaction history** with deposit/withdrawal status, search, and CSV export
- **User profile** with settings, password change, and account deletion
- **Protected admin panel** (admins can manage users, with user/goal/transaction CSV export)
- **MongoDB** persistence + **secure Node.js backend**
- **Responsive** mobile/desktop design + dark/light theme
- Password reset via emailed OTP, weekly savings-reminder emails, savings streaks, and contact form
- Category icons, celebration animation on goal completion

---

## Prerequisites

### 1. Install Node.js

Download and install Node.js from [https://nodejs.org](https://nodejs.org). Choose the **LTS** version. This also installs npm.

Verify installation:
```bash
node -v
npm -v
```

### 2. Install MongoDB

**Option A - Local MongoDB:**
Download from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)

**Option B - MongoDB Atlas (Cloud - Free):**
1. Go to [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a free cluster
4. Get your connection string from the cluster dashboard

### 3. Install VS Code Extensions (Optional)

- "REST Client" extension for testing API endpoints

---

## Setup Instructions

### Step 1: Clone or Download the Project

Open VS Code terminal and navigate to the project folder:
```bash
cd SaveGoal
```

### Step 2: Configure Environment Variables

1. Navigate to the backend folder:
```bash
cd backend
```

2. Copy the example env file:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS/Linux
cp .env.example .env
```

3. Edit the `.env` file with your settings:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/savegoal
JWT_SECRET=your-super-secret-key-change-this-to-any-random-string
JWT_EXPIRE=7d
NODE_ENV=development
```

### Step 3: Configure Gmail for OTP Verification (REQUIRED for real emails)

SaveGoal sends a one-time verification code to the user's email during registration and login. To enable real emails:

1. Go to your Google Account → Security → enable **2-Step Verification**
2. Go to https://myaccount.google.com/apppasswords
3. Select **Mail** as the app → generate a 16-character **App Password**
4. Add these to your `backend/.env`:
```
GMAIL_USER=yourname@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```

> **No Gmail configured?** The app still works for local testing — when `NODE_ENV` is not `production`, the OTP code is shown in the verification form response instead of being emailed, so you can see it there and enter it.

### Step 4: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 5: Start the Backend Server

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

The server will start on `http://localhost:5000`. On first start it creates a default **admin account** using the credentials in `.env` under `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Change the password in production.**

### Step 6: Start the Frontend

Open a **new terminal** and navigate to the frontend folder:
```bash
cd frontend
```

**Option A - Using VS Code Live Server (Recommended):**
1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

**Option B - Using Python:**
```bash
# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

**Option C - Using Node.js:**
```bash
npx serve .
```

The frontend will be available at `http://localhost:3000` (or the port shown).

---

## Testing the Application

### Test 1: Registration
1. Open the frontend in your browser
2. Click "Start Saving" or navigate to the Register page
3. Fill in the form:
   - Full Name: PrathamDada
   - Email: john@example.com
   - Phone: 9841234567
   - Password: password123
   - Confirm Password: password123
4. Click "Create Account"
5. The account is created instantly and you are logged in. **No OTP is required at registration** — the email is verified the first time you log in.

### Test 2: Login (with OTP)
1. Log out if logged in
2. Navigate to the Login page
3. Enter your email and password
4. Click "Sign In"
5. A 6-digit verification code is sent to your email
6. Enter the code and click "Verify & Sign In"
7. You will be redirected to the Dashboard (or Admin panel if you're an admin)

### Test 3: Create a Savings Goal
1. On the Dashboard, click "Create Goal" or "New Goal"
2. Fill in the form:
   - Goal Name: New Laptop
   - Target Amount: 100000
   - Starting Amount: 10000
   - Target Date: (select a future date)
   - Category: Laptop
   - Description: Saving for a new MacBook
3. Click "Create Goal"
4. The goal appears on your Dashboard; the starting amount is pending until confirmed

### Test 4: Add & Confirm Savings
1. Click on a goal card to open Goal Details
2. Click "Add Savings"
3. Enter an amount (e.g., 5000) and a note
4. Enter the confirmation code sent to your email and click "Add & Confirm Savings"
5. The progress bar and totals update only after confirmation

> **Important:** Savings only count toward "Total Saved" after you confirm the deposit with the emailed code. Pending deposits are shown with a ⏳ indicator and a "Confirm" button.

### Test 5: Withdraw Savings
1. Open a goal with confirmed savings
2. Click "Withdraw"
3. Enter an amount (cannot exceed your confirmed balance) and the email confirmation code
4. Click "Withdraw Funds" — the withdrawal is recorded and subtracted from the total

### Test 6: Goal Locking
1. Edit a goal and tick "Lock this goal"
2. Locked goals cannot accept new deposits or withdrawals until unlocked

### Test 7: Goal Completion
1. Keep adding savings until the amount reaches the target
2. A celebration animation appears
3. The goal status changes to "completed"

### Test 8: Admin Panel
1. Log in with the admin account (see `backend/.env`: `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
2. You will be taken to the Admin Panel (or click "Admin" in the nav)
3. View platform stats (users, goals, transactions) and manage/delete users

### Test 9: Profile Management
1. Click your name/avatar in the navigation
2. Select "Profile" or "Settings"
3. Update your name or phone, or change your password
4. Click "Save Changes"

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account and issue JWT |
| POST | `/api/auth/login` | Step 1: validate credentials; returns `status:"otp"` and issues a one-time login OTP |
| POST | `/api/auth/otp/verify` | Step 2: verify login OTP and complete authentication |
| POST | `/api/auth/otp/send` | Resend a login/recovery code (cooldown/rate-limited) |
| POST | `/api/auth/forgot-password` | Step 1: request a password-reset code (OTP emailed) |
| POST | `/api/auth/reset-password` | Step 2: verify code and set a new password |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/me` | Update profile/password |
| DELETE | `/api/auth/me` | Delete account |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/goals` | Get all user goals |
| POST | `/api/goals` | Create a new goal |
| GET | `/api/goals/stats` | Get dashboard statistics |
| GET | `/api/goals/:id` | Get a specific goal |
| PUT | `/api/goals/:id` | Update a goal (incl. lock) |
| DELETE | `/api/goals/:id` | Delete a goal |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/goals/:id/savings` | Add savings (creates pending deposit, OTP-confirmed) |
| POST | `/api/goals/:id/savings/:txId/confirm` | Confirm a deposit with OTP |
| POST | `/api/goals/:id/withdraw` | Withdraw funds (OTP approved) |
| GET | `/api/goals/:id/transactions` | Get goal transactions (search + status filter) |
| GET | `/api/goals/:id/export` | Export goal transactions as CSV |
| GET | `/api/goals/export-all` | Export all user transactions as CSV |

### Admin (admin role required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/overview` | Platform statistics |
| GET | `/api/admin/users/summary` | List all users with summary stats |
| GET | `/api/admin/users/:id` | Get a user with their goals |
| DELETE | `/api/admin/users/:id` | Delete a user and their data |
| GET | `/api/admin/export` | Export all users as CSV |

### Contact
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contact` | Submit the contact form (emails the admin) |

---

## Project Structure

```
SaveGoal/
├── frontend/
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── register.html       # Registration page
│   ├── forgot-password.html# Password reset page
│   ├── dashboard.html      # User dashboard
│   ├── goal.html           # Goal details page
│   ├── profile.html        # Profile/settings page
│   ├── admin.html          # Admin panel
│   ├── contact.html        # Contact page
│   ├── terms.html          # Terms of Service
│   ├── 404.html            # Not found page
│   ├── css/
│   │   └── style.css       # All styles
│   └── js/
│       ├── utils.js        # Utility functions + nav/theme
│       ├── auth.js         # Authentication logic
│       ├── dashboard.js    # Dashboard logic
│       ├── goal.js         # Goal details logic
│       ├── admin.js        # Admin panel logic
│       └── profile.js      # Profile logic
│
├── backend/
│   ├── server.js           # Express server entry point
│   ├── package.json        # Dependencies
│   ├── .env.example        # Environment variables template
│   ├── models/
│   │   ├── User.js         # User model
│   │   ├── SavingsGoal.js  # Savings goal model
│   │   ├── SavingsTransaction.js  # Transaction model
│   │   └── Otp.js          # One-time password model
│   ├── routes/
│   │   ├── auth.js         # Auth routes
│   │   ├── goals.js        # Goal routes
│   │   ├── transactions.js # Transaction routes
│   │   ├── admin.js        # Admin routes
│   │   └── contact.js      # Contact form route
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication middleware
│   │   ├── admin.js        # Admin role middleware
│   │   └── validation.js   # Input validation middleware
│   └── utils/
│       ├── mailer.js       # Nodemailer Gmail config
│       ├── otp.js          # OTP generation/verification
│       ├── goalHelper.js   # Goal amount recomputation
│       └── reminders.js    # Weekly savings reminder emails
│
└── README.md
```

---

## Security Features

- Passwords hashed with bcrypt (12 rounds)
- **Email OTP verification** for login, deposits, and withdrawals (codes stored as HMAC hashes, single-use, 5-minute expiry, attempt limit)
- JWT-based authentication for all protected routes
- Users can only access their own data (data isolation)
- Input validation on all API endpoints
- Rate limiting on all API routes and stricter limits on auth/OTP/contact endpoints
- CORS restricted to configured origins
- Environment variables for sensitive configuration (no hardcoded secrets)
- Automatic OTP expiry and attempts limit (prevents brute force)
- Admin role middleware protects admin-only routes; admin accounts cannot be deleted
- Security headers (helmet), MongoDB query-injection sanitization, HTTPS enforcement + trust proxy in production
- Deposit amounts capped so users cannot overshoot their goal target

---

## Currency

All amounts are displayed in **NPR (Nepalese Rupees)** format throughout the application.

---

## Future Features (Planned)

- Payment gateway integration
- Bank account linking
- Additional analytics (visuals)
- Mobile app version

---

## Troubleshooting

**Backend won't start:**
- Make sure MongoDB is running
- Check that the `.env` file is configured correctly
- Ensure port 5000 is not in use

**Frontend can't connect to backend:**
- Ensure the backend is running on port 5000
- Check the API base URL in `utils.js`
- Check browser console for CORS errors

**MongoDB connection error:**
- Verify `MONGODB_URI` in `.env`
- For local MongoDB, ensure the service is running
- For Atlas, check your IP is whitelisted

---

## License

This project is for educational purposes.
