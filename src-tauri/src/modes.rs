// Installierte Mode-Pakete im App-Datenordner. Der Installer fasst ihn nicht an, Pakete überleben Updates
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

// Gegenstück zu ~/.pulse/mode-signing.key (scripts/mode-key.mjs)
const MODE_PUBLIC_KEY: &str = "RUeCBiwkpJQ6DsjhVMw0mWM5S7YkJ57wlw5un9D9BYA=";
const SDK_VERSION: u64 = 1;
const ALLOWED: [&str; 3] = ["manifest.json", "mode.js", "thumb.webp"];
const REQUIRED: [&str; 2] = ["manifest.json", "mode.js"];
const SIGNATURE_FILE: &str = "signature";

type Files = BTreeMap<String, Vec<u8>>;

#[derive(serde::Deserialize)]
struct Envelope {
    format: u32,
    files: BTreeMap<String, String>,
    signature: String,
}

pub fn valid_id(id: &str) -> bool {
    (2..=48).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn content_type(name: &str) -> Option<&'static str> {
    match name {
        "manifest.json" => Some("application/json"),
        "mode.js" => Some("text/javascript"),
        "thumb.webp" => Some("image/webp"),
        _ => None,
    }
}

// Muss zu signedMessage() in scripts/build-mode.mjs passen
fn signed_message(files: &Files) -> Vec<u8> {
    let mut msg = String::from("pulse-mode-v1\n");
    for (name, data) in files {
        let hash: String = Sha256::digest(data).iter().map(|b| format!("{b:02x}")).collect();
        msg.push_str(&format!("{name}\t{hash}\n"));
    }
    msg.into_bytes()
}

fn public_key() -> Result<VerifyingKey, String> {
    let bytes: [u8; 32] = STANDARD
        .decode(MODE_PUBLIC_KEY)
        .map_err(|e| e.to_string())?
        .try_into()
        .map_err(|_| "invalid public key".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|e| e.to_string())
}

// Prüft Dateien, Signatur und Manifest, gibt das Manifest zurück
fn verify(files: &Files, signature: &[u8], key: &VerifyingKey) -> Result<Value, String> {
    if let Some(name) = files.keys().find(|n| !ALLOWED.contains(&n.as_str())) {
        return Err(format!("unexpected file {name}"));
    }
    if let Some(name) = REQUIRED.iter().find(|n| !files.contains_key(**n)) {
        return Err(format!("missing {name}"));
    }
    let signature = Signature::from_slice(signature).map_err(|_| "invalid signature".to_string())?;
    key.verify(&signed_message(files), &signature).map_err(|_| "signature does not match".to_string())?;
    let manifest: Value = serde_json::from_slice(&files["manifest.json"]).map_err(|e| e.to_string())?;
    let id = manifest.get("id").and_then(Value::as_str).unwrap_or_default();
    if !valid_id(id) {
        return Err("invalid mode id".into());
    }
    if manifest.get("sdk").and_then(Value::as_u64) != Some(SDK_VERSION) {
        return Err("package needs a different Pulse version".into());
    }
    Ok(manifest)
}

fn parse_envelope(bytes: &[u8]) -> Result<(Files, Vec<u8>), String> {
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| "not a mode package".to_string())?;
    if envelope.format != 1 {
        return Err("unsupported package format".into());
    }
    let mut files = Files::new();
    for (name, data) in envelope.files {
        files.insert(name, STANDARD.decode(data).map_err(|e| e.to_string())?);
    }
    let signature = STANDARD.decode(envelope.signature).map_err(|e| e.to_string())?;
    Ok((files, signature))
}

fn install_with(root: &Path, bytes: &[u8], key: &VerifyingKey) -> Result<Value, String> {
    let (files, signature) = parse_envelope(bytes)?;
    let manifest = verify(&files, &signature, key)?;
    let id = manifest["id"].as_str().unwrap_or_default();
    // Erst vollständig in einen Nachbarordner schreiben, dann tauschen
    let tmp = root.join(format!(".tmp-{id}"));
    let dest = root.join(id);
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    for (name, data) in &files {
        fs::write(tmp.join(name), data).map_err(|e| e.to_string())?;
    }
    fs::write(tmp.join(SIGNATURE_FILE), STANDARD.encode(&signature)).map_err(|e| e.to_string())?;
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(manifest)
}

fn read_installed(dir: &Path, key: &VerifyingKey) -> Result<Value, String> {
    let mut files = Files::new();
    for name in ALLOWED {
        if let Ok(data) = fs::read(dir.join(name)) {
            files.insert(name.to_string(), data);
        }
    }
    let signature = STANDARD
        .decode(fs::read(dir.join(SIGNATURE_FILE)).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let manifest = verify(&files, &signature, key)?;
    if dir.file_name().and_then(|n| n.to_str()) != manifest["id"].as_str() {
        return Err("folder does not match id".into());
    }
    Ok(manifest)
}

fn list_with(root: &Path, key: &VerifyingKey) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(root) else { return Vec::new() };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let hidden = entry.file_name().to_string_lossy().starts_with('.');
        if !path.is_dir() || hidden {
            continue;
        }
        // Veränderte oder kaputte Pakete werden übergangen, nicht geladen
        match read_installed(&path, key) {
            Ok(manifest) => out.push(manifest),
            Err(e) => eprintln!("mode package {}: {e}", path.display()),
        }
    }
    out
}

pub fn install(root: &Path, bytes: &[u8]) -> Result<Value, String> {
    install_with(root, bytes, &public_key()?)
}

pub fn list(root: &Path) -> Vec<Value> {
    match public_key() {
        Ok(key) => list_with(root, &key),
        Err(_) => Vec::new(),
    }
}

pub fn uninstall(root: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid mode id".into());
    }
    let dir = root.join(id);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn read_file(root: &Path, id: &str, name: &str) -> Option<Vec<u8>> {
    if !valid_id(id) || content_type(name).is_none() {
        return None;
    }
    fs::read(root.join(id).join(name)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[7; 32])
    }

    fn files(id: &str) -> Files {
        let manifest = format!(r#"{{"id":"{id}","name":"T","version":"1.0.0","sdk":1}}"#);
        Files::from([
            ("manifest.json".to_string(), manifest.into_bytes()),
            ("mode.js".to_string(), b"void 0".to_vec()),
        ])
    }

    fn envelope(files: &Files, signer: &SigningKey) -> Vec<u8> {
        let sig = signer.sign(&signed_message(files));
        let encoded: BTreeMap<_, _> = files.iter().map(|(n, d)| (n.clone(), STANDARD.encode(d))).collect();
        serde_json::to_vec(&serde_json::json!({ "format": 1, "files": encoded, "signature": STANDARD.encode(sig.to_bytes()) }))
            .unwrap()
    }

    fn temp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("pulse-modes-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn installs_lists_and_uninstalls() {
        let root = temp_root("roundtrip");
        let signer = key();
        let manifest = install_with(&root, &envelope(&files("demo"), &signer), &signer.verifying_key()).unwrap();
        assert_eq!(manifest["id"], "demo");
        let listed = list_with(&root, &signer.verifying_key());
        assert_eq!(listed.len(), 1);
        assert_eq!(read_file(&root, "demo", "mode.js").unwrap(), b"void 0");
        uninstall(&root, "demo").unwrap();
        assert!(list_with(&root, &signer.verifying_key()).is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_foreign_signature() {
        let root = temp_root("foreign");
        let other = SigningKey::from_bytes(&[9; 32]);
        let err = install_with(&root, &envelope(&files("demo"), &other), &key().verifying_key()).unwrap_err();
        assert_eq!(err, "signature does not match");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tampered_and_unexpected_files() {
        let signer = key();
        let good = files("demo");
        let sig = signer.sign(&signed_message(&good)).to_bytes();
        let mut tampered = good.clone();
        tampered.insert("mode.js".into(), b"alert(1)".to_vec());
        assert!(verify(&tampered, &sig, &signer.verifying_key()).is_err());
        let mut extra = good.clone();
        extra.insert("../evil.js".into(), Vec::new());
        assert!(verify(&extra, &signer.sign(&signed_message(&extra)).to_bytes(), &signer.verifying_key()).is_err());
    }

    #[test]
    fn rejects_bad_ids_and_tampered_installs() {
        let signer = key();
        let bad = files("../x");
        assert!(verify(&bad, &signer.sign(&signed_message(&bad)).to_bytes(), &signer.verifying_key()).is_err());
        assert!(read_file(Path::new("."), "..", "mode.js").is_none());
        assert!(read_file(Path::new("."), "demo", "signature").is_none());

        let root = temp_root("tampered");
        install_with(&root, &envelope(&files("demo"), &signer), &signer.verifying_key()).unwrap();
        fs::write(root.join("demo").join("mode.js"), "alert(1)").unwrap();
        assert!(list_with(&root, &signer.verifying_key()).is_empty());
        let _ = fs::remove_dir_all(root);
    }

    // Prüft ein mit scripts/build-mode.mjs gebautes Paket gegen den echten Schlüssel
    #[test]
    fn verifies_built_package() {
        let Ok(path) = std::env::var("PULSE_TEST_PACKAGE") else { return };
        let root = temp_root("built");
        let manifest = install(&root, &fs::read(path).unwrap()).unwrap();
        assert_eq!(list(&root).len(), 1, "{manifest}");
        let _ = fs::remove_dir_all(root);
    }
}
