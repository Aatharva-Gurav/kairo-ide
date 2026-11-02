use super::sidecar::{
    generate_secure_token, DesktopBackendReadyLine, DesktopBackendState,
};
use std::path::PathBuf;

#[test]
fn test_ready_line_deserialization() {
    let json = r#"{"type":"ready","endpoint":"http://127.0.0.1:51234","wsEndpoint":"ws://127.0.0.1:51234/transport","port":51234,"pid":9876}"#;
    let parsed: DesktopBackendReadyLine = serde_json::from_str(json).expect("Failed to parse ready line");

    assert_eq!(parsed.line_type, "ready");
    assert_eq!(parsed.endpoint.as_deref(), Some("http://127.0.0.1:51234"));
    assert_eq!(parsed.ws_endpoint.as_deref(), Some("ws://127.0.0.1:51234/transport"));
    assert_eq!(parsed.port, Some(51234));
    assert_eq!(parsed.pid, Some(9876));
}

#[test]
fn test_csprng_token_generation() {
    let token1 = generate_secure_token();
    let token2 = generate_secure_token();

    assert_eq!(token1.len(), 64);
    assert_eq!(token2.len(), 64);
    assert_ne!(token1, token2, "Two generated CSPRNG tokens must not match");

    // Must be valid hex characters
    assert!(token1.chars().all(|c| c.is_ascii_hexdigit()));
    assert!(token2.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn test_desktop_backend_state_lifecycle() {
    let state = DesktopBackendState::new(PathBuf::from("/mock/workspace"));

    assert!(!state.is_shutting_down());
    assert!(state.endpoint.lock().unwrap().is_none());
    assert!(state.process.lock().unwrap().is_none());

    state.stop();
    assert!(state.is_shutting_down());

    state.restart().expect("Failed to restart state");
    assert!(!state.is_shutting_down());
}
