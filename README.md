# Ensemble Management Software

A web application for managing musical ensembles built with Astro, Astro DB, and Bulma CSS.

## Features

### User Roles

- **Site Admin**: Can create ensembles and manage all users
- **Ensemble Admin**: Has full control over a specific ensemble (manage members, create rehearsals, track attendance)
- **Regular User**: Can join ensembles via invite codes, check in to rehearsals, view attendance

### Core Functionality

- **Authentication**: User registration, login, and session management
- **Invite System**: Ensembles are private and require invite codes to join
- **Ensemble Management**: Create and manage musical groups
- **Rehearsal Scheduling**: Schedule rehearsals with date, time, and location
- **Attendance Tracking**: Multiple check-in methods for rehearsals:
  - Manual check-in button
  - QR code scanning for touch-free check-in
  - Admin can manually mark attendance
- **Member Management**: Add/remove members, assign ensemble admin roles
- **Role-based Access Control**: Different permissions for site admins, ensemble admins, and members
- **Responsive UI**: Mobile-friendly interface using Bulma CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm (v10 or higher)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ensemble-management-software
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

The application will be available at `http://localhost:4321/`

### Default Admin Account

On first run, the database is seeded with a default admin account:

- **Email**: admin@example.com
- **Password**: admin123

**⚠️ Important**: Change this password immediately in production!

## Project Structure

```
/
├── db/
│   ├── config.ts          # Database schema definition
│   └── seed.ts            # Database seeding script
├── src/
│   ├── layouts/
│   │   └── Layout.astro   # Main layout with Bulma CSS
│   ├── lib/
│   │   ├── auth.ts        # Authentication utilities
│   │   └── session.ts     # Session management
│   ├── pages/
│   │   ├── index.astro              # Home page
│   │   ├── login.astro              # Login page
│   │   ├── register.astro           # Registration page
│   │   ├── logout.astro             # Logout handler
│   │   ├── profile.astro            # User profile
│   │   ├── admin.astro              # Site admin panel
│   │   ├── invite/
│   │   │   └── join.astro           # Join ensemble with invite code
│   │   ├── checkin/
│   │   │   └── [code].astro         # QR code check-in landing page
│   │   └── ensembles/
│   │       ├── index.astro                      # List of user's ensembles
│   │       └── [id]/
│   │           ├── astro                        # Ensemble detail page
│   │           └── rehearsals/
│   │               ├── index.astro              # Rehearsal list & scheduling
│   │               └── [rehearsalId].astro      # Rehearsal detail & attendance
│   ├── middleware.ts      # Authentication middleware
│   └── env.d.ts          # TypeScript definitions
└── astro.config.mjs      # Astro configuration
```

## Database Schema

### User Table
- `id`: Primary key
- `email`: Unique email address
- `passwordHash`: Hashed password
- `name`: User's full name
- `role`: 'admin' or 'user'
- `createdAt`: Account creation timestamp

### Ensemble Table
- `id`: Primary key
- `name`: Ensemble name
- `description`: Optional description
- `createdBy`: Reference to User who created it
- `createdAt`: Creation timestamp

### EnsembleMember Table
- `id`: Primary key
- `ensembleId`: Reference to Ensemble
- `userId`: Reference to User
- `role`: 'admin' or 'member' (ensemble-specific role)
- `joinedAt`: Timestamp when user joined

### EnsembleInvite Table
- `id`: Primary key
- `ensembleId`: Reference to Ensemble
- `code`: Unique 8-character invite code
- `createdBy`: Reference to User who created the invite
- `expiresAt`: Optional expiration date
- `createdAt`: Creation timestamp

### Rehearsal Table
- `id`: Primary key
- `ensembleId`: Reference to Ensemble
- `title`: Rehearsal title
- `description`: Optional description
- `scheduledAt`: Date and time of rehearsal
- `location`: Optional location
- `checkInCode`: Unique code for QR check-in
- `createdAt`: Creation timestamp

### Attendance Table
- `id`: Primary key
- `rehearsalId`: Reference to Rehearsal
- `userId`: Reference to User
- `checkedInAt`: Timestamp of check-in
- `checkedInMethod`: 'qr', 'manual', or 'admin'

## Usage Guide

### For Site Administrators

1. Log in with the admin account
2. Go to the Admin Panel
3. Create new ensembles (you'll automatically become an ensemble admin)
4. Promote users to site admin or demote them
5. Delete ensembles if needed

### For Ensemble Admins

1. Navigate to your ensemble from "My Ensembles"
2. **Manage Invite Codes**:
   - Generate new invite codes to share with prospective members
   - Delete old invite codes
3. **Manage Members**:
   - View all members and their roles
   - Promote members to ensemble admin
   - Remove members from the ensemble
4. **Schedule Rehearsals**:
   - Create rehearsals with date, time, and location
   - View upcoming and past rehearsals
5. **Track Attendance**:
   - Display QR code for members to scan at the door
   - View who has checked in to each rehearsal
   - Manually mark members present if needed
   - View attendance statistics

### For Regular Users

1. Register for an account
2. Receive an invite code from your ensemble admin
3. Click "Join with Invite Code" and enter the code
4. View your ensemble's upcoming rehearsals
5. Check in to rehearsals by:
   - Clicking the "Check In Now" button
   - Scanning the QR code displayed at the venue
   - Or visiting the check-in URL

## Check-In Methods

The system supports three ways for members to mark their attendance:

1. **QR Code Scanning**: Admins can display a QR code that members scan with their phones to instantly check in
2. **Manual Check-In**: Members can visit the rehearsal page and click "Check In Now"
3. **Admin Override**: Ensemble admins can manually mark any member as present

All attendance records include timestamps and the method used for check-in.

## Development

### Available Scripts

```bash
pnpm dev        # Start development server
pnpm build      # Build for production
pnpm preview    # Preview production build
pnpm check      # Run TypeScript type checking
pnpm lint       # Run linter and type check
pnpm fmt        # Auto-fix linting issues
```

## Technology Stack

- **Framework**: [Astro](https://astro.build/) v5
- **Database**: [Astro DB](https://docs.astro.build/en/guides/astro-db/)
- **CSS Framework**: [Bulma](https://bulma.io/) v1.0
- **Icons**: [Font Awesome](https://fontawesome.com/) v6
- **QR Codes**: qrcode package
- **Authentication**: bcryptjs for password hashing
- **SSR Adapter**: @astrojs/node
- **Linting**: Oxlint for TypeScript files

## Security Notes

- Passwords are hashed using bcrypt (10 rounds)
- Sessions are stored server-side with HTTP-only cookies
- Ensembles are private and require invite codes
- Check-in codes are unique per rehearsal
- CSRF protection should be added for production use
- Always use HTTPS in production
- Change the default admin password immediately

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
