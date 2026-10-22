mod analysis;
mod capture;
#[cfg(target_os = "linux")]
#[path = "linux.rs"]
mod system;
#[cfg(target_os = "macos")]
#[path = "macos.rs"]
mod system;

pub use capture::{list_devices, Capture, CaptureInfo, DeviceInfo};
