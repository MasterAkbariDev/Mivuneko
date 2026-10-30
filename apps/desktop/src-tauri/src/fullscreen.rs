//! Whether another app (a game, video, presentation) is fullscreen, so proactive check-ins
//! stay quiet. The pet webview cannot see other apps' fullscreen state.

/// True when `window` covers one of `displays` (x, y, width, height), within a point.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
fn covers_display(window: (f64, f64, f64, f64), displays: &[(f64, f64, f64, f64)]) -> bool {
    displays.iter().any(|d| {
        (window.0 - d.0).abs() <= 1.0
            && (window.1 - d.1).abs() <= 1.0
            && (window.2 - d.2).abs() <= 1.0
            && (window.3 - d.3).abs() <= 1.0
    })
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::c_void;
    type CFTypeRef = *const c_void;
    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct CGRect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        static kCGWindowLayer: CFTypeRef;
        static kCGWindowBounds: CFTypeRef;
        static kCGWindowOwnerPID: CFTypeRef;
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
        fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *mut CGRect) -> bool;
        fn CGGetActiveDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
        fn CGDisplayBounds(display: u32) -> CGRect;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFArrayGetCount(array: CFTypeRef) -> isize;
        fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
        fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFNumberGetValue(number: CFTypeRef, kind: isize, out: *mut c_void) -> bool;
        fn CFRelease(value: CFTypeRef);
    }
    const ON_SCREEN_ONLY: u32 = 1;
    const EXCLUDE_DESKTOP: u32 = 16;
    const CF_NUMBER_SINT32: isize = 3;

    fn int(dict: CFTypeRef, key: CFTypeRef) -> Option<i32> {
        let mut out = 0i32;
        // SAFETY: dict is a live CFDictionary from the window list; out matches kind.
        unsafe {
            let v = CFDictionaryGetValue(dict, key);
            (!v.is_null() && CFNumberGetValue(v, CF_NUMBER_SINT32, &mut out as *mut _ as _))
                .then_some(out)
        }
    }
    pub fn fullscreen() -> bool {
        // SAFETY: CoreGraphics/CoreFoundation calls on values they return; the list is released.
        unsafe {
            let mut ids = [0u32; 16];
            let mut count = 0u32;
            if CGGetActiveDisplayList(16, ids.as_mut_ptr(), &mut count) != 0 {
                return false;
            }
            let displays: Vec<_> = ids[..count as usize]
                .iter()
                .map(|&id| {
                    let r = CGDisplayBounds(id);
                    (r.x, r.y, r.w, r.h)
                })
                .collect();
            let list = CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP, 0);
            if list.is_null() {
                return false;
            }
            let own = std::process::id() as i32;
            let mut result = false;
            // Front to back: the first normal-layer window not ours belongs to the frontmost app.
            for i in 0..CFArrayGetCount(list) {
                let w = CFArrayGetValueAtIndex(list, i);
                if int(w, kCGWindowLayer) != Some(0) || int(w, kCGWindowOwnerPID) == Some(own) {
                    continue;
                }
                let mut r = CGRect::default();
                let bounds = CFDictionaryGetValue(w, kCGWindowBounds);
                if !bounds.is_null() && CGRectMakeWithDictionaryRepresentation(bounds, &mut r) {
                    result = super::covers_display((r.x, r.y, r.w, r.h), &displays);
                }
                break;
            }
            CFRelease(list);
            result
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SHQueryUserNotificationState(state: *mut i32) -> i32;
    }
    pub fn fullscreen() -> bool {
        let mut state = 0i32;
        // SAFETY: writes one QUERY_USER_NOTIFICATION_STATE value.
        let ok = unsafe { SHQueryUserNotificationState(&mut state) } == 0;
        // QUNS_BUSY (fullscreen app), QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE.
        ok && matches!(state, 2..=4)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    pub fn fullscreen() -> bool {
        false
    }
}

#[tauri::command]
pub fn foreground_fullscreen() -> bool {
    platform::fullscreen()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_window_matching_any_display_is_fullscreen() {
        let displays = [(0.0, 0.0, 1440.0, 900.0), (1440.0, 0.0, 1920.0, 1080.0)];
        assert!(covers_display((1440.0, 0.0, 1920.0, 1080.0), &displays));
        assert!(covers_display((0.0, 0.5, 1440.0, 900.0), &displays));
        assert!(!covers_display((0.0, 25.0, 1440.0, 875.0), &displays));
        assert!(!covers_display((100.0, 100.0, 800.0, 600.0), &displays));
    }
    #[test]
    fn query_does_not_panic() {
        let _ = platform::fullscreen();
    }
}
