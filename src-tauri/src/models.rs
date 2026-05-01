use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRule {
    pub id: String,
    pub title: String,
    pub days_of_week: Vec<u8>,
    pub default_properties: HashMap<String, String>,
    pub description: String,
    pub anchor_week_start: String,
    pub created_at: String,
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
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyOptionDto {
    pub id: String,
    pub schema_id: String,
    pub value: String,
    pub label: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertySchemaDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schema_type: String,
    pub options: Vec<PropertyOptionDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPropertyOptionInput {
    pub value: String,
    pub label: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSettings {
    pub enabled: bool,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyDisplaySettings {
    /// Schemas hidden in task rows. Empty = show all columns
    pub hidden_schema_ids: Vec<String>,
}
