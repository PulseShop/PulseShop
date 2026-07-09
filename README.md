# PulseShop

A social-commerce Progressive Web App (PWA) built with React, TypeScript, and Vite.

## Running the Frontend Locally

**Prerequisites:** Node.js 18+ and npm

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at **http://localhost:5173**

## Available Scripts

From the `frontend/` directory:

| Command | Description |
|---|---|
| `npm run dev` | Start dev server at http://localhost:5173 |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build at http://localhost:4173 |

> PWA features (service worker, offline support, install prompt) only work in the production build. Use `npm run preview` to test them.

## Routes

| Route | Screen |
|---|---|
| `/` | Merchant storefront |
| `/product/:id` | Product detail |
| `/favorites` | Wishlist |
| `/order/:id` | Order form + payment |
| `/orders` | Order history |
| `/dashboard/inventory` | Inventory management (desktop) |
| `/dev/components` | Component gallery |

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** + **Tailwind CSS v4**
- **Zustand** for state management
- **TanStack Query** for data fetching
- **React Router v7**
- **Radix UI** primitives
- 