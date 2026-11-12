// BRY Takip Desktop — Rust kabuk
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
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use std::path::PathBuf;
use std::io::Write;

// Log file path — set in setup(), used by tlog!()
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Hem stdout'a (terminal build'de görünür) hem app_data_dir/tauri.log'a yazar.
/// Windows release build'inde stdout görünmediği için kritik debug aracı.
fn tlog(msg: &str) {
    println!("[tauri] {}", msg);
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(f, "[{}] {}", now, msg);
        }
    }
}

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

// ── Beyaz ekran bekçisi ─────────────────────────────────────────────
// Windows'ta WebView2 profiline önbelleğe yazılmış bir yönlendirme (ör. aynı
// makinedeki web sunucusunun 80. porttaki 308'i) ya da bozuk bir service worker
// girerse pencere beyaz kalır. Uygulama kendi kendini toparlayamaz, kullanıcı
// da log ya da ekran görüntüsü gönderemeyebilir.
//
// Her sayfa yüklemesi başladığında bekçi kurulur. Ön yüz JS paketi çalışınca
// `ui_ready` komutunu çağırır (frontend/plugins/00.ui-ready.client.ts). Süre
// dolduğunda sinyal gelmemişse WebView2'nin HTTP önbelleği + service worker'ları
// + Cache Storage'ı silinir ve uygulama kökten yeniden yüklenir.
//
// localStorage SİLİNMEZ: lisans anahtarı ve makine kimliği orada; silinirse
// kurum lisanssız kalır ve yeniden doğrulamada WRONG_MACHINE alır.
// Onarım her oturumda bir kez denenir (döngüye girmesin).
static UI_READY: AtomicBool = AtomicBool::new(false);
static LOAD_GEN: AtomicU64 = AtomicU64::new(0);
static HEAL_ATTEMPTED: AtomicBool = AtomicBool::new(false);
const UI_READY_TIMEOUT: Duration = Duration::from_secs(25);

#[tauri::command]
fn ui_ready() {
    if !UI_READY.swap(true, Ordering::SeqCst) {
        tlog("UI hazır sinyali alındı");
    }
}

fn arm_ui_watchdog(app: AppHandle, reset_ready: bool) {
    if reset_ready {
        UI_READY.store(false, Ordering::SeqCst);
    }
    let gen = LOAD_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(UI_READY_TIMEOUT);
        // Bu arada yeni bir yükleme başladıysa onun bekçisi karar verir
        if LOAD_GEN.load(Ordering::SeqCst) != gen || UI_READY.load(Ordering::SeqCst) {
            return;
        }
        if HEAL_ATTEMPTED.swap(true, Ordering::SeqCst) {
            tlog("[bekçi] UI yine açılmadı; onarım bu oturumda zaten denendi, tekrar denenmiyor");
            return;
        }
        tlog("[bekçi] UI 25 sn içinde açılmadı → önbellek + service worker temizlenip yeniden yükleniyor");
        heal_webview(&app);
    });
}

/// Uygulamayı kök adresten yeniden yükler. `reload()` yerine `navigate`:
/// önbellekteki yönlendirme yüzünden pencere https:// hata sayfasında kalmış
/// olabilir; reload o hatalı adresi tekrar ister.
fn reload_app_root(app: &AppHandle) {
    let root = if cfg!(windows) {
        "http://tauri.localhost/"
    } else {
        "tauri://localhost/"
    };
    if let (Some(window), Ok(url)) = (app.get_webview_window("main"), root.parse::<tauri::Url>()) {
        if let Err(e) = window.navigate(url) {
            tlog(&format!("[bekçi] yeniden yükleme başarısız: {}", e));
        }
    }
}

#[cfg(windows)]
fn heal_webview(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let app_for_cb = app.clone();
    let res = window.with_webview(move |wv| {
        use webview2_com::ClearBrowsingDataCompletedHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Profile2, ICoreWebView2_13,
            COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE,
            COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE,
            COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS,
        };
        use windows_core::Interface;

        let app_done = app_for_cb.clone();
        let started = unsafe {
            (|| -> windows_core::Result<()> {
                let profile = wv
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_13>()?
                    .Profile()?
                    .cast::<ICoreWebView2Profile2>()?;
                let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE
                    | COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS
                    | COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE;
                profile.ClearBrowsingData(
                    kinds,
                    &ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
                        tlog(&format!("[bekçi] temizlik bitti, başarılı: {}", result.is_ok()));
                        reload_app_root(&app_done);
                        Ok(())
                    })),
                )
            })()
        };
        if let Err(e) = started {
            // Eski WebView2 runtime (Profile2 yok) vb. — en azından kökten yükle
            tlog(&format!("[bekçi] temizlik başlatılamadı: {}", e));
            reload_app_root(&app_for_cb);
        }
    });
    if let Err(e) = res {
        tlog(&format!("[bekçi] webview'e erişilemedi: {}", e));
    }
}

// macOS/Linux'ta WebView2 önbellek sorunu yok; kökten yeniden yüklemek yeter.
#[cfg(not(windows))]
fn heal_webview(app: &AppHandle) {
    reload_app_root(app);
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
        .invoke_handler(tauri::generate_handler![ui_ready])
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                arm_ui_watchdog(webview.app_handle().clone(), true);
            }
        })
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("resource dir alınamadı");

            // Kullanıcı verileri klasörü — config, abonelik, log buraya yazılır
            // macOS: ~/Library/Application Support/com.brytakip.bkds/
            // Windows: %APPDATA%\com.brytakip.bkds\
            // Linux: ~/.config/com.brytakip.bkds/
            // .app içine yazamayız (Gatekeeper), buraya yazıyoruz
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir alınamadı");
            // Klasör yoksa oluştur
            std::fs::create_dir_all(&app_data_dir).ok();

            // Bundle identifier migration chain:
            // com.ludenlab.bkds (orijinal) → com.brytakip.app (kısa süre kullanıldı,
            //   bundle ID .app uzantısı macOS hdiutil ile çakışıyordu)
            //                              → com.brytakip.bkds (kalıcı, mevcut)
            // Yeni data dir boşsa, en yakın legacy'den içeriği bir kerelik kopyala.
            // Sıra: önce com.brytakip.app (recent), sonra com.ludenlab.bkds (older).
            if let Some(parent) = app_data_dir.parent() {
                let new_is_empty = std::fs::read_dir(&app_data_dir)
                    .map(|mut d| d.next().is_none())
                    .unwrap_or(true);
                if new_is_empty {
                    for legacy_name in &["com.brytakip.app", "com.ludenlab.bkds"] {
                        let legacy_dir = parent.join(legacy_name);
                        if legacy_dir.exists() {
                            if let Ok(entries) = std::fs::read_dir(&legacy_dir) {
                                for entry in entries.flatten() {
                                    let dst = app_data_dir.join(entry.file_name());
                                    let _ = std::fs::copy(entry.path(), dst);
                                }
                            }
                            break; // en yakın legacy'den taşıdık, dur
                        }
                    }
                }
            }

            // Log dosyasını ayarla — tüm Tauri lifecycle event'leri buraya yazılır.
            // macOS: ~/Library/Application Support/com.brytakip.bkds/tauri.log
            // Windows: %APPDATA%\com.brytakip.bkds\tauri.log
            // Sorun bildiren kullanıcıdan bu dosyayı isteyebilirsin.
            LOG_PATH.set(app_data_dir.join("tauri.log")).ok();

            let frontend_dist = resource_dir.join("dist-frontend");
            let server_script = resource_dir.join("binaries").join("server.mjs");
            let node_binary_name = if cfg!(target_os = "windows") {
                "brytakip-backend.exe"
            } else {
                "brytakip-backend"
            };
            let node_runtime = resource_dir.join("binaries").join(node_binary_name);

            // KRİTİK Windows path normalize:
            //  1. `\\?\` extended-length prefix STRIP edilmeli — Tauri'nin resource_dir()'i
            //     uzun-path için bu prefix'i ekler. Node'a bu form geçtiğinde path parsing
            //     yanlış gidiyor (`EISDIR lstat 'C:'` hatası).
            //  2. Backslash'ları forward slash'a çevir — Tauri shell capability glob
            //     forward slash bekler; Windows API ikisini de kabul eder.
            let normalize = |p: &std::path::Path| -> String {
                let s = p.to_string_lossy().to_string();
                // raw string r"\\?\" → 4 bayt: backslash + backslash + ? + backslash
                let s = s.strip_prefix(r"\\?\").map(String::from).unwrap_or(s);
                s.replace('\\', "/")
            };
            let frontend_dist_str = normalize(&frontend_dist);
            let server_script_str = normalize(&server_script);
            let node_runtime_str = normalize(&node_runtime);
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string(); // env var, native ok

            tlog(&format!("Frontend dist: {}", frontend_dist_str));
            tlog(&format!("Backend script: {}", server_script_str));
            tlog(&format!("Node runtime: {}", node_runtime_str));
            tlog(&format!("App data dir: {}", app_data_dir_str));
            tlog(&format!("Auto-start ile mi başladı: {}", started_via_autostart));
            tlog(&format!("node-runtime dosyası var mı: {}", node_runtime.exists()));
            tlog(&format!("server.mjs dosyası var mı: {}", server_script.exists()));

            // Backend'i başlat
            let shell = app.shell();
            let cmd = shell
                .command(&node_runtime_str)
                .args([&server_script_str])
                .env("LUDEN_FRONTEND_DIST", &frontend_dist_str)
                .env("LUDEN_DATA_DIR", &app_data_dir_str)
                .env("PORT", "8787");

            // Spawn fail edebilir (capability ihlali, exec hatası) — panic etme, log'la.
            // Backend olmasa bile Tauri açılır → kullanıcı log dosyasını paylaşabilir.
            match cmd.spawn() {
                Ok((mut rx, child)) => {
                    let pid = child.pid();
                    tlog(&format!("backend spawn OK, pid={}", pid));

                    // State'e kaydet
                    let state: tauri::State<Arc<ServerProcess>> = app.state();
                    state.set(child);

                    // Backend log'larını yönlendir → hem stdout hem dosyaya
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    let s = String::from_utf8_lossy(&line);
                                    tlog(&format!("[backend] {}", s.trim_end()));
                                }
                                CommandEvent::Stderr(line) => {
                                    let s = String::from_utf8_lossy(&line);
                                    tlog(&format!("[backend!] {}", s.trim_end()));
                                }
                                CommandEvent::Error(err) => {
                                    tlog(&format!("[backend error] {}", err));
                                }
                                CommandEvent::Terminated(payload) => {
                                    tlog(&format!("[backend] kapandı: code={:?}", payload.code));
                                }
                                _ => {}
                            }
                        }
                    });
                }
                Err(e) => {
                    tlog(&format!("[FATAL] backend spawn başarısız: {}", e));
                    tlog("Sebepler: capability ihlali, exec yetkisi yok, dosya bozuk, antivirus engeli.");
                    // Devam et — Tauri penceresi açılır, kullanıcı log dosyasını paylaşabilir.
                }
            }

            // ── Tray icon ────────────────────────────────────────
            // Pencere kapatılınca uygulama gizlenir, ama tray'den her zaman geri açılır.
            let show_item = MenuItem::with_id(app, "show", "Aç", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("BRY Takip")
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

            // İlk yükleme için de bekçi kur: sayfa yükleme olayı setup'tan önce
            // gelmiş ya da hiç gelmemiş olabilir. UI_READY'yi sıfırlamaz; yeni
            // bir yükleme olayı gelirse onun bekçisi bunu geçersiz kılar.
            arm_ui_watchdog(app.handle().clone(), false);

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
