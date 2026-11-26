use std::path::{Component, Path};

/// Centralized policy protecting sensitive environment files, credentials,
/// private keys, and internal Git metadata from IDE filesystem operations.
pub struct SensitivePathPolicy;

impl SensitivePathPolicy {
    /// Returns `true` if `path` matches any protected sensitive file or directory pattern.
    /// Ordinary project files (`package.json`, `tsconfig.json`, `Cargo.toml`, `.gitignore`, etc.)
    /// remain allowed.
    pub fn is_sensitive(path: &Path) -> bool {
        let components: Vec<String> = path
            .components()
            .filter_map(|c| match c {
                Component::Normal(os) => Some(os.to_string_lossy().to_lowercase()),
                _ => None,
            })
            .collect();

        if components.is_empty() {
            return false;
        }

        // Check every directory / path component for protected containers
        for (idx, comp) in components.iter().enumerate() {
            let is_last = idx + 1 == components.len();

            // Protected credential / key directories (and anything inside them)
            if matches!(
                comp.as_str(),
                ".ssh" | ".gnupg" | ".aws" | ".kube" | ".docker" | ".azure" | ".gcloud"
            ) {
                return true;
            }

            // Protected internal Git metadata directory and its contents (.git, .git/config, .git/hooks/*, etc.)
            // Note: .gitignore, .gitattributes, .gitmodules, .gitkeep are separate filenames and remain allowed.
            if comp == ".git" {
                return true;
            }

            if !is_last && comp == "secrets" {
                return true;
            }
        }

        if let Some(file_name) = components.last() {
            return Self::is_sensitive_filename(file_name);
        }

        false
    }

    fn is_sensitive_filename(name: &str) -> bool {
        // Environment files (.env, .env.local, .env.production, .env.*, etc.)
        if name == ".env" || name.starts_with(".env.") {
            return true;
        }

        // Exact credential, SSH, and application secret filenames
        if matches!(
            name,
            "id_rsa"
                | "id_dsa"
                | "id_ecdsa"
                | "id_ed25519"
                | "id_xmss"
                | "authorized_keys"
                | "known_hosts"
                | ".npmrc"
                | ".yarnrc"
                | ".yarnrc.yml"
                | ".pypirc"
                | ".netrc"
                | "_netrc"
                | ".htpasswd"
                | ".pgpass"
                | ".my.cnf"
                | ".boto"
                | ".s3cfg"
                | "credentials"
                | "credentials.json"
                | "secrets.json"
                | "secrets.yaml"
                | "secrets.yml"
                | "secrets.toml"
                | ".secrets"
                | "vault.json"
                | "terraform.tfvars"
                | "kubeconfig"
        ) {
            return true;
        }

        // SSH private key prefixes like id_rsa.pub? No, id_rsa.key / id_ed25519_prod, etc.
        // Keep public .pub keys safe only if explicitly .pub? Actually blocking id_rsa* except .pub or blocking all id_rsa* private keys:
        if (name.starts_with("id_rsa.")
            || name.starts_with("id_dsa.")
            || name.starts_with("id_ecdsa.")
            || name.starts_with("id_ed25519."))
            && !name.ends_with(".pub")
        {
            return true;
        }

        // Cloud service account JSON credential files
        if (name.contains("service-account") || name.contains("service_account"))
            && name.ends_with(".json")
        {
            return true;
        }

        // Sensitive key, certificate, keystore, and secret extensions
        if let Some((_, ext)) = name.rsplit_once('.') {
            if matches!(
                ext,
                "pem"
                    | "key"
                    | "p12"
                    | "pfx"
                    | "jks"
                    | "keystore"
                    | "ppk"
                    | "kdbx"
                    | "ovpn"
                    | "tfvars"
            ) {
                return true;
            }
        }

        false
    }
}
