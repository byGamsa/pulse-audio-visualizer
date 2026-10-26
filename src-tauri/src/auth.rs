// Anmeldung mit dem Dendree-Konto: auth.dendree.de/desktop schickt den Browser mit einem einmaligen Token
// an einen Loopback-Server, der nur diese eine Antwort annimmt und sie an die Oberfläche weiterreicht
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_opener::OpenerExt;

const WAIT: Duration = Duration::from_secs(10 * 60);
const PAGE: &str = "<!doctype html><meta charset=utf-8><title>Pulse</title>\
<body style=\"background:#0b0b0d;color:#f2ede4;font:15px system-ui;display:grid;place-items:center;height:90vh\">\
<p>You can close this tab and go back to Pulse.</p>";

pub fn valid_state(state: &str) -> bool {
    (16..=128).contains(&state.len()) && state.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

// Nur die echte Anmeldeseite, im Debug-Build auch eine lokale
pub fn valid_auth_url(url: &str) -> bool {
    url == "https://auth.dendree.de" || (cfg!(debug_assertions) && url.starts_with("http://localhost:"))
}

// Query der Anfrage an /callback, alles andere ist None
fn callback_query(request_line: &str) -> Option<String> {
    let mut parts = request_line.split_whitespace();
    if parts.next() != Some("GET") {
        return None;
    }
    let target = parts.next()?;
    let query = target.strip_prefix("/callback?")?;
    query.bytes().all(|b| b.is_ascii_graphic()).then(|| query.to_string())
}

fn answer(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
}

pub fn begin<R: Runtime>(app: AppHandle<R>, auth_url: &str, state: String) -> Result<(), String> {
    if !valid_state(&state) || !valid_auth_url(auth_url) {
        return Err("invalid sign-in request".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let url = format!("{auth_url}/desktop?app=pulse&port={port}&state={state}");
    // Im Debug-Build lässt sich die Anmeldung so auch in einem anderen Browser abschließen
    if cfg!(debug_assertions) {
        eprintln!("sign-in: {url}");
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline {
            let Ok((mut stream, _)) = listener.accept() else {
                std::thread::sleep(Duration::from_millis(200));
                continue;
            };
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut line = String::new();
            let _ = BufReader::new(&stream).read_line(&mut line);
            match callback_query(&line) {
                Some(query) => {
                    answer(&mut stream, "200 OK", PAGE);
                    let _ = app.emit("pulse-auth", query);
                    return;
                }
                None => answer(&mut stream, "404 Not Found", ""),
            }
        }
        let _ = app.emit("pulse-auth", format!("error=timeout&state={state}"));
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_the_callback() {
        assert_eq!(callback_query("GET /callback?token_hash=abc&state=x HTTP/1.1\r\n").as_deref(), Some("token_hash=abc&state=x"));
        assert!(callback_query("GET /favicon.ico HTTP/1.1").is_none());
        assert!(callback_query("POST /callback?x=1 HTTP/1.1").is_none());
        assert!(callback_query("GET /callbackx?x=1 HTTP/1.1").is_none());
    }

    #[test]
    fn checks_state_and_auth_url() {
        assert!(valid_state("abcdefghijklmnop_-12"));
        assert!(!valid_state("short"));
        assert!(!valid_state("abcdefghijklmnop&evil=1"));
        assert!(valid_auth_url("https://auth.dendree.de"));
        assert!(!valid_auth_url("https://auth.dendree.de.evil.com"));
        assert!(!valid_auth_url("http://auth.dendree.de"));
    }
}
