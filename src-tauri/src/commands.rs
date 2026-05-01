use crate::db::{self, monday_of_naive, open_connection, setting_get, setting_set};
use crate::models::{
    NewPropertyOptionInput, PropertyDisplaySettings, PropertyOptionDto, PropertySchemaDto,
    ReminderSettings, TaskInstanceDto, TaskRule,
};
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rusqlite::{params, Connection};
use std::collections::HashMap;
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

fn parse_properties(json: &str) -> Result<HashMap<String, String>, String> {
    if json.trim().is_empty() {
        return Ok(HashMap::new());
    }
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn serialize_properties(map: &HashMap<String, String>) -> Result<String, String> {
    serde_json::to_string(map).map_err(|e| e.to_string())
}

fn template_matches_week(anchor_week_start: &str, request_week_monday: &str) -> bool {
    anchor_week_start.is_empty() || anchor_week_start == request_week_monday
}

fn with_conn<T, F: FnOnce(&Connection) -> Result<T, String>>(state: &DbState, f: F) -> Result<T, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    f(&guard)
}

fn instance_row_mapper(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskInstanceDto> {
    let props: String = r.get(5)?;
    let props_map = parse_properties(&props).unwrap_or_default();
    let days_json: String = r.get(8)?;
    let dw = parse_days(&days_json).unwrap_or_default();
    Ok(TaskInstanceDto {
        id: r.get(0)?,
        template_id: r.get(1)?,
        template_title: r.get(2)?,
        date: r.get(3)?,
        completed: r.get::<_, i64>(4)? != 0,
        properties: props_map,
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
                "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed, ti.properties,
                        tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
                 FROM task_instances ti
                 JOIN task_templates tt ON tt.id = ti.template_id
                 WHERE ti.date >= ?1 AND ti.date <= ?2
                   AND (COALESCE(tt.anchor_week_start, '') = '' OR tt.anchor_week_start = ?3)
                 ORDER BY ti.date, tt.title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![week_start, end_s, week_start], instance_row_mapper)
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

fn ensure_instance(conn: &Connection, template_id: &str, date: &str) -> Result<(), String> {
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
    let defaults_json: String = conn
        .query_row(
            "SELECT COALESCE(default_properties, '{}') FROM task_templates WHERE id = ?1",
            [template_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO task_instances (id, template_id, date, completed, properties) VALUES (?1, ?2, ?3, 0, ?4)",
        params![id, template_id, date, defaults_json],
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
    Ok(())
}

#[tauri::command]
pub fn list_tasks(state: State<DbState>) -> Result<Vec<TaskRule>, String> {
    with_conn(&state, |c| {
        let mut stmt = c
            .prepare(
                "SELECT id, title, days_of_week, COALESCE(default_properties, '{}'),
                        COALESCE(description, ''), COALESCE(anchor_week_start, ''), created_at
                 FROM task_templates ORDER BY title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let days_json: String = r.get(2)?;
                let dw = parse_days(&days_json).unwrap_or_default();
                let def = r.get::<_, String>(3)?;
                let dp = parse_properties(&def).unwrap_or_default();
                Ok(TaskRule {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    days_of_week: dw,
                    default_properties: dp,
                    description: r.get(4)?,
                    anchor_week_start: r.get(5)?,
                    created_at: r.get(6)?,
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
    default_properties: HashMap<String, String>,
    description: String,
    anchor_week_start: String,
) -> Result<TaskRule, String> {
    with_conn(&state, |c| {
        let id = Uuid::new_v4().to_string();
        let created = db::now_iso();
        let days_json = serialize_days(&days)?;
        let def_json = serialize_properties(&default_properties)?;
        c.execute(
            "INSERT INTO task_templates (id, title, days_of_week, property_schema_id, created_at, default_properties, description, anchor_week_start) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7)",
            params![id, title, days_json, created, def_json, description, anchor_week_start],
        )
        .map_err(|e| e.to_string())?;
        Ok(TaskRule {
            id,
            title,
            days_of_week: days,
            default_properties,
            description,
            anchor_week_start,
            created_at: created,
        })
    })
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: String,
    title: String,
    days: Vec<u8>,
    default_properties: HashMap<String, String>,
    description: String,
    anchor_week_start: String,
) -> Result<TaskRule, String> {
    with_conn(&state, |c| {
        let days_json = serialize_days(&days)?;
        let def_json = serialize_properties(&default_properties)?;
        let n = c
            .execute(
                "UPDATE task_templates SET title = ?2, days_of_week = ?3, property_schema_id = NULL, default_properties = ?4, description = ?5, anchor_week_start = ?6 WHERE id = ?1",
                params![id, title, days_json, def_json, description, anchor_week_start],
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
            default_properties,
            description,
            anchor_week_start,
            created_at,
        })
    })
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: String) -> Result<bool, String> {
    with_conn(&state, |c| {
        c.execute("DELETE FROM task_instances WHERE template_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        let n = c
            .execute("DELETE FROM task_templates WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
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

#[tauri::command]
pub fn set_task_property(
    state: State<DbState>,
    id: String,
    key: String,
    value: String,
) -> Result<TaskInstanceDto, String> {
    with_conn(&state, |c| {
        let props_json: String = c
            .query_row("SELECT properties FROM task_instances WHERE id = ?1", [&id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut map = parse_properties(&props_json)?;
        map.insert(key, value);
        let ser = serialize_properties(&map)?;
        c.execute(
            "UPDATE task_instances SET properties = ?1 WHERE id = ?2",
            params![ser, id],
        )
        .map_err(|e| e.to_string())?;
        load_instance_dto(c, &id)
    })
}

fn load_instance_dto(c: &Connection, id: &str) -> Result<TaskInstanceDto, String> {
    c.query_row(
        "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed, ti.properties,
                tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
         FROM task_instances ti
         JOIN task_templates tt ON tt.id = ti.template_id
         WHERE ti.id = ?1",
        [id],
        instance_row_mapper,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_property_schemas(state: State<DbState>) -> Result<Vec<PropertySchemaDto>, String> {
    with_conn(&state, |c| {
        let mut stmt = c
            .prepare("SELECT id, name FROM property_schemas ORDER BY name")
            .map_err(|e| e.to_string())?;
        let schemas: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for (sid, name) in schemas {
            let mut ostmt = c
                .prepare(
                    "SELECT id, schema_id, value, label, color FROM property_options WHERE schema_id = ?1 ORDER BY label",
                )
                .map_err(|e| e.to_string())?;
            let opts = ostmt
                .query_map([&sid], |r| {
                    Ok(PropertyOptionDto {
                        id: r.get(0)?,
                        schema_id: r.get(1)?,
                        value: r.get(2)?,
                        label: r.get(3)?,
                        color: r.get(4)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            out.push(PropertySchemaDto {
                id: sid.clone(),
                name,
                schema_type: "enum".to_string(),
                options: opts,
            });
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn create_property_schema(
    state: State<DbState>,
    name: String,
    options: Vec<NewPropertyOptionInput>,
) -> Result<PropertySchemaDto, String> {
    with_conn(&state, |c| {
        let sid = Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO property_schemas (id, name) VALUES (?1, ?2)",
            params![sid, name],
        )
        .map_err(|e| e.to_string())?;

        let mut opts_out = Vec::new();
        for o in options {
            let oid = Uuid::new_v4().to_string();
            c.execute(
                "INSERT INTO property_options (id, schema_id, value, label, color) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![oid, sid, o.value, o.label, o.color],
            )
            .map_err(|e| e.to_string())?;
            opts_out.push(PropertyOptionDto {
                id: oid,
                schema_id: sid.clone(),
                value: o.value,
                label: o.label,
                color: o.color,
            });
        }

        Ok(PropertySchemaDto {
            id: sid.clone(),
            name,
            schema_type: "enum".to_string(),
            options: opts_out,
        })
    })
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
                "SELECT ti.id, ti.template_id, tt.title, ti.date, ti.completed, ti.properties,
                        tt.description, COALESCE(tt.anchor_week_start, ''), tt.days_of_week
                 FROM task_instances ti
                 JOIN task_templates tt ON tt.id = ti.template_id
                 WHERE ti.date = ?1
                   AND (COALESCE(tt.anchor_week_start, '') = '' OR tt.anchor_week_start = ?2)
                 ORDER BY tt.title",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![date, week_monday_s], instance_row_mapper)
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
pub fn get_property_display_settings(state: State<DbState>) -> Result<PropertyDisplaySettings, String> {
    with_conn(&state, |c| {
        let raw = setting_get(c, "hidden_property_schema_ids")?.unwrap_or_else(|| "[]".to_string());
        let hidden_schema_ids: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
        Ok(PropertyDisplaySettings { hidden_schema_ids })
    })
}

#[tauri::command]
pub fn set_property_display_settings(
    state: State<DbState>,
    hidden_schema_ids: Vec<String>,
) -> Result<PropertyDisplaySettings, String> {
    with_conn(&state, |c| {
        let raw = serde_json::to_string(&hidden_schema_ids).map_err(|e| e.to_string())?;
        setting_set(c, "hidden_property_schema_ids", &raw)?;
        Ok(PropertyDisplaySettings { hidden_schema_ids })
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

#[tauri::command]
pub fn delete_property_schema(state: State<DbState>, id: String) -> Result<bool, String> {
    with_conn(&state, |c| {
        let mut stmt = c
            .prepare("SELECT id, COALESCE(default_properties, '{}') FROM task_templates")
            .map_err(|e| e.to_string())?;
        let trows: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        for (tid, dj) in trows {
            let mut m = parse_properties(&dj)?;
            if m.remove(&id).is_some() {
                let s = serialize_properties(&m)?;
                c.execute(
                    "UPDATE task_templates SET default_properties = ?1 WHERE id = ?2",
                    params![s, tid],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        let mut stmt = c
            .prepare("SELECT id, COALESCE(properties, '{}') FROM task_instances")
            .map_err(|e| e.to_string())?;
        let irows: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        for (iid, pj) in irows {
            let mut m = parse_properties(&pj)?;
            if m.remove(&id).is_some() {
                let s = serialize_properties(&m)?;
                c.execute(
                    "UPDATE task_instances SET properties = ?1 WHERE id = ?2",
                    params![s, iid],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        let n = c
            .execute("DELETE FROM property_schemas WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
}

pub fn init_db_state(app: &tauri::AppHandle) -> DbState {
    let conn = open_connection(app).expect("db open");
    DbState(Mutex::new(conn))
}
