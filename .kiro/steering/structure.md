# Project Structure

## Organization Philosophy

The repository uses a root-level Next.js App Router layout without a `src/` wrapper. Organization is layered at the top level and feature-oriented within UI and library code:

- `app/` owns URLs, layouts, pages, and HTTP route handlers.
- `components/` owns UI grouped by product area, with a small shared-primitives area.
- `lib/` owns reusable domain logic, persistence façades, browser helpers, and external-service adapters grouped by concern.
- `types/` owns framework-level type augmentation, and `public/` owns static assets.

Pages should compose feature components and domain modules rather than accumulating reusable UI or business logic inline.

## Directory Patterns

### Routes and HTTP Boundaries

**Location**: `/app/`  
**Purpose**: App Router layouts and pages follow URL segments; API endpoints use `route.ts` and exported HTTP method functions. Dynamic URL parameters use bracketed segment directories such as `[appId]`.

Server pages perform authentication-aware reads and pass serializable data into interactive components. Route handlers validate requests and delegate reusable behavior to `lib/`.

### Feature UI

**Location**: `/components/<feature>/`  
**Purpose**: Components are grouped by product domain such as editor, dashboard, public delivery, project sharing, authentication, and theme. Cross-feature primitives belong in `components/common/`; application chrome belongs in `components/app-shell/`.

Keep presentation types near their owning feature. Promote a type to a domain module only when it becomes a shared contract.

### Domain and Integration Modules

**Location**: `/lib/<domain>/`  
**Purpose**: Reusable non-UI behavior is grouped by concern. Persistence modules expose application-facing query and mutation functions, while provider modules hide external API differences.

Consumers depend on these exported façades rather than database, filesystem, or provider-specific implementation details.

### Browser-Only Helpers

**Location**: `/lib/<domain>/client.ts`  
**Purpose**: Browser storage, file handling, speech APIs, theme manipulation, and similar browser-only utilities are isolated behind explicit client modules.

Do not import server-only modules into these helpers or into Client Components.

## Naming Conventions

- **React component files and components**: PascalCase, generally with a default component export.
- **Route files**: App Router conventions (`page.tsx`, `layout.tsx`, and `route.ts`) inside descriptive URL-segment directories.
- **Feature directories and utility modules**: lowercase kebab-case where multiple words are needed.
- **Functions and variables**: camelCase.
- **Types and interfaces**: PascalCase.
- **Shared constants**: UPPER_SNAKE_CASE when they represent fixed application-wide values.

## Import Organization

Use the root alias for cross-directory imports and relative paths for tightly related files in the same feature or domain directory:

```typescript
import AssistantPanel from "@/components/editor/AssistantPanel";
import { getAppById } from "@/lib/app-store/store";
import AppCard from "./AppCard";
```

**Path Aliases**:

- `@/`: repository root

Imports target concrete modules; the project does not use barrel-index layers as a general pattern.

## Code Organization Principles

- **Prefer Server Components** for data loading and static composition; mark only interactive boundaries with `"use client"`.
- **Keep sensitive operations server-side**, including authentication, persistence, provider credentials, and upstream AI requests.
- **Delegate from routes to domains** so route handlers own HTTP concerns and `lib/` owns reusable behavior.
- **Keep domain contracts centralized** in their owning module; avoid parallel type definitions drifting across API and UI layers.
- **Preserve implementation boundaries**: UI should not know whether storage uses Postgres or local files, and application workflows should not construct provider-specific AI payloads.
- **Extract coherent units as complex files evolve**. Retain feature grouping while moving reusable hooks, services, types, or subcomponents behind clear interfaces.
- **Avoid new top-level categories without an established pattern**. Extend an existing feature or domain directory when it has clear ownership.

---
_Document organizational patterns rather than a file inventory. New files that follow these patterns should not require steering updates._
