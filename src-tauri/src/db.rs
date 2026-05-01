use chrono::{Datelike, Duration, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;
use tauri::Manager;

pub fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("fast-todo.db");
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS task_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            days_of_week TEXT NOT NULL,
            property_schema_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_instances (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            date TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            properties TEXT NOT NULL DEFAULT '{}',
            UNIQUE(template_id, date),
            FOREIGN KEY(template_id) REFERENCES task_templates(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS property_schemas (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS property_options (
            id TEXT PRIMARY KEY,
            schema_id TEXT NOT NULL,
            value TEXT NOT NULL,
            label TEXT NOT NULL,
            color TEXT NOT NULL,
            FOREIGN KEY(schema_id) REFERENCES property_schemas(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| e.to_string())?;
    migrate_task_templates(&conn)?;
    migrate_skipped_task_dates(&conn)?;
    ensure_single_week_anchor_semantics(&conn)?;
    Ok(conn)
}

fn ensure_single_week_anchor_semantics(conn: &Connection) -> Result<(), String> {
    use chrono::DateTime;

    if setting_get(conn, "single_week_anchor_done")?.is_some() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare("SELECT id, COALESCE(anchor_week_start, ''), created_at FROM task_templates")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for (id, anchor_raw, created_at) in rows {
        let anchor_final: String = if !anchor_raw.trim().is_empty() {
            anchor_raw.trim().to_string()
        } else {
            let min_d: Option<String> = conn
                .query_row(
                    "SELECT MIN(date) FROM task_instances WHERE template_id = ?1",
                    [&id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .map_err(|e| e.to_string())?;
            let from_instances = min_d
                .filter(|s| !s.is_empty())
                .and_then(|ds| NaiveDate::parse_from_str(&ds, "%Y-%m-%d").ok())
                .map(|d| monday_of_naive(d).format("%Y-%m-%d").to_string());
            let from_created = DateTime::parse_from_rfc3339(created_at.trim())
                .ok()
                .map(|dt| monday_of_naive(dt.date_naive()).format("%Y-%m-%d").to_string());
            from_instances
                .or(from_created)
                .unwrap_or_default()
        };

        if anchor_final.is_empty() {
            continue;
        }

        if anchor_raw.trim().is_empty() {
            conn.execute(
                "UPDATE task_templates SET anchor_week_start = ?1 WHERE id = ?2",
                params![&anchor_final, &id],
            )
            .map_err(|e| e.to_string())?;
        }

        let mut istmt = conn
            .prepare("SELECT id, date FROM task_instances WHERE template_id = ?1")
            .map_err(|e| e.to_string())?;
        let insts: Vec<(String, String)> = istmt
            .query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        for (iid, ds) in insts {
            if let Ok(d) = NaiveDate::parse_from_str(&ds, "%Y-%m-%d") {
                let mon = monday_of_naive(d).format("%Y-%m-%d").to_string();
                if mon != anchor_final {
                    conn.execute("DELETE FROM task_instances WHERE id = ?1", [&iid])
                        .map_err(|e| e.to_string())?;
                }
            }
        }

        let mut sstmt = conn
            .prepare("SELECT date FROM skipped_task_dates WHERE template_id = ?1")
            .map_err(|e| e.to_string())?;
        let skips: Vec<String> = sstmt
            .query_map([&id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        for ds in skips {
            if let Ok(d) = NaiveDate::parse_from_str(&ds, "%Y-%m-%d") {
                let mon = monday_of_naive(d).format("%Y-%m-%d").to_string();
                if mon != anchor_final {
                    conn.execute(
                        "DELETE FROM skipped_task_dates WHERE template_id = ?1 AND date = ?2",
                        params![&id, ds],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    setting_set(conn, "single_week_anchor_done", "1")?;
    Ok(())
}

fn column_missing(conn: &Connection, table: &str, name: &str) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
            [name],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n == 0)
}

fn add_column(conn: &Connection, table: &str, name: &str, sql_type_default: &str) -> Result<(), String> {
    if column_missing(conn, table, name)? {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {name} {sql_type_default}"),
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn monday_of_naive(d: NaiveDate) -> NaiveDate {
    d - Duration::days(i64::from(d.weekday().num_days_from_monday()))
}

fn backfill_anchor_week_starts(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id FROM task_templates")
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    for id in ids {
        let min_d: Option<String> = conn
            .query_row(
                "SELECT MIN(date) FROM task_instances WHERE template_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(ds) = min_d else { continue };
        if ds.is_empty() {
            continue;
        }
        let Ok(d) = NaiveDate::parse_from_str(&ds, "%Y-%m-%d") else {
            continue;
        };
        let mon = monday_of_naive(d);
        let mon_s = mon.format("%Y-%m-%d").to_string();
        conn.execute(
            "UPDATE task_templates SET anchor_week_start = ?1 WHERE id = ?2",
            params![mon_s, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn migrate_task_templates(conn: &Connection) -> Result<(), String> {
    if column_missing(conn, "task_templates", "default_properties")? {
        conn.execute(
            "ALTER TABLE task_templates ADD COLUMN default_properties TEXT NOT NULL DEFAULT '{}'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    add_column(
        conn,
        "task_templates",
        "description",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_column(
        conn,
        "task_templates",
        "anchor_week_start",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    if setting_get(conn, "anchor_backfill_done")?.is_none() {
        backfill_anchor_week_starts(conn)?;
        setting_set(conn, "anchor_backfill_done", "1")?;
    }
    Ok(())
}

fn migrate_skipped_task_dates(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS skipped_task_dates (
            template_id TEXT NOT NULL,
            date TEXT NOT NULL,
            PRIMARY KEY (template_id, date),
            FOREIGN KEY(template_id) REFERENCES task_templates(id) ON DELETE CASCADE
        );
        "#,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn setting_get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn setting_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
