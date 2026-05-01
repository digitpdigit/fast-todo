## Product Requirements Document — Weekly Desktop To-Do App (Tauri)

### 1) Overview

A lightweight, offline-first desktop application for managing **weekly recurring tasks** with flexible properties. Built with Tauri for cross-platform distribution (Windows, macOS, Linux). The product replaces manual duplication (e.g., in Notion) with rule-based weekly generation.

---

### 2) Goals

- Eliminate manual task duplication
- Provide fast daily access via **system tray**
- Support **custom properties** (user-defined enums + colors)
- Maintain a clean, minimal UI with strong filtering

### Non-Goals (v1)

- Collaboration / multi-user sync
- Mobile apps
- Cloud sync (local-only first)

---

### 3) Core Concepts

#### 3.1 Task Template (source of truth)

Defines recurrence and schema.

```ts
type TaskTemplate = {
  id: string;
  title: string;
  daysOfWeek: number[]; // 1=Mon ... 7=Sun
  propertiesSchemaId?: string;
  createdAt: string;
};
```

#### 3.2 Task Instance (materialized per date)

```ts
type TaskInstance = {
  id: string;
  templateId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  properties: Record<string, string>; // enum value keys
};
```

#### 3.3 Property Schema (user-defined)

```ts
type PropertySchema = {
  id: string;
  name: string; // e.g. "Status"
  type: "enum";
  options: {
    value: string; // e.g. "todo"
    label: string; // "To Do"
    color: string; // hex
  }[];
};
```

---

### 4) Key Features

#### 4.1 Weekly Task System

- User creates a task template:

  - Title
  - Select weekdays (Mon–Sun)

- App generates task instances dynamically (lazy generation)

Behavior:

- Opening app → generates tasks for current week if not exist
- No duplication UI required

---

#### 4.2 CRUD — Tasks

**Create**

- Title
- Days of week
- Optional property schema

**Read**

- Grouped view: Monday → Sunday (fixed order)

**Update**

- Modify:

  - Title
  - Assigned days
  - Property values per instance

**Delete**

- Delete template → removes future instances
- Optional: keep past history (configurable later)

---

#### 4.3 Custom Properties (Flexible Schema)

User can:

- Create property (e.g. “Status”, “Priority”)
- Define enum values + colors

Example:

```
Status:
- Todo (gray)
- Doing (blue)
- Done (green)
```

Applied per task instance:

- Render as colored chips

Constraints:

- v1 supports only ENUM type
- Schema attached to template

---

#### 4.4 Filtering

Global filters:

- By property value (e.g. Status = Doing)
- By completion state

Important constraint:

- **View always grouped by day (Mon–Sun)**
- Filtering hides items within each group, not groups themselves

---

#### 4.5 System Tray (Critical UX)

##### Tray Left Click

- Opens **Today Popover**

  - Shows today’s tasks only
  - Quick toggle complete
  - Minimal UI (fast interaction)

##### Tray Right Click

Menu:

- Open App (full window)
- Today View
- Quit

Behavior:

- App runs in background
- Closing window → minimizes to tray (not exit)

---

#### 4.6 Notifications (v1-lite)

- Optional daily reminder (user-configurable time)
- Shows today’s pending tasks count

---

### 5) UI Requirements

#### 5.1 Main Window

Layout:

```
[ Filters Bar ]

Monday
  [ ] Task A   [Status: Todo]
  [x] Task B   [Status: Done]

Tuesday
  ...
```

#### 5.2 Today Popover (Tray)

```
Today — Friday

[ ] Gym
[ ] Coding
[x] Read
```

#### 5.3 Property Editor

- Add property
- Add enum values
- Pick colors

---

### 6) Technical Architecture

#### 6.1 Stack

- Shell: Tauri
- Backend: Rust
- Frontend: Vanilla TS + minimal UI (no heavy framework)
- Database: SQLite (local)

---

#### 6.2 Data Flow

1. UI requests tasks for date range
2. Backend:

   - Loads templates
   - Generates missing instances
   - Returns instances

3. UI renders grouped list

---

#### 6.3 Key Backend Functions

```rust
get_tasks_for_week(start_date)
create_template()
update_template()
delete_template()
set_task_property()
toggle_task_complete()
```

---

#### 6.4 Storage

SQLite tables:

- `task_templates`
- `task_instances`
- `property_schemas`
- `property_options`

---

### 7) Cross-Platform Requirements

Must support:

- Windows (.msi / .exe)
- macOS (.app / .dmg)
- Linux (.AppImage / .deb)

Handled via Tauri bundling:

```bash
npm run tauri build
```

---

### 8) Performance Requirements

- App launch < 1 second
- Tray popover < 200ms
- No network dependency

---

### 9) Risks / Edge Cases

- Timezone drift affecting date generation
- Duplicate instance creation → must enforce unique (template_id + date)
- Property schema changes affecting old tasks

---

### 10) MVP Scope (strict)

Must include:

- Weekly templates (Mon–Sun)
- Task instances (lazy generation)
- CRUD templates
- Enum properties + colors
- Grouped weekly view
- Tray (today view + open app)

Exclude:

- Sync
- Accounts
- Advanced analytics

---

### 11) Future Extensions

- Streak tracking
- Keyboard-first UX
- Telegram bot integration
- Export/import (JSON)
- Cloud sync

---

### 12) Acceptance Criteria

- User creates “Gym (Mon–Sat)” → tasks appear correctly for each day
- User defines “Status” property → visible as colored chips
- Tray click shows today tasks instantly
- Filters work without breaking day grouping
- App runs fully offline across OS

---

If needed, next step can be:

- database schema SQL
- Tauri command scaffolding
- tray implementation details (this part has platform-specific quirks)
