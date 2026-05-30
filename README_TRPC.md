# tRPC API Layer

This template uses **tRPC** for building type-safe APIs. tRPC allows you to build and consume APIs without schemas or code generation - types flow directly from your backend to your frontend.

---

## What is tRPC?

tRPC (TypeScript Remote Procedure Call) is a library that enables you to build fully type-safe APIs without:

- Writing API schemas (like OpenAPI/Swagger)
- Code generation
- Runtime overhead

**Key Benefits:**

- **End-to-end type safety**: Change a server function and TypeScript catches client errors instantly
- **Auto-completion**: Your IDE knows exactly what your API accepts and returns
- **No code generation**: Types are inferred directly from your code
- **React Query integration**: Built-in caching, loading states and mutations

---

## Quick Start Tutorial

### 1. Understanding the Basics

In tRPC, you define **procedures** (API endpoints) in **routers**:

```typescript
// A simple router with a query and a mutation
export const greetingRouter = createTRPCRouter({
  // Query: For reading data (like GET)
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { message: `Hello, ${input.name}!` };
    }),

  // Mutation: For modifying data (like POST/PUT/DELETE)
  saveGreeting: protectedProcedure
    .input(z.object({ message: z.string() }))
    .mutation(({ input }) => {
      // Save to database...
      return { success: true };
    }),
});
```

### 2. Using in Client Components

```typescript
"use client";
import { trpc } from "@/trpc/client";

function MyComponent() {
  // Query (automatically fetches data)
  const { data, isPending, error } = trpc.greeting.hello.useQuery({
    name: "World",
  });

  // Mutation (call when needed)
  const saveMutation = trpc.greeting.saveGreeting.useMutation({
    onSuccess: () => {
      console.log("Saved!");
    },
  });

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>{data.message}</p>
      <button onClick={() => saveMutation.mutate({ message: "Hi!" })}>
        Save
      </button>
    </div>
  );
}
```

### 3. Using in Server Components

```typescript
// In a Server Component (page.tsx or layout.tsx)
import { trpc, HydrateClient } from "@/trpc/server";

export default async function Page() {
  // Prefetch data on the server
  await trpc.greeting.hello.prefetch({ name: "World" });

  return (
    <HydrateClient>
      <MyClientComponent />
    </HydrateClient>
  );
}
```

---

## Procedure Types

This template provides four procedure types with different access levels:

### publicProcedure

No authentication required. Anyone can call this.

```typescript
export const contactRouter = createTRPCRouter({
  submit: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        message: z.string().min(10),
      })
    )
    .mutation(async ({ input }) => {
      await sendContactEmail(input);
      return { success: true };
    }),
});
```

### protectedProcedure

Requires the user to be logged in. Provides `ctx.user` and `ctx.session`.

```typescript
export const userRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    // ctx.user is guaranteed to exist
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
    };
  }),
});
```

### protectedAdminProcedure

Requires the user to be a platform admin (`user.role === "admin"`).

```typescript
import { prisma } from "@/lib/db";

export const adminRouter = createTRPCRouter({
  getAllUsers: protectedAdminProcedure.query(async () => {
    // Only platform admins can access this
    return prisma.user.findMany();
  }),
});
```

### protectedOrganizationProcedure

Requires an active organization. Provides `ctx.organization` and `ctx.membership`.

```typescript
import { prisma } from "@/lib/db";

export const leadRouter = createTRPCRouter({
  getAll: protectedOrganizationProcedure.query(async ({ ctx }) => {
    // Always filter by organization for multi-tenant data!
    return prisma.lead.findMany({
      where: { organizationId: ctx.organization.id },
    });
  }),
});
```

---

## Creating a New Feature

### Step 1: Create the Zod Schema

Create validation schemas in `schemas/`:

```typescript
// schemas/widget-schemas.ts
import { z } from "zod/v4";

export const createWidgetSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateWidgetSchema = createWidgetSchema.partial();

export const getWidgetsSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  query: z.string().optional(),
});

// Export types for use in components
export type CreateWidgetInput = z.infer<typeof createWidgetSchema>;
```

### Step 2: Create the Router

Create a router in `trpc/routers/`:

```typescript
// trpc/routers/organization/organization-widgets.ts
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";
import { prisma } from "@/lib/db";
import {
  createWidgetSchema,
  updateWidgetSchema,
  getWidgetsSchema,
} from "@/schemas/widget-schemas";

export const organizationWidgetsRouter = createTRPCRouter({
  // GET all widgets
  getAll: protectedOrganizationProcedure
    .input(getWidgetsSchema)
    .query(async ({ ctx, input }) => {
      const widgets = await prisma.widget.findMany({
        where: {
          organizationId: ctx.organization.id,
          ...(input.query
            ? { name: { contains: input.query, mode: "insensitive" } }
            : {}),
        },
        take: input.limit,
        skip: input.offset,
        orderBy: { createdAt: "desc" },
      });

      return { widgets };
    }),

  // GET single widget by ID
  getById: protectedOrganizationProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const widget = await prisma.widget.findFirst({
        where: { id: input.id, organizationId: ctx.organization.id },
      });

      if (!widget) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Widget not found",
        });
      }

      return widget;
    }),

  // CREATE widget
  create: protectedOrganizationProcedure
    .input(createWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      const widget = await prisma.widget.create({
        data: {
          ...input,
          organizationId: ctx.organization.id,
        },
      });

      return widget;
    }),

  // UPDATE widget
  update: protectedOrganizationProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateWidgetSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.widget.updateMany({
        where: {
          id: input.id,
          organizationId: ctx.organization.id,
        },
        data: input.data,
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Widget not found",
        });
      }

      return prisma.widget.findUnique({ where: { id: input.id } });
    }),

  // DELETE widget
  delete: protectedOrganizationProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.widget.deleteMany({
        where: {
          id: input.id,
          organizationId: ctx.organization.id,
        },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Widget not found",
        });
      }

      return { success: true };
    }),
});
```

### Step 3: Register the Router

Add to the parent router:

```typescript
// trpc/routers/organization/index.ts
import { createTRPCRouter } from "@/trpc/init";
import { organizationWidgetsRouter } from "./organization-widgets";
// ... other imports

export const organizationRouter = createTRPCRouter({
  // ... existing routers
  widgets: organizationWidgetsRouter,
});
```

### Step 4: Use in Components

```typescript
"use client";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

function WidgetsList() {
  // Query with search
  const [search, setSearch] = useState("");
  const { data, isPending, error } = trpc.organization.widgets.getAll.useQuery({
    query: search,
    limit: 50,
  });

  // Get utils for cache invalidation
  const utils = trpc.useUtils();

  // Create mutation
  const createMutation = trpc.organization.widgets.create.useMutation({
    onSuccess: () => {
      toast.success("Widget created!");
      utils.organization.widgets.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete mutation
  const deleteMutation = trpc.organization.widgets.delete.useMutation({
    onSuccess: () => {
      toast.success("Widget deleted!");
      utils.organization.widgets.getAll.invalidate();
    },
  });

  if (isPending) return <Skeleton />;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search widgets..."
      />

      <button
        onClick={() => createMutation.mutate({ name: "New Widget" })}
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? "Creating..." : "Create Widget"}
      </button>

      {data.widgets.map((widget) => (
        <div key={widget.id}>
          {widget.name}
          <button onClick={() => deleteMutation.mutate({ id: widget.id })}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## Common Patterns

### Cache Invalidation

After mutations, invalidate related queries to refetch fresh data:

```typescript
const utils = trpc.useUtils();

const mutation = trpc.organization.lead.create.useMutation({
  onSuccess: () => {
    // Invalidate all lead queries
    utils.organization.lead.getAll.invalidate();

    // Or invalidate specific query
    utils.organization.lead.getAll.invalidate({ status: "new" });
  },
});
```

### Optimistic Updates

Update the UI immediately while the mutation is in progress:

```typescript
const utils = trpc.useUtils();

const mutation = trpc.organization.lead.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.organization.lead.getById.cancel({ id: newData.id });

    // Get current data
    const previousData = utils.organization.lead.getById.getData({
      id: newData.id,
    });

    // Optimistically update
    utils.organization.lead.getById.setData({ id: newData.id }, (old) =>
      old ? { ...old, ...newData.data } : old
    );

    return { previousData };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.organization.lead.getById.setData(
      { id: newData.id },
      context?.previousData
    );
  },
  onSettled: () => {
    utils.organization.lead.getAll.invalidate();
  },
});
```

### Server-Side Prefetching

Prefetch data in Server Components for instant page loads:

```typescript
// app/(saas)/dashboard/leads/page.tsx
import { trpc, HydrateClient } from "@/trpc/server";
import { LeadsList } from "./leads-list";

export default async function LeadsPage() {
  // Prefetch data on the server
  await trpc.organization.lead.getAll.prefetch({
    limit: 50,
    offset: 0,
  });

  return (
    <HydrateClient>
      <LeadsList />
    </HydrateClient>
  );
}
```

### Role-Based Access

Check membership role for sensitive operations:

```typescript
export const billingRouter = createTRPCRouter({
  cancelSubscription: protectedOrganizationProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Only owners and admins can manage billing
      if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and admins can manage billing",
        });
      }

      // Proceed with cancellation...
    }),
});
```

### Error Handling

Use appropriate error codes:

```typescript
import { TRPCError } from "@trpc/server";

// Not found
throw new TRPCError({
  code: "NOT_FOUND",
  message: "Lead not found",
});

// Forbidden (authenticated but not allowed)
throw new TRPCError({
  code: "FORBIDDEN",
  message: "You don't have permission to do this",
});

// Bad request (invalid input beyond Zod validation)
throw new TRPCError({
  code: "BAD_REQUEST",
  message: "Cannot delete the last admin",
});

// Conflict
throw new TRPCError({
  code: "CONFLICT",
  message: "A widget with this name already exists",
});
```

---

## Multi-Tenant Data Isolation

**Critical**: Always filter by `organizationId` for tenant data.

```typescript
import { prisma } from "@/lib/db";

// CORRECT - Data is isolated per organization
const leads = await prisma.lead.findMany({
  where: { organizationId: ctx.organization.id },
});

// WRONG - Data leak across tenants!
const leads = await prisma.lead.findMany();
```

For updates and deletes, include organization check in WHERE clause:

```typescript
import { prisma } from "@/lib/db";

// Safe update - combines existence and org check atomically
const updatedResult = await prisma.lead.updateMany({
  where: { id, organizationId: ctx.organization.id },
  data,
});

if (updatedResult.count === 0) {
  throw new TRPCError({ code: "NOT_FOUND" });
}

const updated = await prisma.lead.findUnique({ where: { id } });
```

---

## Router Structure

```
trpc/routers/
├── app.ts                 # Root router
├── admin/                 # Platform admin only
│   ├── index.ts
│   ├── admin-user.ts
│   └── admin-organization.ts
├── organization/          # Organization-scoped
│   ├── index.ts
│   ├── organization-ai.ts
│   ├── organization-billing.ts
│   ├── organization-credit.ts
│   └── organization-lead.ts
├── contact/               # Public contact form
├── upload/                # File uploads
└── user/                  # User session/accounts
```

---

## Type Inference

Types flow automatically from server to client:

```typescript
// Server defines the return type
create: protectedOrganizationProcedure
  .input(createWidgetSchema)
  .mutation(async ({ input }) => {
    const widget = await prisma.widget.create({ data: input });
    return widget; // Type is inferred
  }),

// Client automatically knows the type
const mutation = trpc.organization.widgets.create.useMutation();
mutation.mutate({ name: "Test" });
// mutation.data is typed as the widget type!
```

Extract types when needed:

```typescript
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/app";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

// Get specific procedure types
type CreateWidgetInput = RouterInputs["organization"]["widgets"]["create"];
type Widget = RouterOutputs["organization"]["widgets"]["getById"];
```

---

## Debugging

### Development Logger

tRPC logs all requests in development mode. Check your browser console or terminal.

### React Query DevTools

Add React Query DevTools to see query states:

```typescript
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// In your layout
<TRPCProvider>
  {children}
  <ReactQueryDevtools initialIsOpen={false} />
</TRPCProvider>
```

---

## File Reference

| File                           | Purpose                            |
| ------------------------------ | ---------------------------------- |
| `trpc/init.ts`                 | Core setup, procedures, middleware |
| `trpc/context.ts`              | Request context                    |
| `trpc/client.tsx`              | Client provider                    |
| `trpc/server.ts`               | Server-side caller                 |
| `trpc/query-client.ts`         | React Query config                 |
| `trpc/routers/app.ts`          | Root router                        |
| `trpc/routers/*/`              | Feature routers                    |
| `app/api/trpc/[trpc]/route.ts` | API handler                        |
| `schemas/*.ts`                 | Zod validation schemas             |

---

## Quick Reference

### Queries (Reading Data)

```typescript
// Define
getAll: protectedProcedure.query(async () => { ... })

// Use
const { data, isPending, error } = trpc.router.getAll.useQuery();
```

### Mutations (Modifying Data)

```typescript
// Define
create: protectedProcedure
  .input(schema)
  .mutation(async ({ input }) => { ... })

// Use
const mutation = trpc.router.create.useMutation();
mutation.mutate({ ... });
```

### Input Validation

```typescript
.input(z.object({
  name: z.string().min(1),
  email: z.string().email(),
}))
```

### Cache Invalidation

```typescript
const utils = trpc.useUtils();
utils.router.procedure.invalidate();
```

### Server Prefetching

```typescript
await trpc.router.procedure.prefetch({ ... });
```
