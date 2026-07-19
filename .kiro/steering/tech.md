# Technology Stack

## Architecture

The application is a full-stack Next.js App Router system. Server Components handle authentication-aware data loading by default, Client Components own interactive browser behavior, and route handlers provide JSON APIs for mutations and external-service calls. Reusable domain and integration logic sits behind modules in `lib/` rather than being duplicated in pages or components.

Persistence is selected by environment behind store façades: configured deployments use Vercel Postgres, while local development can fall back to JSON files. Authentication, data access, and AI-provider credentials remain server-side. Public chatbot and shared-project pages are intentional exceptions to otherwise authenticated, owner-scoped project access.

## Core Technologies

- **Language**: TypeScript 5 in strict mode
- **Framework**: Next.js 16 App Router with React 19
- **Runtime**: Node.js 20.9 or newer
- **Styling**: Tailwind CSS 4 with shared global CSS for themes and cross-cutting layout rules
- **Package management**: npm with the committed lockfile

## Key Libraries

- **Auth.js / NextAuth** provides JWT sessions, credentials authentication, and optional OAuth providers.
- **Vercel Postgres** provides production persistence through tagged SQL; no ORM or migration framework is currently used.
- **Lexical and MDXEditor** provide rich prompt editing.
- **React Markdown, remark/rehype, and KaTeX** render chat content, GitHub-flavored Markdown, and mathematics.
- **pdf-parse** performs server-side text extraction from uploaded PDFs.

AI integrations use a provider-neutral server module with direct HTTP calls to supported model providers. Provider-specific payloads and capabilities stay inside that adapter; callers pass the common provider, model, variability, system prompt, and message contract.

## Development Standards

### Type Safety

- Keep `strict`, `noEmit`, isolated modules, and bundler-style module resolution enabled.
- Prefer explicit domain types and `unknown` at untrusted boundaries; narrow before use.
- Treat existing `any` escape hatches as localized debt, not as the project convention.
- Centralize shared application contracts in the relevant domain module instead of redefining request and state shapes across layers.

### Server and Client Boundaries

- Default pages and components to server execution; add `"use client"` only where hooks, browser APIs, or event handlers require it.
- Isolate browser-only helpers in explicit client modules.
- Keep filesystem, database, authentication, PDF processing, and model-provider requests on the server.
- Never include API keys, credentials, or secret environment values in client responses, logs, documentation, or steering.

### API and Data Access

- Route handlers validate authentication, ownership, and request data at the HTTP boundary, delegate reusable work to `lib/`, and return JSON with meaningful HTTP status codes.
- Preserve storage independence by accessing application and user data through store modules; consumers must not depend on Postgres or JSON-file implementation details.
- Owner-scope all private reads and writes. Treat published chatbots and explicitly shared projects as narrowly defined public access paths.
- Keep provider-specific AI behavior behind the common provider adapter and normalize cross-provider settings before sending requests.

### Code Quality

No formatter, linter, or lint script is currently configured. Match the surrounding TypeScript style, keep changes focused, and rely on the production build as the existing static integration check until dedicated tooling is adopted.

### Testing

No automated test runner, test script, or repository test suite is currently configured. Do not claim automated coverage. New testing conventions should be introduced as an explicit project decision and documented when they become established.

## Development Environment

### Required Tools

- Node.js 20.9+
- npm
- Environment configuration for authentication, persistence, and chosen AI providers as needed; document variable purpose, never values

### Common Commands

```bash
# Development server with Turbopack
npm run dev

# Production build with Turbopack
npm run build

# Serve a completed production build
npm run start
```

## Key Technical Decisions

- **Full-stack App Router** keeps rendering, server APIs, and route-level access control in one framework while retaining explicit server/client boundaries.
- **Feature-facing store modules** provide one domain API across Postgres deployments and local JSON fallback storage.
- **Provider-neutral AI integration** lets tutoring workflows share one contract while containing capability differences such as image input or generation.
- **Layered access control** combines coarse proxy protection with route-level session and ownership checks; public delivery remains explicit.
- **Class-based dark mode** and early theme initialization keep the theme consistent across server rendering and browser hydration.

---
_Document standards and durable decisions, not every dependency or environment variable._
