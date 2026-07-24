use keyring::{Entry, Error as KeyringError};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const TEST_NAME: &str = "stores_reads_and_deletes_credentials_in_the_os_keyring";
const PAYLOAD: &str = r#"{"token":"roundtrip-token","secret":"roundtrip-secret"}"#;

fn run_phase(service: &str, phase: &str) {
  let entry = Entry::new(service, "auth_credentials.v1")
    .expect("OS keyring entry must be available");
  match phase {
    "write" => entry.set_password(PAYLOAD).expect("keyring write must succeed"),
    "read" => assert_eq!(entry.get_password().expect("keyring read must succeed"), PAYLOAD),
    "delete" => {
      entry.delete_credential().expect("keyring delete must succeed");
      assert!(matches!(entry.get_password(), Err(KeyringError::NoEntry)));
    }
    _ => panic!("unknown keyring test phase"),
  }
}

#[test]
#[ignore = "requires a running OS Secret Service / Keychain provider"]
fn stores_reads_and_deletes_credentials_in_the_os_keyring() {
  if let (Ok(service), Ok(phase)) = (
    std::env::var("AGENTHUB_KEYRING_TEST_SERVICE"),
    std::env::var("AGENTHUB_KEYRING_TEST_PHASE"),
  ) {
    run_phase(&service, &phase);
    return;
  }

  let unique = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("clock must be after Unix epoch")
    .as_nanos();
  let service = format!("com.artsum.agenthub.test.{}.{}", std::process::id(), unique);
  let executable = std::env::current_exe().expect("test executable must be available");

  for phase in ["write", "read", "delete"] {
    let status = Command::new(&executable)
      .args(["--ignored", "--exact", TEST_NAME])
      .env("AGENTHUB_KEYRING_TEST_SERVICE", &service)
      .env("AGENTHUB_KEYRING_TEST_PHASE", phase)
      .status()
      .expect("keyring phase process must start");
    assert!(status.success(), "keyring {phase} process failed");
  }
}
