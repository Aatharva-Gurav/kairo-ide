use crate::security::{FsSecurityError, WorkspaceGuard};
use std::borrow::Cow;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::Arc;
use tauri::http::{header::*, Method, Request, Response, StatusCode};
use tauri::utils::mime_type::MimeType;

const MAX_RANGE_CHUNK: u64 = 1024 * 1024; // 1 MB chunk for range streaming
const MAX_DIRECT_ASSET_SIZE: u64 = 32 * 1024 * 1024; // 32 MB safeguard for non-range full reads

fn percent_decode_utf8(input: &str) -> Result<String, FsSecurityError> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(FsSecurityError::UnsupportedPathFormat(
                    "Malformed percent-encoding in asset URI.".to_string(),
                ));
            }
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            match (hi, lo) {
                (Some(h), Some(l)) => {
                    out.push(((h << 4) | l) as u8);
                    i += 3;
                }
                _ => {
                    return Err(FsSecurityError::UnsupportedPathFormat(
                        "Invalid hex escape in asset URI.".to_string(),
                    ));
                }
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }

    String::from_utf8(out).map_err(|_| {
        FsSecurityError::UnsupportedPathFormat("Asset URI path is not valid UTF-8.".to_string())
    })
}

/// Decodes a Tauri asset protocol URI path into a local OS path string.
pub fn decode_asset_uri_path(uri_path: &str) -> Result<String, FsSecurityError> {
    let stripped = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let decoded = percent_decode_utf8(stripped)?;

    #[cfg(windows)]
    {
        // Normalize `/C:/...` -> `C:/...` if double-slashed
        if decoded.starts_with('/') && decoded.as_bytes().get(2) == Some(&b':') {
            Ok(decoded[1..].to_string())
        } else {
            Ok(decoded)
        }
    }

    #[cfg(not(windows))]
    {
        if decoded.starts_with('/') {
            Ok(decoded)
        } else {
            Ok(format!("/{}", decoded))
        }
    }
}

fn allowed_cors_origin(request: &Request<Vec<u8>>) -> &'static str {
    if let Some(origin) = request.headers().get(ORIGIN).and_then(|v| v.to_str().ok()) {
        match origin {
            "http://localhost:3000" => return "http://localhost:3000",
            "http://127.0.0.1:3000" => return "http://127.0.0.1:3000",
            "http://tauri.localhost" => return "http://tauri.localhost",
            "https://tauri.localhost" => return "https://tauri.localhost",
            "tauri://localhost" => return "tauri://localhost",
            _ => {}
        }
    }
    if cfg!(debug_assertions) {
        "http://localhost:3000"
    } else if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    }
}

fn empty_response(status: StatusCode, cors_origin: &str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
        .body(Cow::Borrowed(&[] as &[u8]))
        .unwrap_or_else(|_| Response::new(Cow::Borrowed(&[] as &[u8])))
}

fn parse_single_byte_range(range_header: &str, total_len: u64) -> Option<(u64, u64)> {
    let trimmed = range_header.trim();
    let spec = trimmed.strip_prefix("bytes=")?;
    if spec.contains(',') {
        // Multi-range not needed; caller can request single range
        return None;
    }
    let (start_s, end_s) = spec.split_once('-')?;
    if total_len == 0 {
        return None;
    }
    if start_s.is_empty() {
        let suffix_len: u64 = end_s.parse().ok()?;
        if suffix_len == 0 {
            return None;
        }
        let start = total_len.saturating_sub(suffix_len);
        Some((start, total_len - 1))
    } else {
        let start: u64 = start_s.parse().ok()?;
        if start >= total_len {
            return None;
        }
        let end = if end_s.is_empty() {
            total_len - 1
        } else {
            let requested_end: u64 = end_s.parse().ok()?;
            requested_end.min(total_len - 1)
        };
        if end < start {
            return None;
        }
        Some((start, end))
    }
}

/// Handles a Tauri `asset://` / `http://asset.localhost/` request strictly through `WorkspaceGuard`.
pub fn handle_asset_request(
    guard: &Arc<WorkspaceGuard>,
    request: &Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let cors_origin = allowed_cors_origin(request);

    if request.method() != Method::GET && request.method() != Method::HEAD {
        return empty_response(StatusCode::METHOD_NOT_ALLOWED, cors_origin);
    }

    let decoded_path = match decode_asset_uri_path(request.uri().path()) {
        Ok(p) => p,
        Err(_) => return empty_response(StatusCode::FORBIDDEN, cors_origin),
    };

    let (canonical, gen) = match guard.validate_existing_file(&decoded_path, true) {
        Ok(res) => res,
        Err(FsSecurityError::NotFound(_)) => {
            return empty_response(StatusCode::NOT_FOUND, cors_origin);
        }
        Err(_) => {
            return empty_response(StatusCode::FORBIDDEN, cors_origin);
        }
    };

    if guard.revalidate_before_op(&canonical, gen, true).is_err() {
        return empty_response(StatusCode::FORBIDDEN, cors_origin);
    }

    let mut file = match File::open(&canonical) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return empty_response(StatusCode::NOT_FOUND, cors_origin);
        }
        Err(_) => return empty_response(StatusCode::FORBIDDEN, cors_origin),
    };

    let len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin),
    };

    let nbytes = len.min(8192) as usize;
    let mut magic_buf = vec![0u8; nbytes];
    if nbytes > 0 && file.read_exact(&mut magic_buf).is_err() {
        return empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin);
    }
    if file.seek(SeekFrom::Start(0)).is_err() {
        return empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin);
    }

    let display = WorkspaceGuard::display_path(&canonical);
    let mime_type = MimeType::parse(&magic_buf, &display);

    if request.method() == Method::HEAD {
        return Response::builder()
            .status(StatusCode::OK)
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
            .header(ACCEPT_RANGES, "bytes")
            .header(CONTENT_TYPE, &mime_type)
            .header(CONTENT_LENGTH, len)
            .body(Cow::Borrowed(&[] as &[u8]))
            .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin));
    }

    if let Some(range_header) = request.headers().get(RANGE).and_then(|v| v.to_str().ok()) {
        let Some((start, mut end)) = parse_single_byte_range(range_header, len) else {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
                .header(CONTENT_RANGE, format!("bytes */{}", len))
                .body(Cow::Borrowed(&[] as &[u8]))
                .unwrap_or_else(|_| {
                    empty_response(StatusCode::RANGE_NOT_SATISFIABLE, cors_origin)
                });
        };

        end = start + (end - start).min(len - start).min(MAX_RANGE_CHUNK - 1);
        let chunk_len = (end + 1 - start) as usize;
        let mut buf = vec![0u8; chunk_len];
        if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
            return empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin);
        }

        if guard.ensure_generation(gen).is_err() {
            return empty_response(StatusCode::FORBIDDEN, cors_origin);
        }

        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
            .header(ACCEPT_RANGES, "bytes")
            .header(ACCESS_CONTROL_EXPOSE_HEADERS, "content-range")
            .header(CONTENT_TYPE, &mime_type)
            .header(CONTENT_RANGE, format!("bytes {}-{}/{}", start, end, len))
            .header(CONTENT_LENGTH, chunk_len)
            .body(Cow::Owned(buf))
            .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin));
    }

    if len > MAX_DIRECT_ASSET_SIZE {
        return empty_response(StatusCode::PAYLOAD_TOO_LARGE, cors_origin);
    }

    let body = if len <= 8192 {
        magic_buf
    } else {
        let mut full = Vec::with_capacity(len as usize);
        if file.read_to_end(&mut full).is_err() {
            return empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin);
        }
        full
    };

    if guard.ensure_generation(gen).is_err() {
        return empty_response(StatusCode::FORBIDDEN, cors_origin);
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_TYPE, &mime_type)
        .header(CONTENT_LENGTH, len)
        .body(Cow::Owned(body))
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR, cors_origin))
}
