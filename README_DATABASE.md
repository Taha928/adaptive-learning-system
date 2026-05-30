# Database System

This template uses **Prisma ORM** with **PostgreSQL** for type-safe database operations.

---

## Quick Setup

### 1. Start PostgreSQL (Docker)

```bash
npm run docker:up
```

This starts PostgreSQL 17 on `localhost:5432`.

### 2. Run Migrations

```bash
npm run db:migrate
```

### 3. Open Database GUI

```bash
npm run db:studio
```

Opens Prisma Studio (usually at `http://localhost:5555`).

---

## Configuration

### Environment Variables

```bash
# .env
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="password"
POSTGRES_DB="database"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
DATABASE_URL="postgresql://postgres:password@localhost:5432/database"
```

### Prisma Schema

- **Schema file**: `prisma/schema.prisma`
- **Config file**: `prisma.config.ts` (Prisma 7 style)
- **Migrations**: `prisma/migrations/*`

---

## Structure

```
prisma/
├── schema.prisma        # Prisma schema (models, relations, enums)
└── migrations/          # SQL migrations

lib/db/
├── prisma.ts            # Prisma client singleton
├── client.ts            # `db` alias (backwards compatible)
├── index.ts             # Main exports
└── prisma-where.ts      # Where clause helpers
```

### Import Pattern

```typescript
import { prisma } from "@/lib/db";
import { LeadStatus } from "@/lib/enums";
```

---

## Tables Overview

### Authentication Tables

| Model          | Table Name     | Purpose                                 |
| -------------- | -------------- | --------------------------------------- |
| `User`         | `user`         | User accounts with profile info         |
| `Account`      | `account`      | OAuth/credential accounts (Better Auth) |
| `Session`      | `session`      | Active user sessions                    |
| `Verification` | `verification` | Email verification tokens               |
| `TwoFactor`    | `two_factor`   | 2FA secrets and backup codes            |

### Organization Tables

| Model          | Table Name     | Purpose                         |
| -------------- | -------------- | ------------------------------- |
| `Organization` | `organization` | Organizations with billing info |
| `Member`       | `member`       | Organization memberships        |
| `Invitation`   | `invitation`   | Pending invitations             |

### Billing Tables

| Model              | Table Name           | Purpose                 |
| ------------------ | -------------------- | ----------------------- |
| `Subscription`     | `subscription`       | Stripe subscriptions    |
| `SubscriptionItem` | `subscription_item`  | Subscription line items |
| `Order`            | `order`              | One-time payments       |
| `OrderItem`        | `order_item`         | Order line items        |
| `BillingEvent`     | `billing_event`      | Webhook audit log       |

### Credit System Tables

| Model                    | Table Name                 | Purpose                          |
| ------------------------ | -------------------------- | -------------------------------- |
| `CreditBalance`          | `credit_balance`           | Organization credit balances     |
| `CreditTransaction`      | `credit_transaction`       | Credit ledger entries            |
| `CreditDeductionFailure` | `credit_deduction_failure` | Failed deduction tracking        |

### Feature Tables

| Model    | Table Name | Purpose                 |
| -------- | ---------- | ----------------------- |
| `Lead`   | `lead`     | Leads/contacts          |
| `AiChat` | `ai_chat`  | AI conversation history |

---

## Enums

Enums are defined in `prisma/schema.prisma`. In Prisma 7, you can import them directly in client components!

### Role Enums

```prisma
// prisma/schema.prisma

enum UserRole {
  user
  admin
}

enum MemberRole {
  owner
  admin
  member
}
```

### Status Enums

```typescript
// Lead pipeline stages
### Status Enums

```prisma
// prisma/schema.prisma

enum LeadStatus {
  new
  contacted
  qualified
  // ...
}
```

### Using Enums

```typescript
// ✅ Works in Client Components too!
import { LeadStatus } from "@prisma/client";

// Type-safe value
const status: LeadStatus = LeadStatus.qualified;

// Array of all values (for dropdowns)
Object.values(LeadStatus).map((status) => <option key={status}>{status}</option>);
```

---

## Query Examples

### Basic Queries

```typescript
import { prisma } from "@/lib/db";

// Find one
const user = await prisma.user.findFirst({
  where: { email: "user@example.com" },
});

// Find many with ordering
const leads = await prisma.lead.findMany({
  where: { organizationId: orgId },
  orderBy: { createdAt: "desc" },
  take: 50,
});
```

### With Relations

```typescript
import { prisma } from "@/lib/db";

// Load lead with assigned user
const lead = await prisma.lead.findFirst({
  where: { id: leadId },
  include: {
    assignedTo: { select: { id: true, name: true, email: true, image: true } },
  },
});

// Load organization with members
const org = await prisma.organization.findFirst({
  where: { id: orgId },
  include: {
    members: {
      include: { user: { select: { id: true, name: true, email: true } } },
    },
  },
});
```

### Insert

```typescript
import { prisma } from "@/lib/db";

// Single insert
const lead = await prisma.lead.create({
  data: {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    organizationId: ctx.organization.id,
  },
});

// Bulk insert (note: createMany returns a count, not the created rows)
const created = await prisma.lead.createMany({
  data: [
    {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      organizationId: ctx.organization.id,
    },
    {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      organizationId: ctx.organization.id,
    },
  ],
  skipDuplicates: true,
});
```

### Update

```typescript
import { prisma } from "@/lib/db";
import { LeadStatus } from "@prisma/client";

// Update (throws if not found)
const updated = await prisma.lead.update({
  where: { id: leadId },
  data: {
    status: LeadStatus.qualified,
  },
});

// Multi-tenant safe update (atomic check)
const updatedResult = await prisma.lead.updateMany({
  where: { id: leadId, organizationId: ctx.organization.id },
  data,
});

if (updatedResult.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
```

### Delete

```typescript
import { prisma } from "@/lib/db";

// Delete (throws if not found)
await prisma.lead.delete({ where: { id: leadId } });

// Bulk delete
const deleted = await prisma.lead.deleteMany({
  where: { id: { in: ids }, organizationId: ctx.organization.id },
});

console.log(`Deleted ${deleted.count} leads`);
```

### Upsert

```typescript
import { prisma } from "@/lib/db";

const subscription = await prisma.subscription.upsert({
  where: { id: stripeSubscriptionId },
  create: {
    id: stripeSubscriptionId,
    organizationId,
    status: "active",
    // ...
  },
  update: {
    status: "active",
  },
});
```

### Filtering & Search

```typescript
import { prisma } from "@/lib/db";

const where = {
  organizationId: ctx.organization.id,
  ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
  ...(query
    ? {
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      }
    : {}),
};

const leads = await prisma.lead.findMany({
  where,
  orderBy: { createdAt: "desc" },
  take: 50,
  skip: page * 50,
});
```

### Aggregations

```typescript
import { prisma } from "@/lib/db";

// Count
const total = await prisma.lead.count({
  where: { organizationId: orgId },
});

// Select specific columns
const leads = await prisma.lead.findMany({
  where: { organizationId: orgId },
  select: { id: true, firstName: true, lastName: true, email: true },
});

// Compute derived fields in JS
const formatted = leads.map((l) => ({
  id: l.id,
  name: `${l.firstName} ${l.lastName}`.trim(),
  email: l.email,
}));
```

### Transactions

```typescript
import { prisma } from "@/lib/db";

const result = await prisma.$transaction(async (tx) => {
  // All operations in this block are atomic
  await tx.subscriptionItem.deleteMany({ where: { subscriptionId: subId } });

  await tx.subscriptionItem.createMany({
    data: newItems,
    skipDuplicates: true,
  });

  return tx.subscriptionItem.findMany({ where: { subscriptionId: subId } });
});
```

---

## Adding a New Table

### 1. Edit Schema

Add your model to `prisma/schema.prisma`:

```prisma
model Widget {
    id             String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    organizationId String       @map("organization_id") @db.Uuid
    name           String       @db.Text
    description    String?      @db.Text
    isActive       Boolean      @default(true) @map("is_active")
    createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
    updatedAt      DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

    organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

    @@index([organizationId], map: "widget_organization_id_idx")
    @@index([isActive], map: "widget_is_active_idx")
    @@map("widget")
}
```

Don't forget to add the relation to `Organization`:

```prisma
model Organization {
    // ... existing fields
    widgets Widget[]
}
```

### 2. Generate Migration

```bash
npm run db:generate
```

This creates a new migration file in `prisma/migrations/`.

### 3. Apply Migration

```bash
npm run db:migrate
```

---

## Adding a New Enum

### 1. Add to Prisma Schema

```prisma
// prisma/schema.prisma

enum WidgetType {
    chart
    table
    metric
}
```

### 2. Mirror in lib/enums.ts

```typescript
// lib/enums.ts
import type { WidgetType as PrismaWidgetType } from "@prisma/client";

export const WidgetType = {
  chart: "chart",
  table: "table",
  metric: "metric",
} as const satisfies Record<string, PrismaWidgetType>;
export type WidgetType = PrismaWidgetType;
export const WidgetTypes = Object.values(WidgetType);
```

### 3. Use in Schema

```prisma
model Widget {
    type WidgetType @default(chart)
}
```

---

## Type Safety

### Prisma Type Imports

```typescript
import type { Prisma } from "@prisma/client";

// Where input types for filtering
type LeadWhere = Prisma.LeadWhereInput;

// Create input types
type LeadCreate = Prisma.LeadCreateInput;

// Transaction client
type TxClient = Prisma.TransactionClient;
```

### Use in Functions

```typescript
export async function createLead(data: Prisma.LeadCreateInput) {
  return prisma.lead.create({ data });
}
```

---

## Multi-Tenant Pattern

**Critical**: Always filter by `organizationId` for tenant data.

```typescript
import { prisma } from "@/lib/db";

// CORRECT - Data isolated per organization
const leads = await prisma.lead.findMany({
  where: { organizationId: ctx.organization.id },
});

// WRONG - Data leak across tenants!
const leads = await prisma.lead.findMany();
```

### Safe Update/Delete

```typescript
import { prisma } from "@/lib/db";

const updatedResult = await prisma.lead.updateMany({
  where: { id: leadId, organizationId: ctx.organization.id },
  data,
});

if (updatedResult.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
```

---

## Migrations

### Commands

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `npm run db:generate` | Generate Prisma Client from schema            |
| `npm run db:migrate`  | Apply pending migrations                      |
| `npm run db:studio`   | Open Prisma Studio GUI                        |
| `npm run db:push`     | Push schema directly (dev only, no migration) |
| `npm run db:pull`     | Pull schema from existing database            |

### Migration Workflow

1. **Edit schema** in `prisma/schema.prisma`
2. **Create migration**: `npx prisma migrate dev --name your_migration_name`
3. **Review migration** in `prisma/migrations/`
4. **Deploy migration**: `npm run db:migrate`

### Data Migrations

For complex migrations with data transformation, edit the generated SQL:

```sql
-- Add new column
ALTER TABLE "lead" ADD COLUMN "full_name" text;

-- Populate from existing data
UPDATE "lead" SET "full_name" = "first_name" || ' ' || "last_name";

-- Make it required
ALTER TABLE "lead" ALTER COLUMN "full_name" SET NOT NULL;
```

---

## Docker Setup

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: database
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Commands

```bash
npm run docker:up     # Start PostgreSQL
npm run docker:down   # Stop PostgreSQL
```

---

## Production Databases

### Recommended Providers

| Provider                               | Best For              | Free Tier    |
| -------------------------------------- | --------------------- | ------------ |
| [Neon](https://neon.tech)              | Serverless, branching | 0.5 GB       |
| [Supabase](https://supabase.com)       | Full platform         | 500 MB       |
| [Railway](https://railway.app)         | Simple setup          | $5/mo credit |
| [PlanetScale](https://planetscale.com) | Most reliable         | $5/mo        |

### Connection String Format

```bash
# With SSL (required for most cloud providers)
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

---

## Best Practices

### 1. Always Use Timestamps

```prisma
createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
```

### 2. Use Cascade Deletes

```prisma
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
```

### 3. Add Indexes for Queries

```prisma
@@index([organizationId, status], map: "lead_org_status_idx")
```

### 4. Use Transactions for Related Operations

```typescript
import { prisma } from "@/lib/db";

await prisma.$transaction(async (tx) => {
  await tx.subscriptionItem.deleteMany({ where: { subscriptionId } });
  await tx.subscriptionItem.createMany({ data: newItems });
});
```

### 5. Handle Prisma Errors

```typescript
import { Prisma } from "@prisma/client";

try {
  await prisma.user.create({ data });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    // Unique constraint violation
    throw new TRPCError({ code: "CONFLICT", message: "Email already exists" });
  }
  throw error;
}
```

---

## File Reference

| File                    | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `prisma/schema.prisma`  | Prisma schema (models, relations, enums)     |
| `prisma.config.ts`      | Prisma 7 config (datasource URL for Migrate) |
| `lib/db/index.ts`       | Main exports (`prisma`, `db`)                |
| `lib/db/prisma.ts`      | Prisma client singleton with pg adapter      |
| `lib/db/client.ts`      | `db` alias for backwards compatibility       |
| `lib/db/prisma-where.ts`| Where clause building helpers                |
| `prisma/migrations/`    | Migration files                              |
| `docker-compose.yml`    | Local PostgreSQL                             |

---

## Environment Variables

| Variable            | Required   | Description                  |
| ------------------- | ---------- | ---------------------------- |
| `DATABASE_URL`      | Yes        | PostgreSQL connection string |
| `DATABASE_SCHEMA`   | No         | Custom schema (optional)     |
| `POSTGRES_USER`     | For Docker | Database user                |
| `POSTGRES_PASSWORD` | For Docker | Database password            |
| `POSTGRES_DB`       | For Docker | Database name                |
| `POSTGRES_HOST`     | For Docker | Database host                |
| `POSTGRES_PORT`     | For Docker | Database port                |
