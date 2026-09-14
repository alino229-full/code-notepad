use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use tauri::http::{header, Request, Response, StatusCode};

const MAX_SEARCH_MATCHES: usize = 500;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone, Default)]
struct PreviewState(Arc<RwLock<Option<PathBuf>>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    is_directory: bool,
    is_symlink: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchOptions {
    case_sensitive: bool,
    whole_word: bool,
    regex: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectorySearchMatch {
    path: String,
    relative_path: String,
    line: usize,
    column: usize,
    line_text: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Lecture impossible : {error}"))
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|error| format!("Écriture impossible : {error}"))
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let directory = PathBuf::from(&path);
    if !directory.is_dir() {
        return Err("Le chemin sélectionné n’est pas un dossier.".to_string());
    }

    let mut entries = Vec::new();
    for result in
        fs::read_dir(&directory).map_err(|error| format!("Dossier illisible : {error}"))?
    {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_directory: file_type.is_dir(),
            is_symlink: file_type.is_symlink(),
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn prepare_preview(
    state: tauri::State<'_, PreviewState>,
    path: String,
    workspace_root: Option<String>,
) -> Result<String, String> {
    let file =
        fs::canonicalize(&path).map_err(|error| format!("Fichier HTML inaccessible : {error}"))?;
    if !file.is_file() || !is_html_file(&file) {
        return Err("L’aperçu intégré accepte uniquement un fichier HTML enregistré.".to_string());
    }

    let file_parent = file
        .parent()
        .ok_or_else(|| "Le dossier du fichier HTML est introuvable.".to_string())?;
    let root = workspace_root
        .and_then(|candidate| fs::canonicalize(candidate).ok())
        .filter(|candidate| candidate.is_dir() && file.starts_with(candidate))
        .unwrap_or_else(|| file_parent.to_path_buf());
    let relative = file
        .strip_prefix(&root)
        .map_err(|_| "Le fichier HTML est hors du dossier autorisé pour l’aperçu.".to_string())?;

    let encoded_path = relative
        .components()
        .map(|component| {
            utf8_percent_encode(&component.as_os_str().to_string_lossy(), NON_ALPHANUMERIC)
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("/");

    let mut guard = state
        .0
        .write()
        .map_err(|_| "Le service d’aperçu est momentanément indisponible.".to_string())?;
    *guard = Some(root);
    drop(guard);

    #[cfg(any(target_os = "windows", target_os = "android"))]
    let url = format!("http://codenotepad.localhost/{encoded_path}");
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    let url = format!("codenotepad://localhost/{encoded_path}");

    Ok(url)
}

#[tauri::command]
fn search_directory(
    root: String,
    query: String,
    options: SearchOptions,
) -> Result<Vec<DirectorySearchMatch>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let root =
        fs::canonicalize(&root).map_err(|error| format!("Dossier inaccessible : {error}"))?;
    if !root.is_dir() {
        return Err("Le chemin de recherche n’est pas un dossier.".to_string());
    }
    let expression = build_search_regex(&query, &options)?;
    let mut matches = Vec::new();
    let mut directories = vec![root.clone()];

    while let Some(directory) = directories.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for result in entries {
            let entry = match result {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                directories.push(path);
                continue;
            }
            if !file_type.is_file() || !is_searchable_file(&path) {
                continue;
            }
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.len() > MAX_SEARCH_FILE_BYTES {
                continue;
            }
            let contents = match fs::read_to_string(&path) {
                Ok(contents) => contents,
                Err(_) => continue,
            };
            let relative_path = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned();
            for (line_index, line) in contents.lines().enumerate() {
                for found in expression.find_iter(line) {
                    let column = line[..found.start()].chars().count() + 1;
                    matches.push(DirectorySearchMatch {
                        path: path.to_string_lossy().into_owned(),
                        relative_path: relative_path.clone(),
                        line: line_index + 1,
                        column,
                        line_text: truncate_line(line, 260),
                    });
                    if matches.len() >= MAX_SEARCH_MATCHES {
                        return Ok(matches);
                    }
                }
            }
        }
    }

    matches.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.column.cmp(&right.column))
    });
    Ok(matches)
}

fn build_search_regex(query: &str, options: &SearchOptions) -> Result<Regex, String> {
    let source = if options.regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .unicode(true)
        .build()
        .map_err(|error| format!("Expression régulière invalide : {error}"))
}

fn is_html_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("html" | "htm")
    )
}

fn is_searchable_file(path: &Path) -> bool {
    const EXTENSIONS: &[&str] = &[
        "c",
        "cc",
        "cpp",
        "cs",
        "css",
        "csv",
        "dart",
        "go",
        "h",
        "hpp",
        "htm",
        "html",
        "ini",
        "java",
        "js",
        "json",
        "jsx",
        "kt",
        "less",
        "log",
        "lua",
        "md",
        "mjs",
        "php",
        "properties",
        "ps1",
        "py",
        "rb",
        "rs",
        "scss",
        "sh",
        "sql",
        "svelte",
        "toml",
        "ts",
        "tsx",
        "txt",
        "vue",
        "xml",
        "yaml",
        "yml",
    ];
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .map(|extension| EXTENSIONS.contains(&extension.as_str()))
        .unwrap_or(true)
}

fn truncate_line(line: &str, limit: usize) -> String {
    let mut chars = line.chars();
    let truncated: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn preview_response(status: StatusCode, body: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn serve_preview(state: &PreviewState, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let root = match state.0.read().ok().and_then(|guard| guard.clone()) {
        Some(root) => root,
        None => {
            return preview_response(
                StatusCode::NOT_FOUND,
                b"Aucun apercu n'est prepare.".to_vec(),
                "text/plain; charset=utf-8",
            )
        }
    };

    let decoded =
        match percent_decode_str(request.uri().path().trim_start_matches('/')).decode_utf8() {
            Ok(decoded) => decoded,
            Err(_) => {
                return preview_response(
                    StatusCode::BAD_REQUEST,
                    b"Chemin invalide.".to_vec(),
                    "text/plain; charset=utf-8",
                )
            }
        };
    let requested = Path::new(decoded.as_ref());
    if requested
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return preview_response(
            StatusCode::FORBIDDEN,
            b"Acces refuse.".to_vec(),
            "text/plain; charset=utf-8",
        );
    }

    let mut candidate = root.join(requested);
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    let canonical = match fs::canonicalize(&candidate) {
        Ok(canonical) if canonical.starts_with(&root) => canonical,
        _ => {
            return preview_response(
                StatusCode::NOT_FOUND,
                b"Ressource locale introuvable.".to_vec(),
                "text/plain; charset=utf-8",
            )
        }
    };
    let body = match fs::read(&canonical) {
        Ok(body) => body,
        Err(_) => {
            return preview_response(
                StatusCode::NOT_FOUND,
                b"Ressource locale illisible.".to_vec(),
                "text/plain; charset=utf-8",
            )
        }
    };
    let mime = mime_guess::from_path(&canonical).first_or_octet_stream();
    preview_response(StatusCode::OK, body, mime.as_ref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let preview_state = PreviewState::default();
    let protocol_state = preview_state.clone();

    tauri::Builder::default()
        .manage(preview_state)
        .register_uri_scheme_protocol("codenotepad", move |_context, request| {
            serve_preview(&protocol_state, request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_directory,
            prepare_preview,
            search_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("code-notepad-test-{suffix}"));
        fs::create_dir_all(&directory).expect("test directory should be created");
        directory
    }

    #[test]
    fn whole_word_search_excludes_partial_identifiers() {
        let options = SearchOptions {
            case_sensitive: false,
            whole_word: true,
            regex: false,
        };
        let expression = build_search_regex("class", &options).expect("regex should compile");
        assert!(expression.is_match("class=\"hero\""));
        assert!(!expression.is_match("classification"));
    }

    #[test]
    fn regex_errors_are_reported() {
        let options = SearchOptions {
            case_sensitive: true,
            whole_word: false,
            regex: true,
        };
        assert!(build_search_regex("(", &options).is_err());
    }

    #[test]
    fn long_result_lines_are_bounded() {
        let line = "a".repeat(300);
        let truncated = truncate_line(&line, 20);
        assert_eq!(truncated.chars().count(), 21);
        assert!(truncated.ends_with('…'));
    }

    #[test]
    fn directory_search_reads_nested_code_files() {
        let root = test_directory();
        let assets = root.join("assets");
        fs::create_dir_all(&assets).expect("nested directory should be created");
        fs::write(
            assets.join("app.js"),
            "const title = 'Code Notepad';\nconsole.log(title);\n",
        )
        .expect("fixture should be written");

        let matches = search_directory(
            root.to_string_lossy().into_owned(),
            "code notepad".to_string(),
            SearchOptions {
                case_sensitive: false,
                whole_word: false,
                regex: false,
            },
        )
        .expect("search should succeed");

        assert_eq!(matches.len(), 1);
        assert!(
            matches[0].relative_path.ends_with("assets\\app.js")
                || matches[0].relative_path.ends_with("assets/app.js")
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn preview_protocol_serves_local_javascript() {
        let root = test_directory();
        let assets = root.join("assets");
        fs::create_dir_all(&assets).expect("nested directory should be created");
        fs::write(assets.join("app.js"), "window.previewLoaded = true;")
            .expect("fixture should be written");

        let state = PreviewState(Arc::new(RwLock::new(Some(
            fs::canonicalize(&root).expect("root should canonicalize"),
        ))));
        let request = Request::builder()
            .uri("http://codenotepad.localhost/assets/app.js")
            .body(Vec::new())
            .expect("request should be valid");
        let response = serve_preview(&state, request);

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), b"window.previewLoaded = true;");
        assert!(response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("javascript")));
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn preview_protocol_blocks_parent_traversal() {
        let root = test_directory();
        let state = PreviewState(Arc::new(RwLock::new(Some(
            fs::canonicalize(&root).expect("root should canonicalize"),
        ))));
        let request = Request::builder()
            .uri("http://codenotepad.localhost/../secret.txt")
            .body(Vec::new())
            .expect("request should be valid");
        let response = serve_preview(&state, request);

        assert_ne!(response.status(), StatusCode::OK);
        fs::remove_dir_all(root).expect("test directory should be removed");
    }
}
