# STTPS ERP — UI/UX Design Brief

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> Ground-truth reference extracted directly from source code. Every class, color, and pattern documented here reflects what is actually rendered in production, not aspirational specs.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Sizing](#4-spacing--sizing)
5. [Shell Layout](#5-shell-layout)
6. [Auth Layout](#6-auth-layout)
7. [Component Library](#7-component-library)
8. [Page Pattern](#8-page-pattern)
9. [Modal Pattern](#9-modal-pattern)
10. [Form Pattern](#10-form-pattern)
11. [Table Pattern](#11-table-pattern)
12. [Status Badge System](#12-status-badge-system)
13. [Data Formatting Conventions](#13-data-formatting-conventions)
14. [Loading & Empty States](#14-loading--empty-states)
15. [Sidebar Anatomy](#15-sidebar-anatomy)
16. [Topbar Anatomy](#16-topbar-anatomy)
17. [Icon Usage](#17-icon-usage)
18. [Tailwind Vocabulary](#18-tailwind-vocabulary)

---

## 1. Design Philosophy

**Professional Enterprise Dark-on-Light.** The application shell uses a dark sidebar (slate-900) against a light content area (slate-50), giving a high-contrast navigation chrome with a clean, readable workspace. All interactive elements use Blue-600 as the sole brand color, keeping the palette disciplined and purposeful.

**Density-first.** Forms and tables favor compact spacing (`py-2`, `text-sm`) to maximize information density without feeling cramped. KPI dashboards use larger type (`text-2xl font-bold`) to make metrics scannable at a glance.

**Progressive disclosure.** Lists show minimal data with action icons; detail appears in slide-over modals or expandable sections. Users stay in context rather than navigating away to detail pages.

**No decoration.** No gradients in content areas (auth is the sole exception), no shadows beyond `shadow-sm` on cards, no custom illustrations. Empty states use icon + text only.

---

## 2. Color System

### Tailwind Palette Usage

| Role | Token | Hex |
|------|-------|-----|
| Brand primary | `blue-600` | `#2563EB` |
| Brand primary hover | `blue-700` | `#1D4ED8` |
| Brand light bg | `blue-50` | `#EFF6FF` |
| Brand muted bg | `blue-100` | `#DBEAFE` |
| Brand text | `blue-700` | `#1D4ED8` |
| Brand focus ring | `blue-500` | `#3B82F6` |
| Shell background | `slate-900` | `#0F172A` |
| Content background | `slate-50` | `#F8FAFC` |
| Card background | `white` | `#FFFFFF` |
| Border default | `slate-200` | `#E2E8F0` |
| Border dark (sidebar) | `slate-800` | `#1E293B` |
| Border muted (sidebar indent) | `slate-700/60` | `rgba(51,65,85,0.6)` |
| Text primary | `slate-900` | `#0F172A` |
| Text secondary | `slate-600` | `#475569` |
| Text muted | `slate-500` | `#64748B` |
| Text placeholder/disabled | `slate-400` | `#94A3B8` |
| Sidebar text default | `slate-400` | `#94A3B8` |
| Sidebar text active | `white` | `#FFFFFF` |

### Semantic Status Colors

| Status | Background | Text |
|--------|-----------|------|
| Success / Active / Posted | `green-100` | `green-700` |
| Warning / Draft / Pending | `yellow-100` | `yellow-700` |
| Danger / Void / Rejected | `red-100` | `red-700` |
| Info / Approved | `emerald-100` | `emerald-700` |
| Converted / Fulfilled | `violet-100` | `violet-700` |
| Neutral / Cancelled | `slate-100` | `slate-600` |
| Blue accent | `blue-100` | `blue-700` |

### Auth Layout Gradient

```
bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900
```

---

## 3. Typography

### Font

**Inter** — loaded via Google Fonts CDN with weights: 300, 400, 500, 600, 700.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
body { font-family: 'Inter', sans-serif; }
```

### Type Scale (Tailwind classes used in practice)

| Usage | Class | Weight |
|-------|-------|--------|
| Page title | `text-xl font-bold text-slate-900` | 700 |
| Page subtitle | `text-sm text-slate-500` | 400 |
| Section heading | `text-sm font-semibold text-slate-900` | 600 |
| Card/table label | `text-xs font-medium text-slate-500 uppercase tracking-wider` | 500 |
| Body / form labels | `text-sm font-medium text-slate-700` | 500 |
| Body default | `text-sm text-slate-600` | 400 |
| KPI value | `text-2xl font-bold` | 700 |
| KPI label | `text-sm text-slate-500` | 400 |
| Code / amounts / IDs | `font-mono text-sm` | 400 (monospace) |
| Journal number | `font-mono text-blue-700 font-medium` | 500 |
| Button | `text-sm font-medium` | 500 |
| Badge | `text-xs font-medium` | 500 |
| Sidebar nav item | `text-sm font-medium` | 500 |

---

## 4. Spacing & Sizing

### Grid System

Content area uses CSS Grid with responsive columns:

```
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4   ← KPI cards
grid grid-cols-2 sm:grid-cols-3 gap-3                  ← Quick actions
grid grid-cols-1 lg:grid-cols-3 gap-4                  ← Form + summary panels
```

### Standard Spacing

| Element | Class |
|---------|-------|
| Page outer padding | `p-6` |
| Card inner padding | `p-6` |
| Form section padding | `p-5` |
| Table cell padding | `px-4 py-3` |
| Input padding | `px-3 py-2` |
| Button padding | `px-4 py-2` |
| Primary button padding | `px-4 py-2.5` |
| Modal padding | `p-6` |
| Sidebar padding | `px-3 py-4` |
| Nav item padding | `px-3 py-2` |

### Border Radius

| Element | Class |
|---------|-------|
| Cards | `rounded-xl` |
| Modals | `rounded-2xl` |
| Inputs | `rounded-lg` |
| Buttons | `rounded-lg` |
| Badges | `rounded-full` |
| Avatar | `rounded-full` |
| Logo box | `rounded-xl` |
| Sidebar nav item | `rounded-lg` |
| Dropdown | `rounded-xl` |
| Stat card icon box | `rounded-xl` |

---

## 5. Shell Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar (w-60)  │  Topbar (h-16, full width minus sidebar)  │
│  bg-slate-900    │  bg-white border-b border-slate-200        │
│  h-screen        ├──────────────────────────────────────────┤
│  flex-col        │  Main content                              │
│                  │  flex-1 overflow-y-auto                    │
│                  │  bg-slate-50 p-6                           │
│                  │                                            │
└──────────────────────────────────────────────────────────────┘
```

**Root shell classes:**
```
<div class="flex h-screen overflow-hidden bg-slate-50">
  <Sidebar />
  <div class="flex-1 flex flex-col overflow-hidden">
    <Topbar />
    <main class="flex-1 overflow-y-auto bg-slate-50 p-6">
      {children}
    </main>
  </div>
</div>
```

**Scrollbar styling:**
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
```

---

## 6. Auth Layout

```
┌──────────────────────────────────────────────────┐
│  bg-gradient-to-br                                │
│  from-slate-900 via-blue-950 to-slate-900         │
│  min-h-screen flex items-center justify-center    │
│  p-4                                              │
│                                                   │
│     ┌─────────────────────────────────────┐       │
│     │  Logo + Brand                       │       │
│     │  bg-white rounded-2xl shadow-2xl    │       │
│     │  p-8 w-full max-w-md               │       │
│     │                                     │       │
│     │  [Form content]                     │       │
│     └─────────────────────────────────────┘       │
└──────────────────────────────────────────────────┘
```

**Logo block (inside card):**
```html
<div class="flex items-center gap-3 mb-8">
  <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
    <span class="text-white font-bold text-lg">S</span>
  </div>
  <div>
    <h1 class="text-xl font-bold text-slate-900">STTPS ERP</h1>
    <p class="text-sm text-slate-500">Enterprise Resource Planning</p>
  </div>
</div>
```

---

## 7. Component Library

All components are defined as `@layer components` utilities in `globals.css`.

### `.card`
```css
.card {
  @apply bg-white rounded-xl border border-slate-200 shadow-sm;
}
```
Usage: wrap every content section — filter bars, tables, stats panels.

---

### `.input-base`
```css
.input-base {
  @apply w-full px-3 py-2 text-sm border border-slate-300 rounded-lg
         bg-white text-slate-900 placeholder-slate-400
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
         disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed;
}
```
Applied to: `<input>`, `<select>`, `<textarea>`.

---

### `.btn-primary`
```css
.btn-primary {
  @apply inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
         bg-blue-600 rounded-lg hover:bg-blue-700
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
}
```

### `.btn-secondary`
```css
.btn-secondary {
  @apply inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700
         bg-white border border-slate-300 rounded-lg hover:bg-slate-50
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
}
```

### `.btn-ghost`
```css
.btn-ghost {
  @apply inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600
         rounded-lg hover:bg-slate-100
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
}
```

---

### `.badge`
```css
.badge {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
}
```

Badge variants (applied as additional classes alongside `.badge`):

| Class | Appearance |
|-------|-----------|
| `.badge-green` | `bg-green-100 text-green-700` |
| `.badge-yellow` | `bg-yellow-100 text-yellow-700` |
| `.badge-red` | `bg-red-100 text-red-700` |
| `.badge-blue` | `bg-blue-100 text-blue-700` |
| `.badge-slate` | `bg-slate-100 text-slate-600` |

---

### `.table-base`
```css
.table-base {
  @apply w-full text-sm text-left;
}
.table-base thead {
  @apply border-b border-slate-200;
}
.table-base th {
  @apply px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider;
}
.table-base td {
  @apply px-4 py-3 text-slate-600;
}
.table-base tbody tr {
  @apply border-b border-slate-100 hover:bg-slate-50 transition-colors;
}
```

---

### `.page-header`
```css
.page-header {
  @apply flex items-center justify-between mb-6;
}
```

### `.page-title`
```css
.page-title {
  @apply text-xl font-bold text-slate-900;
}
```

### `.page-subtitle`
```css
.page-subtitle {
  @apply text-sm text-slate-500 mt-0.5;
}
```

---

### `.stat-card`
```css
.stat-card {
  @apply card p-5 flex items-center gap-4;
}
```

Stat card icon box pattern:
```html
<div class="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
  <Icon class="text-white" size={22} />
</div>
<div>
  <p class="text-2xl font-bold text-slate-900">{value}</p>
  <p class="text-sm text-slate-500">{label}</p>
</div>
```

Icon box colors used: `bg-green-500`, `bg-red-500`, `bg-blue-500`, `bg-purple-500`, `bg-orange-500`, `bg-teal-500`.

---

### `.form-label`
```css
.form-label {
  @apply block text-sm font-medium text-slate-700 mb-1;
}
```

### `.form-error`
```css
.form-error {
  @apply text-xs text-red-600 mt-1;
}
```

---

## 8. Page Pattern

Every list/management page follows this structure top-to-bottom:

```
1. page-header
   ├── Left: page-title + page-subtitle
   └── Right: btn-primary "Create ___" with Plus icon

2. Filter bar (.card p-4 mb-6)
   └── flex items-center gap-3
       ├── Search input (input-base pl-9 with Search icon absolute)
       └── Status <select> (input-base max-w-xs)

3. Data table (.card overflow-hidden)
   ├── <table class="table-base">
   │   ├── <thead> with column headers
   │   └── <tbody> with data rows
   │       └── Last column: action icon buttons (Eye, Edit, CheckCircle, etc.)
   └── Pagination footer (border-t border-slate-200 px-4 py-3)
       └── flex items-center justify-between
           ├── "Showing X–Y of Z results" text-sm text-slate-500
           └── Prev / Next buttons (btn-secondary)
```

### Search input construction
```html
<div class="relative">
  <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
  <input class="input-base pl-9" placeholder="Search..." />
</div>
```

### Table action buttons
```html
<button class="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors">
  <Eye size={16} />
</button>
```
Conditional action example (only show "Post" on DRAFT):
```tsx
{row.status === 'DRAFT' && (
  <button class="p-1 text-slate-400 hover:text-green-600 rounded transition-colors">
    <CheckCircle size={16} />
  </button>
)}
```

---

## 9. Modal Pattern

### Overlay + Panel

```html
<!-- Overlay -->
<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">

  <!-- Panel -->
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

    <!-- Header (sticky) -->
    <div class="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">{title}</h2>
        <p class="text-sm text-slate-500">{subtitle}</p>
      </div>
      <button class="p-2 hover:bg-slate-100 rounded-lg transition-colors">
        <X size={20} class="text-slate-500" />
      </button>
    </div>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto p-6 space-y-4">
      {content}
    </div>

    <!-- Footer (sticky) -->
    <div class="flex justify-end gap-3 p-6 border-t border-slate-200 flex-shrink-0">
      <button class="btn-secondary">Cancel</button>
      <button class="btn-primary">Save</button>
    </div>

  </div>
</div>
```

### Modal Widths

| Modal type | Max width |
|-----------|-----------|
| Simple confirm / single-section | `max-w-md` |
| Standard create/edit | `max-w-2xl` |
| Complex (with line items table) | `max-w-3xl` |
| Full-screen detail | `max-w-4xl` |

---

## 10. Form Pattern

### Field layout

Single column (default inside modal):
```html
<div class="space-y-4">
  <div>
    <label class="form-label">Field Name *</label>
    <input class="input-base" />
    <p class="form-error">{error}</p>
  </div>
</div>
```

Two-column grid (wider modals):
```html
<div class="grid grid-cols-2 gap-4">
  <div>...</div>
  <div>...</div>
</div>
```

### Line items table (useFieldArray)

Used in journal entries, purchase orders, invoice forms:

```html
<div class="border border-slate-200 rounded-lg overflow-hidden">
  <table class="table-base">
    <thead>
      <tr>
        <th>Account</th>
        <th>Description</th>
        <th>Debit</th>
        <th>Credit</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {fields.map((field, i) => (
        <tr>
          <td><select class="input-base" /></td>
          <td><input class="input-base" /></td>
          <td><input class="input-base text-right font-mono" /></td>
          <td><input class="input-base text-right font-mono" /></td>
          <td>
            <button class="text-red-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
    <tfoot>
      <tr class="bg-slate-50 font-medium">
        <td colspan="2">Totals</td>
        <td class="font-mono text-right">{totalDebit}</td>
        <td class="font-mono text-right">{totalCredit}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- Add line button -->
<button class="btn-ghost text-xs mt-2">
  <Plus size={14} /> Add Line
</button>

<!-- Balance indicator -->
<div class="text-right text-sm font-medium {isBalanced ? 'text-green-600' : 'text-red-600'}">
  {isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
</div>
```

Balance check: `Math.abs(totalDebits - totalCredits) < 0.001`

### React Hook Form + Zod setup

```tsx
const schema = z.object({ field: z.string().min(1) });
const { register, handleSubmit, control, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
const { fields, append, remove } = useFieldArray({ control, name: "lines" });
```

---

## 11. Table Pattern

### Column conventions

| Column type | Alignment | Classes |
|------------|-----------|---------|
| Text / name | Left | `text-slate-900 font-medium` (first col) |
| Code / ID | Left | `font-mono text-blue-700 font-medium` |
| Status | Left | `.badge .badge-{color}` |
| Currency amount | Right | `text-right font-mono` |
| Date | Left | `text-slate-500` |
| Actions | Right | `text-right` |

### Totals row in view modals

```html
<tfoot class="bg-slate-50 border-t-2 border-slate-200">
  <tr>
    <td colspan="3" class="px-4 py-3 text-sm font-semibold text-slate-700 text-right">Total</td>
    <td class="px-4 py-3 text-sm font-bold text-slate-900 font-mono text-right">{total}</td>
  </tr>
</tfoot>
```

---

## 12. Status Badge System

### Domain → Status → Badge

**General Ledger**

| Status | Badge class |
|--------|------------|
| `DRAFT` | `badge badge-yellow` |
| `POSTED` | `badge badge-green` |
| `REVERSED` | `badge badge-slate` |
| `VOID` | `badge badge-red` |

**Sales (Quotes, Orders)**

| Status | Inline classes |
|--------|---------------|
| `DRAFT` | `bg-slate-100 text-slate-600` |
| `APPROVED` | `bg-emerald-100 text-emerald-700` |
| `CONVERTED` | `bg-violet-100 text-violet-700` |
| `REJECTED` | `bg-red-100 text-red-700` |

**Procurement / AP / AR**

| Status | Badge class |
|--------|------------|
| `DRAFT` | `badge badge-yellow` |
| `APPROVED` | `badge badge-green` |
| `PAID` / `RECEIVED` | `badge badge-blue` |
| `OVERDUE` | `badge badge-red` |
| `CANCELLED` | `badge badge-slate` |

**HR / Leave / Payroll**

| Status | Badge class |
|--------|------------|
| `PENDING` | `badge badge-yellow` |
| `APPROVED` | `badge badge-green` |
| `REJECTED` | `badge badge-red` |
| `DRAFT` | `badge badge-slate` |

**Manufacturing / Work Orders**

| Status | Badge class |
|--------|------------|
| `PLANNED` | `badge badge-blue` |
| `IN_PROGRESS` | `badge badge-yellow` |
| `COMPLETED` | `badge badge-green` |
| `CANCELLED` | `badge badge-slate` |

---

## 13. Data Formatting Conventions

### Currency

**KPI / dashboard compact:**
```ts
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
// → "$1.2M", "$450K"
```

**Table / detail precise:**
```ts
const formatAmount = (amount: number) =>
  amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
// → "1,250,000.00"
```
Always rendered in `font-mono`.

### Dates

```ts
import { format } from "date-fns";
format(new Date(date), "MMM d, yyyy")   // → "Jan 15, 2025"
format(new Date(date), "yyyy-MM-dd")    // → "2025-01-15" (table compact)
```

### Percentages

```ts
`${value.toFixed(1)}%`  // → "87.5%"
```

### Large counts / quantities

```ts
count.toLocaleString()  // → "1,250"
```

---

## 14. Loading & Empty States

### Table loading skeleton

```html
<div class="animate-pulse space-y-3 p-4">
  <div class="h-10 bg-slate-100 rounded-lg"></div>
  <div class="h-10 bg-slate-100 rounded-lg"></div>
  <div class="h-10 bg-slate-100 rounded-lg"></div>
  <div class="h-10 bg-slate-100 rounded-lg"></div>
  <div class="h-10 bg-slate-100 rounded-lg"></div>
</div>
```

### Stat card loading skeleton

```html
<div class="animate-pulse card p-5">
  <div class="flex items-center gap-4">
    <div class="w-12 h-12 bg-slate-100 rounded-xl"></div>
    <div class="space-y-2 flex-1">
      <div class="h-6 bg-slate-100 rounded w-1/2"></div>
      <div class="h-4 bg-slate-100 rounded w-3/4"></div>
    </div>
  </div>
</div>
```

### Page-level spinner

```html
<div class="flex items-center justify-center h-64">
  <div class="text-center">
    <Loader2 class="animate-spin text-blue-600 mx-auto mb-3" size={32} />
    <p class="text-sm text-slate-500">Loading...</p>
  </div>
</div>
```

### Workspace loading (platform layout)

```html
<div class="flex items-center justify-center h-screen bg-slate-50">
  <div class="text-center">
    <Loader2 class="animate-spin text-blue-600 mx-auto mb-4" size={40} />
    <p class="text-slate-500">Loading workspace...</p>
  </div>
</div>
```

### Empty state (no records)

```html
<div class="text-center py-12">
  <FileText class="mx-auto text-slate-300 mb-3" size={40} />
  <p class="text-slate-500 text-sm">No {entity} found</p>
  <p class="text-slate-400 text-xs mt-1">Create one to get started</p>
</div>
```

Icon choice: matches domain (FileText for documents, Package for inventory, Users for HR, etc.).

---

## 15. Sidebar Anatomy

```
┌─────────────────────────┐
│  Logo (h-16)            │  border-b border-slate-800
│  [S] STTPS              │  px-4, logo w-8 h-8 bg-blue-600 rounded-lg
│      Enterprise ERP     │
├─────────────────────────┤
│  nav                    │  flex-1 overflow-y-auto py-4 px-3 space-y-0.5
│                         │
│  ▼ Finance              │  ← parent (expanded): text-white bg-blue-600/20
│    Overview             │  ← child
│    Chart of Accounts    │
│    ...                  │
│                         │
│  ▶ Procurement          │  ← parent (collapsed): text-slate-400 hover:text-white
│                         │
│  [active leaf]          │  ← text-white bg-blue-600 font-medium
├─────────────────────────┤
│  v0.7.0 — Phase 7       │  border-t border-slate-800 p-3, text-xs text-slate-600 text-center
└─────────────────────────┘
```

### Nav item states

| State | Classes |
|-------|---------|
| Default parent | `text-slate-400 hover:text-white hover:bg-slate-800` |
| Active parent (child is active) | `text-white bg-blue-600/20` |
| Default child | `text-slate-400 hover:text-white hover:bg-slate-800` |
| Active child (current page) | `text-white bg-blue-600 font-medium` |

### Expanded section indentation

```html
<div class="mt-0.5 ml-2 pl-3 border-l border-slate-700/60 space-y-0.5">
  {children}
</div>
```

### Chevron icons

- Expanded: `<ChevronDown size={14} class="text-slate-500" />`
- Collapsed: `<ChevronRight size={14} class="text-slate-500" />`

### Navigation groups (14 total)

1. Dashboard (direct link)
2. Finance (12 children)
3. Procurement (5 children)
4. Inventory (6 children)
5. Manufacturing (6 children)
6. CRM (6 children)
7. Sales (5 children)
8. Human Resources (5 children)
9. Asset Management (4 children)
10. Field Service (4 children)
11. Projects (3 children)
12. Quality (4 children)
13. EHS (4 children)
14. Analytics (2 children)
15. Settings (3 children)

---

## 16. Topbar Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│  h-16 bg-white border-b border-slate-200 px-6              │
│                                                             │
│  [Company Switcher]  ·····················  [🔔] [Avatar]  │
└─────────────────────────────────────────────────────────────┘
```

### Company Switcher

```html
<button class="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
  <Building2 size={16} class="text-slate-500" />
  <span class="text-sm font-medium text-slate-700">{company.name}</span>
  <span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">{company.code}</span>
  <ChevronDown size={14} class="text-slate-400" />
</button>
```

Dropdown: `absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20`

Each company row: `flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer`

Active company: `bg-blue-50` with `<Check size={16} class="text-blue-600 ml-auto" />`

### Notification Bell

```html
<button class="relative p-2 hover:bg-slate-100 rounded-lg transition-colors">
  <Bell size={20} class="text-slate-600" />
  <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
</button>
```

### User Avatar + Menu

```html
<button class="flex items-center gap-2.5 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors">
  <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
    <span class="text-white text-xs font-bold">{initials}</span>
  </div>
  <span class="text-sm font-medium text-slate-700">{user.name}</span>
  <ChevronDown size={14} class="text-slate-400" />
</button>
```

Dropdown menu items: Profile, Settings (with divider before), Sign Out.

### Click-outside close overlay

```html
<div class="fixed inset-0 z-10" onClick={closeDropdown} />
```
Placed before the dropdown panel in DOM order (both share `z-20` on the panel, overlay is `z-10`).

---

## 17. Icon Usage

All icons from `lucide-react`. Standard sizes:

| Context | Size prop |
|---------|-----------|
| Sidebar nav items | `size={16}` |
| Page header actions (button) | `size={16}` |
| Table row actions | `size={16}` |
| Topbar (bell, chevrons) | `size={20}` |
| Stat card icon | `size={22}` |
| Modal close button | `size={20}` |
| Empty state icon | `size={40}` |
| Workspace loading spinner | `size={40}` |
| Page-level spinner | `size={32}` |
| Search icon (input) | `size={16}` |

### Icon → Module mapping

| Module | Icon |
|--------|------|
| Dashboard | `LayoutDashboard` |
| Finance | `DollarSign` |
| Procurement | `ShoppingCart` |
| Inventory | `Package` |
| Manufacturing | `Factory` |
| CRM | `Users` |
| Sales | `Briefcase` |
| Human Resources | `Users` |
| Asset Management | `Wrench` |
| Field Service | `Truck` |
| Projects | `Globe` |
| Quality | `ShieldCheck` |
| EHS | `HardHat` |
| Analytics | `BarChart3` |
| Settings | `Settings` |
| Incidents | `AlertTriangle` |
| Journal / Documents | `FileText` |
| Requisitions / Lists | `ClipboardList` |
| Cash / Payroll | `Banknote` |
| Accounts Payable | `CreditCard` |
| Accounts Receivable | `Receipt` |
| Buildings / Assets | `Building2` |
| Budgets / Costs | `DollarSign` |
| Reports / Charts | `BarChart3` |
| Routings / Plans | `Settings` |
| Loading spinner | `Loader2` (animate-spin) |

---

## 18. Tailwind Vocabulary

The complete set of Tailwind utility classes actively used in this codebase, grouped by category.

### Layout
```
flex flex-col flex-row flex-1 flex-shrink-0
items-center items-start items-end justify-between justify-center justify-end
gap-2 gap-2.5 gap-3 gap-4 gap-6
grid grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4
sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:grid-cols-3
w-full w-60 w-8 w-10 w-12 w-2
h-screen h-16 h-64 h-8 h-10 h-12 h-2
max-w-xs max-w-md max-w-2xl max-w-3xl max-w-4xl
min-h-screen
overflow-hidden overflow-y-auto
fixed inset-0 absolute relative
top-0 top-1.5 top-full left-0 right-0 right-1.5
z-10 z-20 z-50
```

### Spacing
```
p-3 p-4 p-5 p-6 p-8
px-3 px-4 px-6 py-2 py-2.5 py-3 py-4 py-12
mb-1 mb-2 mb-3 mb-4 mb-6 mb-8
mt-0.5 mt-1 mt-2 mt-3 mt-4
ml-2 ml-auto
pl-3 pl-9
space-y-0.5 space-y-2 space-y-3 space-y-4
```

### Typography
```
text-xs text-sm text-base text-lg text-xl text-2xl
font-medium font-semibold font-bold font-mono
text-left text-right text-center
tracking-wider leading-none
uppercase
truncate
```

### Colors (text)
```
text-white text-slate-900 text-slate-700 text-slate-600 text-slate-500 text-slate-400 text-slate-300
text-blue-600 text-blue-700
text-green-600 text-green-700
text-red-400 text-red-600 text-red-700
text-emerald-700 text-violet-700 text-yellow-700
```

### Colors (background)
```
bg-white bg-slate-50 bg-slate-100 bg-slate-900
bg-blue-50 bg-blue-100 bg-blue-600 bg-blue-600/20 bg-blue-950
bg-green-100 bg-green-500
bg-red-100 bg-red-500
bg-yellow-100
bg-emerald-100
bg-violet-100
bg-purple-500 bg-orange-500 bg-teal-500
bg-black/50
```

### Borders
```
border border-b border-t border-l
border-slate-100 border-slate-200 border-slate-300 border-slate-700/60 border-slate-800
border-transparent
rounded-lg rounded-xl rounded-2xl rounded-full
```

### Shadows
```
shadow-sm shadow-lg shadow-2xl
```

### Interactivity
```
hover:bg-slate-50 hover:bg-slate-100 hover:bg-slate-800
hover:text-white hover:text-blue-600 hover:text-green-600 hover:text-red-600
hover:border-slate-300
cursor-pointer cursor-not-allowed
transition-colors
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent
disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
```

### Positioning utilities
```
-translate-y-1/2
```

### Animation
```
animate-spin animate-pulse
```

---

*Document reflects source state as of Phase 7, v0.7.0. All classes verified against `apps/web/src/app/globals.css`, `apps/web/src/app/(platform)/layout.tsx`, `apps/web/src/components/layout/Sidebar.tsx`, `apps/web/src/components/layout/Topbar.tsx`, and representative page components.*
