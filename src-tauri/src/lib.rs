mod commands;
mod db;
mod models;
mod tray;

use chrono::{Datelike, Duration as ChronoDuration, Local};
use commands::{DbState, init_db_state};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state = init_db_state(app.handle());
            app.manage(state);

            tray::setup_tray(app.handle()).expect("tray");

            let reminder_app = app.handle().clone();
            std::thread::spawn(move || {
                let last_day: Mutex<Option<String>> = Mutex::new(None);
                loop {
                    std::thread::sleep(Duration::from_secs(60));
                    if let Some(state) = reminder_app.try_state::<DbState>() {
                        let conn = match state.0.lock() {
                            Ok(g) => g,
                            Err(_) => continue,
                        };
                        let enabled = crate::db::setting_get(&conn, "reminder_enabled")
                            .ok()
                            .flatten()
                            .unwrap_or_else(|| "0".into())
                            == "1";
                        if !enabled {
                            continue;
                        }
                        let time_str = crate::db::setting_get(&conn, "reminder_time")
                            .ok()
                            .flatten()
                            .unwrap_or_else(|| "09:00".into());
                        let now = Local::now();
                        let today_str = now.format("%Y-%m-%d").to_string();
                        let cur_hm = now.format("%H:%M").to_string();
                        if cur_hm != time_str {
                            continue;
                        }
                        let mut guard = last_day.lock().unwrap();
                        if guard.as_ref() == Some(&today_str) {
                            continue;
                        }
                        let today_naive = Local::now().date_naive();
                        let monday =
                            today_naive - ChronoDuration::days(today_naive.weekday().num_days_from_monday() as i64);
                        let monday_str = monday.format("%Y-%m-%d").to_string();
                        let pending: i64 = conn
                            .query_row(
                                "SELECT COUNT(*) FROM task_instances ti
                                 JOIN task_templates tt ON tt.id = ti.template_id
                                 WHERE ti.date = ?1 AND ti.completed = 0
                                   AND tt.anchor_week_start = ?2",
                                [&today_str, &monday_str],
                                |r| r.get(0),
                            )
                            .unwrap_or(0);
                        drop(conn);
                        drop(state);
                        let _ = reminder_app
                            .notification()
                            .builder()
                            .title("Tasks today")
                            .body(format!("{pending} pending"))
                            .show();
                        *guard = Some(today_str);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks_for_week,
            commands::get_tasks_for_date,
            commands::list_tasks,
            commands::create_task,
            commands::update_task,
            commands::update_task_title,
            commands::delete_task,
            commands::remove_task_occurrence,
            commands::toggle_task_complete,
            commands::get_preferred_task_color,
            commands::set_preferred_task_color,
            commands::get_reminder_settings,
            commands::set_reminder_settings,
            commands::get_theme_mode,
            commands::set_theme_mode,
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
