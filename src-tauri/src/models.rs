use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRule {
    pub id: String,
    pub title: String,
    pub days_of_week: Vec<u8>,
    pub description: String,
    pub anchor_week_start: String,
    pub created_at: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInstanceDto {
    pub id: String,
    pub template_id: String,
    pub template_title: String,
    pub template_description: String,
    pub template_days_of_week: Vec<u8>,
    pub anchor_week_start: String,
    pub date: String,
    pub completed: bool,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSettings {
    pub enabled: bool,
    pub time: String,
}
