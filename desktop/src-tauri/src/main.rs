// Tauri 2.x convention: main.rs sadece lib'i çağırır
// Asıl kod: lib.rs içinde

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    luden_bkds_desktop_lib::run()
}
