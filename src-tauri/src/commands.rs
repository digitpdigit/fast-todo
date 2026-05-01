use crate::db::{self, monday_of_naive, open_connection, setting_get, setting_set};
use crate::models::{ReminderSettings, TaskInstanceDto, TaskRule};
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

pub struct DbState(pub Mutex<Connection>);

fn weekday_num(w: Weekday) -> u8 {
    match w {
        Weekday::Mon => 1,
        Weekday::Tue => 2,
        Weekday::Wed => 3,
        Weekday::Thu => 4,
        Weekday::Fri => 5,
        Weekday::Sat => 6,
        Weekday::Sun => 7,
    }
}

fn parse_days(json: &str) -> Result<Vec<u8>, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn serialize_days(days: &[u8]) -> Result<String, String> {
    serde_json::to_string(days).map_err(|e| e.to_string())
}

fn normalize_task_color(input: &str) -> Result<String, String> {
    let s = input.trim();
    if s.len() != 7 || !s.starts_with('#') {
        return Err("color must be #RRGGBB".to_string());
    }
    if !s[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid hex color".to_string());
    }
    Ok(format!("#{}", s[1..].to_uppercase()))
}

/// Instances exist only in the template's anchor week (the week the rule was created / pinned to).
fn template_matches_week(anchor_week_start: &str, request_week_monday: &str) -> bool {
    !anchor_week_start.is_empty() && anchor_week_start == request_week_monday
}

fn with_conn<T, F: FnOnce(&Connection) -> Result<T, String>>(state: &DbState, f: F) -> Result<T, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    f(&guard)
}

fn instance_row_mapper(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskInstanceDto> {
    let days_json: String = r.get(8)?;
    let dw = parse_days(&days_json).unwrap_or_default();
    Ok(TaskInstanceDto {
        id: r.get(0)?,
        template_id: r.get(1)?,
        template_title: r.get(2)?,
        date: r.get(3)?,
        completed: r.get::<_, i64>(4)? != 0,
        color: r.get(5)?,
        template_description: r.get(6)?,
        anchor_week_start: r.get(7)?,
        template_days_of_week: dw,
    })
}

#[tauri::command]
pub fn get_tasks_for_week(state: State<DbState>, week_start: String) -> Result<Vec<TaskInstanceDto>, String> {
    with_conn(&state, |c| {
        let start = NaiveDate::parse_from_str(&week_start, "%Y-%m-%d").map_err(|e| e.to_string())?;
        let end = start + Duration::days(6);
        let end_s = end.format("%Y-%m-%d").to_string();

        let mut stmt = c
            .prepare("SELECT id, days_of_week, COALESCE(anchor_week_start, '') FROM task_templates")
            .map_err(|e| e.to_string())?;
        let templates: Vec<(String, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        for offset in 0..7 {
            let date = start + Duration::days(offset);
            let d = weekday_num(date.weekday());
            let date_str = date.format("%Y-%m-%d").to_string();
            for (tid, days_json, anchor) in &templates {
                if !template_matches_week(anchor, &week_start) {
                    continue;
                }
                let days = parse_days(days_json)?;
                if days.contains(&d) {
                    ensure_instance(c, tid, &date_str)?;
                }
            }
        }

        let mut stmt = c
            .prepare(
                "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed,
                        COALESCE(tt.color, ?4), tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
                 FROM task_instances ti
                 JOIN task_templates tt ON tt.id = ti.template_id
                 WHERE ti.date >= ?1 AND ti.date <= ?2
                   AND tt.anchor_week_start = ?3
                 ORDER BY ti.date, tt.title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![week_start, end_s, week_start, db::DEFAULT_TASK_COLOR],
                instance_row_mapper,
            )
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

fn ensure_instance(conn: &Connection, template_id: &str, date: &str) -> Result<(), String> {
    let skipped: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM skipped_task_dates WHERE template_id = ?1 AND date = ?2",
            params![template_id, date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if skipped > 0 {
        return Ok(());
    }
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM task_instances WHERE template_id = ?1 AND date = ?2",
            params![template_id, date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if n > 0 {
        return Ok(());
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO task_instances (id, template_id, date, completed) VALUES (?1, ?2, ?3, 0)",
        params![id, template_id, date],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn prune_instances_not_matching_days(conn: &Connection, template_id: &str, days: &[u8]) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, date FROM task_instances WHERE template_id = ?1")
        .map_err(|e| e.to_string())?;
    let pairs: Vec<(String, String)> = stmt
        .query_map([template_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for (iid, date_s) in pairs {
        if let Ok(d) = NaiveDate::parse_from_str(&date_s, "%Y-%m-%d") {
            let dow = weekday_num(d.weekday());
            if !days.contains(&dow) {
                conn.execute("DELETE FROM task_instances WHERE id = ?1", [&iid])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    prune_skipped_not_matching_days(conn, template_id, days)?;
    Ok(())
}

fn prune_skipped_not_matching_days(conn: &Connection, template_id: &str, days: &[u8]) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT date FROM skipped_task_dates WHERE template_id = ?1")
        .map_err(|e| e.to_string())?;
    let dates: Vec<String> = stmt
        .query_map([template_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for date_s in dates {
        if let Ok(d) = NaiveDate::parse_from_str(&date_s, "%Y-%m-%d") {
            let dow = weekday_num(d.weekday());
            if !days.contains(&dow) {
                conn.execute(
                    "DELETE FROM skipped_task_dates WHERE template_id = ?1 AND date = ?2",
                    params![template_id, date_s],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_tasks(state: State<DbState>) -> Result<Vec<TaskRule>, String> {
    with_conn(&state, |c| {
        let mut stmt = c
            .prepare(
                "SELECT id, title, days_of_week, COALESCE(description, ''), COALESCE(anchor_week_start, ''),
                        created_at, COALESCE(color, ?1)
                 FROM task_templates ORDER BY title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([db::DEFAULT_TASK_COLOR], |r| {
                let days_json: String = r.get(2)?;
                let dw = parse_days(&days_json).unwrap_or_default();
                Ok(TaskRule {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    days_of_week: dw,
                    description: r.get(3)?,
                    anchor_week_start: r.get(4)?,
                    created_at: r.get(5)?,
                    color: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn create_task(
    state: State<DbState>,
    title: String,
    days: Vec<u8>,
    color: String,
    description: String,
    anchor_week_start: String,
) -> Result<TaskRule, String> {
    with_conn(&state, |c| {
        if anchor_week_start.trim().is_empty() {
            return Err("anchor week is required".to_string());
        }
        let color_n = normalize_task_color(&color)?;
        let id = Uuid::new_v4().to_string();
        let created = db::now_iso();
        let days_json = serialize_days(&days)?;
        c.execute(
            "INSERT INTO task_templates (id, title, days_of_week, created_at, description, anchor_week_start, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, days_json, created, description, anchor_week_start, color_n],
        )
        .map_err(|e| e.to_string())?;
        Ok(TaskRule {
            id,
            title,
            days_of_week: days,
            description,
            anchor_week_start,
            created_at: created,
            color: color_n,
        })
    })
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: String,
    title: String,
    days: Vec<u8>,
    color: String,
    description: String,
    anchor_week_start: String,
) -> Result<TaskRule, String> {
    with_conn(&state, |c| {
        let color_n = normalize_task_color(&color)?;
        let anchor = if anchor_week_start.trim().is_empty() {
            let cur: String = c
                .query_row(
                    "SELECT COALESCE(anchor_week_start, '') FROM task_templates WHERE id = ?1",
                    [&id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if cur.trim().is_empty() {
                return Err("anchor week missing for task".to_string());
            }
            cur
        } else {
            anchor_week_start
        };
        let days_json = serialize_days(&days)?;
        let n = c
            .execute(
                "UPDATE task_templates SET title = ?2, days_of_week = ?3, description = ?4, anchor_week_start = ?5, color = ?6 WHERE id = ?1",
                params![id, title, days_json, description, anchor, color_n],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("task not found".to_string());
        }
        prune_instances_not_matching_days(c, &id, &days)?;
        let created_at: String = c
            .query_row("SELECT created_at FROM task_templates WHERE id = ?1", [&id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(TaskRule {
            id,
            title,
            days_of_week: days,
            description,
            anchor_week_start: anchor,
            created_at,
            color: color_n,
        })
    })
}

#[tauri::command]
pub fn update_task_title(state: State<DbState>, id: String, title: String) -> Result<TaskRule, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("title is required".to_string());
    }
    with_conn(&state, |c| {
        let n = c
            .execute(
                "UPDATE task_templates SET title = ?1 WHERE id = ?2",
                params![title, id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("task not found".to_string());
        }
        c.query_row(
            "SELECT id, title, days_of_week, COALESCE(description, ''), COALESCE(anchor_week_start, ''),
                    created_at, COALESCE(color, ?1) FROM task_templates WHERE id = ?2",
            params![db::DEFAULT_TASK_COLOR, id],
            |r| {
                let days_json: String = r.get(2)?;
                let dw = parse_days(&days_json).unwrap_or_default();
                Ok(TaskRule {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    days_of_week: dw,
                    description: r.get(3)?,
                    anchor_week_start: r.get(4)?,
                    created_at: r.get(5)?,
                    color: r.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

/// Order must match `PRESET_COLORS` in `src/lib/taskColors.ts`.
const PRESET_HEX: [&str; 4] = ["#2563EB", "#16A34A", "#CA8A04", "#DC2626"];

fn next_preset_hex_normalized(current: &str) -> Result<String, String> {
    let cur = normalize_task_color(current)?;
    let idx = PRESET_HEX.iter().position(|&h| h == cur.as_str());
    let next_i = idx.map(|i| (i + 1) % PRESET_HEX.len()).unwrap_or(0);
    Ok(PRESET_HEX[next_i].to_string())
}

#[tauri::command]
pub fn cycle_template_color(state: State<DbState>, template_id: String) -> Result<TaskRule, String> {
    with_conn(&state, |c| {
        let raw: String = c
            .query_row(
                "SELECT COALESCE(color, ?1) FROM task_templates WHERE id = ?2",
                params![db::DEFAULT_TASK_COLOR, template_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let next = next_preset_hex_normalized(&raw)?;
        let n = c
            .execute(
                "UPDATE task_templates SET color = ?1 WHERE id = ?2",
                params![next, template_id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("task not found".to_string());
        }
        c.query_row(
            "SELECT id, title, days_of_week, COALESCE(description, ''), COALESCE(anchor_week_start, ''),
                    created_at, COALESCE(color, ?1) FROM task_templates WHERE id = ?2",
            params![db::DEFAULT_TASK_COLOR, template_id],
            |r| {
                let days_json: String = r.get(2)?;
                let dw = parse_days(&days_json).unwrap_or_default();
                Ok(TaskRule {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    days_of_week: dw,
                    description: r.get(3)?,
                    anchor_week_start: r.get(4)?,
                    created_at: r.get(5)?,
                    color: r.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: String) -> Result<bool, String> {
    with_conn(&state, |c| {
        c.execute("DELETE FROM task_instances WHERE template_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        c.execute("DELETE FROM skipped_task_dates WHERE template_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        let n = c
            .execute("DELETE FROM task_templates WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
}

#[tauri::command]
pub fn remove_task_occurrence(state: State<DbState>, id: String) -> Result<(), String> {
    with_conn(&state, |c| {
        let row: Option<(String, String)> = c
            .query_row(
                "SELECT template_id, date FROM task_instances WHERE id = ?1",
                [&id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((tid, date)) = row else {
            return Err("instance not found".to_string());
        };
        c.execute("DELETE FROM task_instances WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        c.execute(
            "INSERT OR IGNORE INTO skipped_task_dates (template_id, date) VALUES (?1, ?2)",
            params![tid, date],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn toggle_task_complete(state: State<DbState>, id: String) -> Result<TaskInstanceDto, String> {
    with_conn(&state, |c| {
        let cur: i64 = c
            .query_row("SELECT completed FROM task_instances WHERE id = ?1", [&id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let next = if cur == 0 { 1 } else { 0 };
        c.execute(
            "UPDATE task_instances SET completed = ?1 WHERE id = ?2",
            params![next, id],
        )
        .map_err(|e| e.to_string())?;
        load_instance_dto(c, &id)
    })
}

fn load_instance_dto(c: &Connection, id: &str) -> Result<TaskInstanceDto, String> {
    c.query_row(
        "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed,
                COALESCE(tt.color, ?2), tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
         FROM task_instances ti
         JOIN task_templates tt ON tt.id = ti.template_id
         WHERE ti.id = ?1",
        params![id, db::DEFAULT_TASK_COLOR],
        instance_row_mapper,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tasks_for_date(state: State<DbState>, date: String) -> Result<Vec<TaskInstanceDto>, String> {
    with_conn(&state, |c| {
        let mut stmt = c
            .prepare("SELECT id, days_of_week, COALESCE(anchor_week_start, '') FROM task_templates")
            .map_err(|e| e.to_string())?;
        let templates: Vec<(String, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        let d_parse = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| e.to_string())?;
        let week_monday = monday_of_naive(d_parse);
        let week_monday_s = week_monday.format("%Y-%m-%d").to_string();
        let dow = weekday_num(d_parse.weekday());

        for (tid, days_json, anchor) in &templates {
            if !template_matches_week(anchor, &week_monday_s) {
                continue;
            }
            let days = parse_days(days_json)?;
            if days.contains(&dow) {
                ensure_instance(c, tid, &date)?;
            }
        }

        let mut stmt = c
            .prepare(
                "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed,
                        COALESCE(tt.color, ?3), tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
                 FROM task_instances ti
                 JOIN task_templates tt ON tt.id = ti.template_id
                 WHERE ti.date = ?1
                   AND tt.anchor_week_start = ?2
                 ORDER BY tt.title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![date, week_monday_s, db::DEFAULT_TASK_COLOR], instance_row_mapper)
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn get_reminder_settings(state: State<DbState>) -> Result<ReminderSettings, String> {
    with_conn(&state, |c| {
        let enabled = setting_get(c, "reminder_enabled")?.unwrap_or_else(|| "0".to_string()) == "1";
        let time = setting_get(c, "reminder_time")?.unwrap_or_else(|| "09:00".to_string());
        Ok(ReminderSettings { enabled, time })
    })
}

#[tauri::command]
pub fn set_reminder_settings(state: State<DbState>, enabled: bool, time: String) -> Result<ReminderSettings, String> {
    with_conn(&state, |c| {
        setting_set(c, "reminder_enabled", if enabled { "1" } else { "0" })?;
        setting_set(c, "reminder_time", &time)?;
        Ok(ReminderSettings { enabled, time })
    })
}

#[tauri::command]
pub fn get_preferred_task_color(state: State<DbState>) -> Result<String, String> {
    with_conn(&state, |c| {
        let raw = setting_get(c, "preferred_task_color")?
            .unwrap_or_else(|| db::DEFAULT_TASK_COLOR.to_string());
        Ok(normalize_task_color(&raw).unwrap_or_else(|_| db::DEFAULT_TASK_COLOR.to_string()))
    })
}

#[tauri::command]
pub fn set_preferred_task_color(state: State<DbState>, color: String) -> Result<String, String> {
    let n = normalize_task_color(&color)?;
    with_conn(&state, |c| {
        setting_set(c, "preferred_task_color", &n)?;
        Ok(n)
    })
}

#[tauri::command]
pub fn get_theme_mode(state: State<DbState>) -> Result<String, String> {
    with_conn(&state, |c| Ok(setting_get(c, "theme_mode")?.unwrap_or_else(|| "system".to_string())))
}

#[tauri::command]
pub fn set_theme_mode(state: State<DbState>, mode: String) -> Result<String, String> {
    if mode != "system" && mode != "light" && mode != "dark" {
        return Err("invalid theme mode".to_string());
    }
    with_conn(&state, |c| {
        setting_set(c, "theme_mode", &mode)?;
        Ok(mode)
    })
}

pub fn init_db_state(app: &tauri::AppHandle) -> DbState {
    let conn = open_connection(app).expect("db open");
    DbState(Mutex::new(conn))
}
