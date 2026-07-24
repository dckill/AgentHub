use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const CREDENTIAL_SERVICE: &str = "com.artsum.agenthub";
const CREDENTIAL_ACCOUNT: &str = "auth_credentials.v1";

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct AuthCredentials {
  token: String,
  secret: String,
}

struct CredentialStore {
  access: Mutex<()>,
}

fn credential_entry() -> Result<Entry, String> {
  Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
    .map_err(|_| "credential_store_unavailable".to_owned())
}

#[tauri::command]
fn credential_get(store: State<'_, CredentialStore>) -> Result<Option<AuthCredentials>, String> {
  let _guard = store
    .access
    .lock()
    .map_err(|_| "credential_store_lock_failed".to_owned())?;
  let entry = credential_entry()?;

  match entry.get_password() {
    Ok(value) => serde_json::from_str(&value)
      .map(Some)
      .map_err(|_| "credential_payload_invalid".to_owned()),
    Err(KeyringError::NoEntry) => Ok(None),
    Err(_) => Err("credential_read_failed".to_owned()),
  }
}

#[tauri::command]
fn credential_set(
  store: State<'_, CredentialStore>,
  credentials: AuthCredentials,
) -> Result<(), String> {
  if credentials.token.is_empty() || credentials.secret.is_empty() {
    return Err("credential_payload_invalid".to_owned());
  }

  let _guard = store
    .access
    .lock()
    .map_err(|_| "credential_store_lock_failed".to_owned())?;
  let serialized = serde_json::to_string(&credentials)
    .map_err(|_| "credential_payload_invalid".to_owned())?;
  credential_entry()?
    .set_password(&serialized)
    .map_err(|_| "credential_write_failed".to_owned())
}

#[tauri::command]
fn credential_remove(store: State<'_, CredentialStore>) -> Result<(), String> {
  let _guard = store
    .access
    .lock()
    .map_err(|_| "credential_store_lock_failed".to_owned())?;
  let entry = credential_entry()?;

  match entry.delete_credential() {
    Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
    Err(_) => Err("credential_delete_failed".to_owned()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(CredentialStore {
      access: Mutex::new(()),
    })
    .invoke_handler(tauri::generate_handler![
      credential_get,
      credential_set,
      credential_remove
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
