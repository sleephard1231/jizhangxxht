# Personal Finance App UI Spec

## Product Direction

This product should be designed as a web-first personal finance workspace.
It should feel closer to a private financial desk than a mobile banking app.
The experience should be calm, premium, analytical, and highly scannable on large screens.

The app should help the user answer four questions quickly:

1. How much did I earn this month?
2. How much did I spend this month?
3. Where did the money go by category?
4. Which subscriptions are active, renewing soon, or worth reviewing?

## Web-First Experience Principles

- Use the width. Let users see summary, trend, and details at the same time.
- Keep the month as the main lens. Month switching should drive the whole experience.
- Make importing easy. `.xlsx` import should be visible, trustworthy, and fast.
- Let charts and tables work together. Clicking a chart should filter the detail table.
- Keep the interface selective. This is a personal dashboard, not a crowded BI tool.

## Visual Theme

Design language: editorial finance cockpit

- Mood: premium, warm, focused, personal
- Personality: sharp hierarchy, generous whitespace, quiet confidence
- Avoid: default SaaS blue, neon fintech gradients, crypto styling, toy-like gamification

## Information Architecture

Recommended left navigation:

1. Overview
2. Transactions
3. Subscriptions
4. Insights
5. Imports
6. Settings

Recommended top bar:

- Month switcher
- Global search
- Import `.xlsx`
- Quick add transaction
- User avatar / initials

## Layout System

Use a desktop-first shell with:

- Left sidebar: `240-264px`
- Main content max width: `1280-1440px`
- Content grid: `12 columns`
- Global page padding: `24-32px`
- Section gaps: `24-32px`

The UI should feel composed, not stretched.
Do not let content float edge-to-edge on wide monitors.

## Screen 1: Overview Dashboard

This is the main workspace.
It should let the user understand the current month in under 10 seconds.

### Recommended Layout

Top row:

- Large hero card for net cash flow
- Income summary card
- Expense summary card
- Subscription monthly burden card

Middle row:

- Category breakdown chart
- 6-month income vs expense trend
- Upcoming renewals panel

Bottom row:

- Recent transactions table
- Quick insights rail

### Hero Card

The hero card should contain:

- Current month label
- Large net number
- Delta vs previous month
- Tiny embedded sparkline

This card should visually anchor the whole page.

### Category Module

Recommended content:

- Donut or radial chart
- Top 5 categories
- Amount
- Share of total spend
- Comparison vs last month

Clicking a category should filter the transactions table below.

### Upcoming Renewals Module

Show:

- Next 5 upcoming subscription charges
- Service name
- Charge amount
- Renewal date
- Days remaining

This module should feel operational and alert-focused.

### Transactions Table Preview

Show:

- Date
- Merchant
- Category
- Account or source
- Type
- Amount
- Recurring / subscription indicator

Include a `View all transactions` action.

## Screen 2: Transactions

Purpose: review, search, clean, and correct financial data

### Layout

Top:

- Search bar
- Filter chips
- Date range
- Account filter
- Category filter
- Type filter
- Import button

Main:

- Full-width table
- Sticky header
- Right-side detail drawer on row click

### Table Behavior

Columns:

- Date
- Merchant
- Notes
- Category
- Account
- Type
- Tags
- Amount
- Source

Recommended features:

- Sort by amount or date
- Multi-select rows
- Bulk categorize
- Mark as recurring
- Mark as subscription
- Exclude from analytics

### Detail Drawer

The right drawer should show:

- Full transaction metadata
- Editable category
- Recurring toggle
- Subscription toggle
- Notes
- Source file reference if imported

## Screen 3: Subscriptions

This screen should act like a subscription control center.

### Layout

Top row:

- Monthly subscription total
- Annualized subscription total
- Number of active subscriptions
- Renewing this week

Main content:

- Card grid of active subscriptions
- Renewal timeline
- Review suggestions

### Subscription Card

Each card can contain:

- Service name
- Logo or monogram
- Monthly or annual price
- Billing cycle
- Next charge date
- Category
- Payment source
- Last detected transaction

### Smart Review Area

Possible cards:

- `No charge seen recently`
- `Duplicate entertainment services`
- `Annual plan due soon`
- `Price increased from previous bill`

## Screen 4: Insights

Purpose: explain behavior and surface changes

### Recommended Modules

1. Spending by category
2. Income vs expense trend
3. Monthly comparison view
4. Subscription growth over time
5. Largest changes this month
6. Natural-language observations

### Design Rule

Do not overload this page with miniature charts.
Use fewer, larger modules with room to breathe.

## Screen 5: Imports

This screen is important because `.xlsx` import is a core workflow.
It should feel safe, transparent, and easy to recover from mistakes.

### Purpose

- Import transaction history from `.xlsx`
- Preview the file before saving
- Map columns once, then reuse the mapping
- Detect duplicates and reduce cleanup work

### Main Sections

1. Import dropzone
2. Recent imports list
3. Saved column mappings
4. Import health / warnings

## `.xlsx` Import UX

### Entry Points

Place import actions in three places:

- Top bar global button: `Import .xlsx`
- Transactions page action
- Dedicated Imports page

### Upload Experience

The upload state should support:

- Drag and drop
- File picker
- Clear accepted format hint: `.xlsx`
- Friendly empty state

### Import Flow

Recommended 4-step flow:

1. Upload file
2. Map columns
3. Preview and validate
4. Confirm import

This flow can be shown as a modal wizard or as a dedicated page.
For web, a dedicated page or large modal works better than a small dialog.

## `.xlsx` Mapping Rules

The app should support spreadsheet columns such as:

- Date
- Description
- Merchant
- Amount
- Income
- Expense
- Category
- Account
- Notes
- Currency

### Smart Mapping

The system should try to auto-detect:

- Date columns
- Amount columns
- Debit / credit patterns
- Merchant-like text columns

### Mapping UI

For each imported column, show:

- Source column name
- Sample values
- Target field dropdown
- Ignore option

### Important Behavior

If the sheet uses one signed amount column:

- Positive values can become income
- Negative values can become expense

If the sheet uses separate debit and credit columns:

- Credit maps to income
- Debit maps to expense

The UI should explain this clearly during mapping.

## Import Preview

Before saving imported data, show a preview table with:

- First 20-50 rows
- Detected type
- Parsed amount
- Parsed date
- Duplicate status
- Missing field warnings

### Validation Warnings

Examples:

- `12 rows missing date`
- `5 rows could not parse amount`
- `3 possible duplicates found`
- `2 rows have future dates`

Warnings should be actionable, not scary.

## Duplicate Detection

The app should try to detect likely duplicates using:

- Date
- Amount
- Merchant or description
- Source file fingerprint

### UX Suggestion

Show duplicates as a review state:

- Skip duplicates
- Import anyway
- Review individually

## Import History

Each import record should show:

- File name
- Import date
- Row count
- New rows added
- Duplicates skipped
- Mapping used
- Undo action if supported

This will matter a lot once you import monthly statements repeatedly.

## Settings for Import

Useful settings:

- Default currency
- Date format preference
- Decimal separator behavior
- Save column mappings by bank or source
- Duplicate sensitivity

## Visual System

## Color Palette

Primary palette:

- Ink: `#16211D`
- Forest: `#24463B`
- Sage: `#6E8B7E`
- Sand: `#EAE3D6`
- Paper: `#F7F3EC`
- Clay: `#C97B63`
- Gold: `#C7A96B`
- Mist: `#D9E3DF`

Functional colors:

- Positive: `#2F7A58`
- Negative: `#B45445`
- Warning: `#C58A2B`
- Info: `#4D6E8A`

### Usage

- Use `Paper` as the app background instead of pure white
- Use `Ink` and `Forest` on hero surfaces
- Use `Sage`, `Gold`, and `Clay` as restrained accents
- Keep chart colors muted and deliberate

## Typography

Recommended pairing:

- Headline font: elegant serif or refined display serif
- UI font: clean grotesk or humanist sans

Suggested scale:

- Page title: 32-40
- Hero number: 44-56
- Section title: 22-28
- Card heading: 16-18
- Body: 14-16
- Meta label: 12-13

Web layouts can support slightly larger headings than mobile.

## Components

### Cards

- Radius: 22-28
- Soft shadow, low opacity
- Optional warm border tint

### Buttons

- Primary: dark filled
- Secondary: soft light surface
- Tertiary: quiet text / outline

The `Import .xlsx` button should feel primary but not alarming.

### Tables

- Spacious rows
- Sticky headers
- Subtle separators
- Strong hover states
- Right-aligned amounts

### Charts

- Donut, radial bar, line, bar-line combination
- Low-noise gridlines
- One dominant highlight at a time

### Drawers and Modals

- Use wide right drawers for detail editing
- Use large modals for import preview and mapping

## Motion

Use restrained motion:

- Smooth number transitions on month change
- Soft chart morphs
- Drawer slide-in
- Upload progress animation

Avoid playful motion that makes the app feel like a game.

## Spacing

- Page padding: `24-32`
- Card padding: `18-24`
- Table row height: `52-64`
- Grid gap: `20-24`

## Suggested Overview Page Composition

Top to bottom:

1. Page header with month switcher and import CTA
2. Financial summary cards
3. Category and trend section
4. Subscription and renewal section
5. Transactions table

This keeps the flow:
state -> explanation -> obligations -> evidence

## Suggested First Build Order

1. App shell and web layout
2. Overview dashboard
3. Transactions table + detail drawer
4. `.xlsx` import flow
5. Subscriptions screen
6. Insights screen

## Implementation Advice

For a web-first build, a strong stack would be:

- `React`
- `Tailwind CSS`
- `shadcn/ui`
- `TanStack Table`
- `Recharts` or `ECharts`

For `.xlsx` parsing on the frontend, consider:

- `xlsx` for reading spreadsheet files

The most important thing is not just parsing the file.
It is designing the mapping and preview flow so importing feels trustworthy.

## What to Avoid

- Treating import as a hidden utility
- Making the dashboard look like enterprise accounting software
- Tiny unreadable tables
- Dense card walls
- Bright purple or electric blue defaults
- Over-decorated charts

## Assumptions

- This is a personal-use product
- Web is the primary platform
- Importing `.xlsx` files is a core workflow, not an afterthought
- Transactions may come from spreadsheets with inconsistent columns
- Subscription tracking deserves its own dedicated view
