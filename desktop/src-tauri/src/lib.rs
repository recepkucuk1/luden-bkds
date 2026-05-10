// Luden BKDS Desktop — Rust kabuk
//
// Sorumluluk:
//  1. Backend script'ini (server.mjs) Node.js ile başlat
//  2. Frontend dist klasörünü backend'e env ile ilet (statik servis için)
//  3. Tray icon ile her zaman erişilebilir kal (pencere kapatılınca gizlenir)
//  4. Auto-start: Mac/Windows boot olunca uygulama arkaplanda başlar
//  5. Uygulama kapanırken Node process'i ÖLMEZ ise zorla öldür
//
// Always-on tasarımı:
//   - Pencere kapatma (X / Cmd+W) → uygulamayı KAPATMAZ, sadece pencereyi gizler
//     (backend çalışmaya devam eder, telefonlar bağlı kalır)
//   - Tray icon → "Aç" / "Çıkış" menüsü
//   - "Çıkış" → app.exit(0) → child temizliği + tam kapanış
//   - --auto-start arg ile başlatıldıysa pencere hiç gösterilmez (sessiz boot)
//
// Kritik tasarım: Node child process'i 4 farklı yolla temizleriz:
//  1. WindowEvent::CloseRequested — artık pencereyi GİZLER, child öldürmez
//  2. RunEvent::ExitRequested — Cmd+Q veya tray Çıkış
//  3. RunEvent::Exit — uygulama kapanırken son durakta
//  4. Drop trait — Rust nesne yıkıcısı, son güvenlik ağı
//  + Backend tarafında orphan-detect (ppid değişince kendi kendine kapanır)

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use std::sync::{Arc, Mutex};

/// Wrapper: Mutex ile child process tutar. Drop'ta otomatik kill çağrılır.
struct ServerProcess(Mutex<Option<CommandChild>>);

impl ServerProcess {
    fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn set(&self, child: CommandChild) {
        let mut guard = self.0.lock().unwrap();
        *guard = Some(child);
    }

    /// Child'ı al ve öldür. Birden çok yerden çağrılabilir, idempotent.
    fn kill_if_alive(&self) {
        let child_opt = {
            let mut guard = self.0.lock().unwrap();
            guard.take()
        };
        if let Some(child) = child_opt {
            let pid = child.pid();
            let _ = child.kill();
            println!("[tauri] backend pid {} kill edildi", pid);
        }
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        // Son savunma — Rust runtime kapanırken
        self.kill_if_alive();
    }
}

/// Pencereyi göster + odakla (tray menüsünden, --auto-start sonrası vs.)
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Arc kullanıyoruz çünkü hem state olarak hem RunEvent handler'ında lazım
    let server_process = Arc::new(ServerProcess::new());
    let sp_for_event = Arc::clone(&server_process);

    // CLI arg: --auto-start (Login Item / Registry boot tarafından eklenir)
    let started_via_autostart = std::env::args().any(|a| a == "--auto-start");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--auto-start"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::clone(&server_process))
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("resource dir alınamadı");

            // Kullanıcı verileri klasörü — config, abonelik, log buraya yazılır
            // macOS: ~/Library/Application Support/com.ludenlab.bkds/
            // Windows: %APPDATA%\com.ludenlab.bkds\
            // Linux: ~/.config/com.ludenlab.bkds/
            // .app içine yazamayız (Gatekeeper), buraya yazıyoruz
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir alınamadı");
            // Klasör yoksa oluştur
            std::fs::create_dir_all(&app_data_dir).ok();

            let frontend_dist = resource_dir.join("dist-frontend");
            let server_script = resource_dir.join("binaries").join("server.mjs");
            let node_binary_name = if cfg!(target_os = "windows") {
                "node-runtime.exe"
            } else {
                "node-runtime"
            };
            let node_runtime = resource_dir.join("binaries").join(node_binary_name);

            let frontend_dist_str = frontend_dist.to_string_lossy().to_string();
            let server_script_str = server_script.to_string_lossy().to_string();
            let node_runtime_str = node_runtime.to_string_lossy().to_string();
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string();

            println!("[tauri] Frontend dist: {}", frontend_dist_str);
            println!("[tauri] Backend script: {}", server_script_str);
            println!("[tauri] Node runtime: {}", node_runtime_str);
            println!("[tauri] App data dir: {}", app_data_dir_str);
            println!("[tauri] Auto-start ile mi başladı: {}", started_via_autostart);

            // Backend'i başlat
            let shell = app.shell();
            let cmd = shell
                .command(&node_runtime_str)
                .args([&server_script_str])
                .env("LUDEN_FRONTEND_DIST", &frontend_dist_str)
                .env("LUDEN_DATA_DIR", &app_data_dir_str)
                .env("PORT", "8787");

            let (mut rx, child) = cmd
                .spawn()
                .expect("backend başlatılamadı (gömülü node-runtime çalışmadı)");

            println!("[tauri] backend başlatıldı, pid={}", child.pid());

            // State'e kaydet
            let state: tauri::State<Arc<ServerProcess>> = app.state();
            state.set(child);

            // Backend log'larını yönlendir
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            print!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprint!("[backend!] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[backend error] {}", err);
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[backend] kapandı: code={:?}", payload.code);
                        }
                        _ => {}
                    }
                }
            });

            // ── Tray icon ────────────────────────────────────────
            // Pencere kapatılınca uygulama gizlenir, ama tray'den her zaman geri açılır.
            let show_item = MenuItem::with_id(app, "show", "Aç", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Luden BKDS")
                .menu(&menu)
                .show_menu_on_left_click(true) // Mac konvensiyonu: sol tık menü gösterir
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // ── Pencere görünürlüğü ──────────────────────────────
            // tauri.conf.json'da visible:false ile başlıyor (auto-start senaryosu için).
            // --auto-start arg yoksa kullanıcı manuel açtı demektir → göster.
            if !started_via_autostart {
                show_main_window(&app.handle());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Pencere kapatma butonuna basıldığında: uygulamayı KAPATMA, sadece gizle.
            // Backend çalışmaya devam eder, telefonlar bağlı kalır, tray icon erişilebilir.
            // Gerçek çıkış sadece tray menüsündeki "Çıkış" ile.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("Tauri başlatılamadı");

    // Tauri runtime'ını çalıştır + RunEvent dinle
    app.run(move |_app_handle, event| match event {
        // Cmd+Q, tray "Çıkış", menüden Quit → her platformda tetiklenir
        RunEvent::ExitRequested { .. } => {
            sp_for_event.kill_if_alive();
        }
        // Tauri kapanırken son adım
        RunEvent::Exit => {
            sp_for_event.kill_if_alive();
        }
        _ => {}
    });
}
