# Ensemble Management Software

A web application for managing musical ensembles built with Astro, Astro DB, and Bulma CSS.

## Features

### User Roles

- **Site Admin**: Can create ensembles and manage all users
- **Ensemble Admin**: Has full control over a specific ensemble (add/remove members, promote to admin)
- **Regular User**: Can join ensembles and view ensemble information

### Core Functionality

- User authentication (registration, login, logout)
- Ensemble creation and management
- Member management within ensembles
- Role-based access control
- Responsive UI with Bulma CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ensemble-management-software
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
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
│   │   ├── index.astro    # Home page
│   │   ├── login.astro    # Login page
│   │   ├── register.astro # Registration page
│   │   ├── logout.astro   # Logout handler
│   │   ├── profile.astro  # User profile
│   │   ├── admin.astro    # Site admin panel
│   │   └── ensembles/
│   │       ├── index.astro           # List of ensembles
│   │       ├── [id].astro            # Ensemble detail page
│   │       └── [id]/join.astro       # Join ensemble handler
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

## Usage Guide

### For Site Administrators

1. Log in with the admin account
2. Go to the Admin Panel
3. Create new ensembles
4. Promote users to site admin or demote them
5. Delete ensembles if needed

### For Ensemble Admins

1. Navigate to your ensemble
2. View all members
3. Promote members to ensemble admin or demote them
4. Remove members from the ensemble

### For Regular Users

1. Register for an account
2. Browse available ensembles
3. Join ensembles you're interested in
4. View ensemble details and members

## Development

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Technology Stack

- **Framework**: [Astro](https://astro.build/) v5
- **Database**: [Astro DB](https://docs.astro.build/en/guides/astro-db/)
- **CSS Framework**: [Bulma](https://bulma.io/) v1.0
- **Icons**: [Font Awesome](https://fontawesome.com/) v6
- **Authentication**: bcryptjs for password hashing
- **SSR Adapter**: @astrojs/node

## Security Notes

- Passwords are hashed using bcrypt (10 rounds)
- Sessions are stored server-side with HTTP-only cookies
- CSRF protection should be added for production use
- Always use HTTPS in production
- Change the default admin password immediately

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
