use tauri::Manager;

fn copy_directory(source: &std::path::Path, destination: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let destination_path = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&entry.path(), &destination_path)?;
        } else {
            std::fs::copy(entry.path(), destination_path)?;
        }
    }
    Ok(())
}

fn migrate_legacy_local_storage(app: &tauri::App) {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let local_storage_dir = app_data_dir.join("localstorage");
    let legacy_base = local_storage_dir.join("tauri_localhost_0.localstorage");
    let localhost_base = local_storage_dir.join("http_localhost_9527.localstorage");

    if !legacy_base.exists() || localhost_base.exists() {
        return;
    }

    for suffix in ["", "-shm", "-wal"] {
        let source = local_storage_dir.join(format!("tauri_localhost_0.localstorage{suffix}"));
        let destination =
            local_storage_dir.join(format!("http_localhost_9527.localstorage{suffix}"));
        if source.exists() {
            let _ = std::fs::copy(source, destination);
        }
    }

    let indexed_db_dir = app_data_dir.join("databases/indexeddb/v1");
    let legacy_indexed_db = indexed_db_dir.join("tauri_localhost_0");
    let localhost_indexed_db = indexed_db_dir.join("http_localhost_9527");
    if legacy_indexed_db.exists() && !localhost_indexed_db.exists() {
        let _ = copy_directory(&legacy_indexed_db, &localhost_indexed_db);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    const LOCALHOST_PORT: u16 = 9527;

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .setup(|app| {
            migrate_legacy_local_storage(app);

            let mut window_config = app
                .config()
                .app
                .windows
                .first()
                .expect("main window config")
                .clone();
            let window_url = if cfg!(debug_assertions) {
                app.config().build.dev_url.clone().expect("development URL")
            } else {
                format!("http://localhost:{LOCALHOST_PORT}")
                    .parse()
                    .expect("valid localhost URL")
            };
            window_config.url = tauri::WebviewUrl::External(window_url);

            tauri::webview::WebviewWindowBuilder::from_config(app, &window_config)?.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
