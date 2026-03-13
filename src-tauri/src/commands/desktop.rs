use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;

const DEFAULT_LOCAL_API_BASE: &str = "http://127.0.0.1:2027";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoSource {
    pub id: String,
    pub name: String,
    pub repo_url: String,
    pub description: Option<String>,
    pub repo_branch: Option<String>,
    pub skills_path: Option<String>,
    pub curated: bool,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub team_repo_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoSourceProbe {
    pub id: String,
    pub name: String,
    pub repo_url: String,
    pub repo_branch: Option<String>,
    pub skills_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BetaReleaseRequest {
    pub skill_id: Option<String>,
    pub version: String,
    pub release_id: Option<String>,
    pub skill_path: Option<String>,
    pub requested_by: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromoteStableRequest {
    pub skill_id: String,
    pub version: String,
    pub release_id: String,
    pub requested_by: String,
    pub is_owner: bool,
    pub evidence: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillRequest {
    pub skill_id: String,
    pub source_id: String,
    pub channel: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallLocalSkillForProviderRequest {
    pub target_provider: String,
    pub seed_source_id: String,
    pub seed_skill_id: String,
    pub skill_id: Option<String>,
    pub name: Option<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub install_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReachability {
    pub reachable: bool,
    pub reason: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct GuardedResponseError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiRoute {
    pub method: &'static str,
    pub path: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiHealth {
    pub status: String,
    pub ready: bool,
    pub local_api: serde_json::Value,
}

fn guarded_error(code: &str, message: &str) -> GuardedResponseError {
    GuardedResponseError {
        code: code.to_string(),
        message: message.to_string(),
    }
}

fn local_api_base() -> String {
    std::env::var("SkillDock_LOCAL_API_BASE").unwrap_or_else(|_| DEFAULT_LOCAL_API_BASE.to_string())
}

fn local_api_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(Client::new)
}

fn route_to_local_api(route: LocalApiRoute, payload: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "localApiBase": local_api_base(),
        "route": route,
        "payload": payload
    })
}

async fn request_local_api(
    method: Method,
    path: &'static str,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, GuardedResponseError> {
    request_local_api_with_timeout(method, path, payload, 12).await
}

async fn request_local_api_with_timeout(
    method: Method,
    path: &'static str,
    payload: Option<serde_json::Value>,
    timeout_secs: u64,
) -> Result<serde_json::Value, GuardedResponseError> {
    let url = format!("{}{}", local_api_base(), path);

    let mut request = local_api_client()
        .request(method, &url)
        .timeout(Duration::from_secs(timeout_secs));
    if let Some(body) = payload {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|error| {
        let message = if error.is_timeout() {
            format!("Local API request timed out after {timeout_secs}s: {url}")
        } else {
            format!("Local API request failed: {error}")
        };
        guarded_error(
            "NETWORK_ERROR",
            &message,
        )
    })?;

    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Failed to read local API response: {error}"),
        )
    })?;

    let body = serde_json::from_str::<serde_json::Value>(&raw)
        .unwrap_or_else(|_| serde_json::json!({ "message": raw }));

    if !status.is_success() {
        let code = body
            .get("code")
            .and_then(|value| value.as_str())
            .unwrap_or(match status.as_u16() {
                403 => "OWNER_ONLY",
                409 => "OFFLINE_BLOCKED",
                422 => "VALIDATION_ERROR",
                _ => "UNKNOWN",
            });
        let message = body
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("Local API request failed");
        return Err(guarded_error(code, message));
    }

    Ok(body)
}

#[tauri::command]
pub async fn list_repo_sources() -> Result<Vec<RepoSource>, GuardedResponseError> {
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "GET",
            path: "/api/settings/skills/sources",
        },
        serde_json::json!({}),
    );

    let response = request_local_api(Method::GET, "/api/settings/skills/sources", None).await?;
    serde_json::from_value(response).map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Invalid response payload for list_repo_sources: {error}"),
        )
    })
}

#[tauri::command]
pub async fn get_general_settings() -> Result<GeneralSettings, GuardedResponseError> {
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "GET",
            path: "/api/settings/general",
        },
        serde_json::json!({}),
    );

    let response = request_local_api(Method::GET, "/api/settings/general", None).await?;
    serde_json::from_value(response).map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Invalid response payload for get_general_settings: {error}"),
        )
    })
}

#[tauri::command]
pub async fn local_api_health() -> Result<LocalApiHealth, GuardedResponseError> {
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "GET",
            path: "/api/health",
        },
        serde_json::json!({}),
    );

    let response = request_local_api(Method::GET, "/api/health", None).await?;
    Ok(LocalApiHealth {
        status: response
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string(),
        ready: response
            .get("ready")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        local_api: response,
    })
}

#[tauri::command]
pub async fn update_general_settings(
    settings: GeneralSettings,
) -> Result<GeneralSettings, GuardedResponseError> {
    if settings.team_repo_url.trim().is_empty() {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "teamRepoUrl is required",
        ));
    }

    let payload = serde_json::json!({ "settings": settings });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "PUT",
            path: "/api/settings/general",
        },
        payload.clone(),
    );

    let response = request_local_api(Method::PUT, "/api/settings/general", Some(payload)).await?;
    serde_json::from_value(response).map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Invalid response payload for update_general_settings: {error}"),
        )
    })
}

#[tauri::command]
pub async fn check_repo_source(source: RepoSourceProbe) -> Result<SourceReachability, GuardedResponseError> {
    if source.id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "source id is required"));
    }
    if source.name.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "source name is required"));
    }
    if !source.repo_url.starts_with("https://") {
        return Ok(SourceReachability {
            reachable: false,
            reason: Some("Source URL must use HTTPS".to_string()),
        });
    }

    let response = local_api_client()
        .head(&source.repo_url)
        .timeout(Duration::from_secs(8))
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() || resp.status().is_redirection() => Ok(SourceReachability {
            reachable: true,
            reason: None,
        }),
        Ok(resp) => Ok(SourceReachability {
            reachable: false,
            reason: Some(format!("Repository source is unreachable (status: {})", resp.status())),
        }),
        Err(error) => Ok(SourceReachability {
            reachable: false,
            reason: Some(format!("Repository source is unreachable ({error})")),
        }),
    }
}

#[tauri::command]
pub async fn upsert_repo_source(source: RepoSource) -> Result<RepoSource, GuardedResponseError> {
    if source.id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "source id is required"));
    }

    if source.name.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "source name is required"));
    }

    let payload = serde_json::json!({ "source": source });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "PUT",
            path: "/api/settings/skills/sources",
        },
        payload.clone(),
    );

    let response = request_local_api(
        Method::PUT,
        "/api/settings/skills/sources",
        Some(payload),
    )
    .await?;
    serde_json::from_value(response).map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Invalid response payload for upsert_repo_source: {error}"),
        )
    })
}

#[tauri::command]
pub async fn delete_repo_source(source_id: String) -> Result<(), GuardedResponseError> {
    if source_id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "source id is required"));
    }

    let payload = serde_json::json!({ "sourceId": source_id });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "DELETE",
            path: "/api/settings/skills/sources",
        },
        payload.clone(),
    );
    let _ = request_local_api(
        Method::DELETE,
        "/api/settings/skills/sources",
        Some(payload),
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn sync_market_index(source_ids: Vec<String>) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "sourceIds": source_ids });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/market/sync",
        },
        payload.clone(),
    );

    request_local_api(Method::POST, "/api/market/sync", Some(payload)).await
}

#[tauri::command]
pub async fn get_market_skills(source_ids: Vec<String>) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "sourceIds": source_ids });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/market/skills",
        },
        payload.clone(),
    );

    request_local_api(Method::POST, "/api/market/skills", Some(payload)).await
}

#[tauri::command]
pub async fn install_market_skill(
    request: InstallSkillRequest,
) -> Result<serde_json::Value, GuardedResponseError> {
    if request.skill_id.trim().is_empty() || request.source_id.trim().is_empty() {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "skillId/sourceId are required",
        ));
    }

    if request.channel != "stable" && request.channel != "beta" {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "channel must be stable or beta",
        ));
    }

    let payload = serde_json::json!({ "request": request.clone() });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/market/install",
        },
        payload.clone(),
    );

    request_local_api(Method::POST, "/api/market/install", Some(payload)).await
}

#[tauri::command]
pub async fn list_local_skills() -> Result<serde_json::Value, GuardedResponseError> {
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "GET",
            path: "/api/local/skills",
        },
        serde_json::json!({}),
    );

    request_local_api(Method::GET, "/api/local/skills", None).await
}

#[tauri::command]
pub async fn remove_local_skill_record(
    source_id: String,
    skill_id: String,
) -> Result<serde_json::Value, GuardedResponseError> {
    if source_id.trim().is_empty() || skill_id.trim().is_empty() {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "sourceId/skillId are required",
        ));
    }

    let payload = serde_json::json!({
        "sourceId": source_id,
        "skillId": skill_id
    });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "DELETE",
            path: "/api/local/skills",
        },
        payload.clone(),
    );

    request_local_api(Method::DELETE, "/api/local/skills", Some(payload)).await
}

#[tauri::command]
pub async fn install_local_skill_for_provider(
    request: InstallLocalSkillForProviderRequest,
) -> Result<serde_json::Value, GuardedResponseError> {
    if request.seed_source_id.trim().is_empty() || request.seed_skill_id.trim().is_empty() {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "seedSourceId/seedSkillId are required",
        ));
    }
    if request.target_provider != "Claude"
        && request.target_provider != "Codex"
        && request.target_provider != "Cursor"
    {
        return Err(guarded_error(
            "VALIDATION_ERROR",
            "targetProvider must be Claude, Codex or Cursor",
        ));
    }

    let payload = serde_json::json!({ "request": request.clone() });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/local/skills/provider/install",
        },
        payload.clone(),
    );

    request_local_api(Method::POST, "/api/local/skills/provider/install", Some(payload)).await
}

#[tauri::command]
pub async fn scan_local_skills_from_disk() -> Result<serde_json::Value, GuardedResponseError> {
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/local/skills/scan",
        },
        serde_json::json!({}),
    );

    request_local_api(Method::POST, "/api/local/skills/scan", Some(serde_json::json!({}))).await
}

#[tauri::command]
pub async fn pick_skill_folder() -> Result<Option<String>, GuardedResponseError> {
    let selected = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Select Skill Folder")
            .pick_folder()
            .map(|path| path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| guarded_error("UNKNOWN", &format!("Failed to pick folder: {error}")))?;

    Ok(selected)
}

#[tauri::command]
pub async fn dry_run_beta_release(
    request: BetaReleaseRequest,
) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "request": request.clone() });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/release/beta/dry-run",
        },
        payload.clone(),
    );

    request_local_api_with_timeout(Method::POST, "/api/release/beta/dry-run", Some(payload), 120).await
}

#[tauri::command]
pub async fn create_beta_release_pr(
    request: BetaReleaseRequest,
) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "request": request.clone() });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/release/beta/create-pr",
        },
        payload.clone(),
    );

    request_local_api_with_timeout(Method::POST, "/api/release/beta/create-pr", Some(payload), 120).await
}

#[tauri::command]
pub async fn create_promote_stable_pr(
    request: PromoteStableRequest,
) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "request": request.clone() });
    let _routed = route_to_local_api(
        LocalApiRoute {
            method: "POST",
            path: "/api/release/stable/create-pr",
        },
        payload.clone(),
    );

    request_local_api_with_timeout(Method::POST, "/api/release/stable/create-pr", Some(payload), 120).await
}

/* ── LLM Provider Commands ───────────────────────────────────── */

async fn request_local_api_dynamic(
    method: Method,
    path: &str,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, GuardedResponseError> {
    request_local_api_dynamic_with_timeout(method, path, payload, 12).await
}

async fn request_local_api_dynamic_with_timeout(
    method: Method,
    path: &str,
    payload: Option<serde_json::Value>,
    timeout_secs: u64,
) -> Result<serde_json::Value, GuardedResponseError> {
    let url = format!("{}{}", local_api_base(), path);

    let mut request = local_api_client()
        .request(method, &url)
        .timeout(Duration::from_secs(timeout_secs));
    if let Some(body) = payload {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|error| {
        let message = if error.is_timeout() {
            format!("Local API request timed out after {timeout_secs}s: {url}")
        } else {
            format!("Local API request failed: {error}")
        };
        guarded_error("NETWORK_ERROR", &message)
    })?;

    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        guarded_error(
            "UNKNOWN",
            &format!("Failed to read local API response: {error}"),
        )
    })?;

    let body = serde_json::from_str::<serde_json::Value>(&raw)
        .unwrap_or_else(|_| serde_json::json!({ "message": raw }));

    if !status.is_success() {
        let code = body
            .get("code")
            .and_then(|value| value.as_str())
            .unwrap_or(match status.as_u16() {
                403 => "OWNER_ONLY",
                409 => "OFFLINE_BLOCKED",
                422 => "VALIDATION_ERROR",
                _ => "UNKNOWN",
            });
        let message = body
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("Local API request failed");
        return Err(guarded_error(code, message));
    }

    Ok(body)
}

#[tauri::command]
pub async fn get_llm_providers() -> Result<serde_json::Value, GuardedResponseError> {
    request_local_api(Method::GET, "/api/settings/llm/providers", None).await
}

#[tauri::command]
pub async fn add_llm_provider(
    provider: serde_json::Value,
) -> Result<serde_json::Value, GuardedResponseError> {
    let payload = serde_json::json!({ "provider": provider });
    request_local_api(Method::POST, "/api/settings/llm/providers", Some(payload)).await
}

#[tauri::command]
pub async fn update_llm_provider(
    id: String,
    updates: serde_json::Value,
) -> Result<serde_json::Value, GuardedResponseError> {
    if id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "provider id is required"));
    }
    let path = format!("/api/settings/llm/providers/{}", id);
    let payload = serde_json::json!({ "updates": updates });
    request_local_api_dynamic(Method::PUT, &path, Some(payload)).await
}

#[tauri::command]
pub async fn delete_llm_provider(
    id: String,
) -> Result<serde_json::Value, GuardedResponseError> {
    if id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "provider id is required"));
    }
    let path = format!("/api/settings/llm/providers/{}", id);
    request_local_api_dynamic(Method::DELETE, &path, None).await
}

#[tauri::command]
pub async fn activate_llm_provider(
    id: String,
) -> Result<serde_json::Value, GuardedResponseError> {
    if id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "provider id is required"));
    }
    let path = format!("/api/settings/llm/providers/{}/activate", id);
    request_local_api_dynamic(Method::POST, &path, Some(serde_json::json!({}))).await
}

#[tauri::command]
pub async fn test_llm_provider(
    id: String,
) -> Result<serde_json::Value, GuardedResponseError> {
    if id.trim().is_empty() {
        return Err(guarded_error("VALIDATION_ERROR", "provider id is required"));
    }
    let path = format!("/api/settings/llm/providers/{}/test", id);
    request_local_api_dynamic_with_timeout(Method::POST, &path, Some(serde_json::json!({})), 30).await
}
