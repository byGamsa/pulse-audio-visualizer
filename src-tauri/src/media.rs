use serde::Serialize;

#[derive(Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub album: String,
    // App-ID der Quelle, z. B. "Spotify.exe" oder "MSEdge"
    pub app: String,
    pub playing: bool,
    // Cover als data:-URL, falls die Quelle eins liefert
    pub artwork: Option<String>,
}

#[cfg(windows)]
mod imp {
    use super::NowPlaying;
    use base64::Engine;
    use std::sync::Mutex;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionMediaProperties as Properties,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    // Das Cover wird nur neu gelesen, wenn sich der Titel ändert
    static ART_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

    pub fn current() -> windows::core::Result<Option<NowPlaying>> {
        // Ohne Apartment schlagen WinRT-Aufrufe fehl
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let manager = Manager::RequestAsync()?.get()?;
        let Ok(session) = manager.GetCurrentSession() else { return Ok(None) };
        let props = session.TryGetMediaPropertiesAsync()?.get()?;
        let title = props.Title()?.to_string();
        if title.trim().is_empty() {
            return Ok(None);
        }
        let artist = props.Artist()?.to_string();
        let album = props.AlbumTitle()?.to_string();
        let app = session.SourceAppUserModelId()?.to_string();
        let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;

        let key = format!("{title}\u{1}{artist}\u{1}{album}");
        let mut cache = ART_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let artwork = match cache.as_ref() {
            Some((k, art)) if *k == key => art.clone(),
            _ => {
                let art = read_artwork(&props).ok().flatten();
                *cache = Some((key, art.clone()));
                art
            }
        };
        Ok(Some(NowPlaying { title, artist, album, app, playing, artwork }))
    }

    fn read_artwork(props: &Properties) -> windows::core::Result<Option<String>> {
        let Ok(thumb) = props.Thumbnail() else { return Ok(None) };
        let stream = thumb.OpenReadAsync()?.get()?;
        let size = stream.Size()? as u32;
        if size == 0 {
            return Ok(None);
        }
        let reader = DataReader::CreateDataReader(&stream)?;
        reader.LoadAsync(size)?.get()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf)?;
        let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
        let mime = if mime.is_empty() { "image/png".to_string() } else { mime };
        Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf))))
    }
}

pub fn now_playing() -> Option<NowPlaying> {
    #[cfg(windows)]
    {
        imp::current().ok().flatten()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    // cargo test now_playing_smoke -- --ignored --nocapture
    #[test]
    #[ignore]
    fn now_playing_smoke() {
        match super::now_playing() {
            Some(n) => println!("{} – {} ({}) via {} playing={} art={}", n.artist, n.title, n.album, n.app, n.playing, n.artwork.map_or(0, |a| a.len())),
            None => println!("nichts läuft"),
        }
    }
}
