# Sivr

> Private communication, with security-sensitive operations kept on the client.

Sivr is a privacy-focused chat client that adds an application-layer secure messaging protocol to the [hack.chat](https://hack.chat) transport model. The project is designed around a client-centric security boundary: the client derives the room encryption key, maintains the long-term cryptographic identity, signs and verifies secure packets, performs replay checks, decrypts messages, and only then renders authenticated content.

The relay remains a transport layer. It carries the wire messages needed for the room, but the Sivr client does not require the relay to perform the cryptographic operations described by the protocol.

> **Project status:** this repository contains a functional client implementation and test harness, but this README does not claim an independent security audit, formal verification, or a production security certification.

## Contents

- [Overview](#overview)
- [Key capabilities](#key-capabilities)
- [Security model](#security-model)
- [Cryptographic design](#cryptographic-design)
- [SIVR protocol](#sivr-protocol)
- [Identity and trust](#identity-and-trust)
- [Replay protection](#replay-protection)
- [Transport](#transport)
- [Local storage and privacy](#local-storage-and-privacy)
- [Room history export](#room-history-export)
- [QR workflows](#qr-workflows)
- [Application architecture](#application-architecture)
- [Supported packaging targets](#supported-packaging-targets)
- [Development](#development)
- [Testing](#testing)
- [Build commands](#build-commands)
- [Security considerations and limitations](#security-considerations-and-limitations)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

## Overview

Sivr is a React/TypeScript client with native packaging integrations for Android and desktop platforms. The application uses the Web Crypto API for its cryptographic primitives and IndexedDB for persistent client-side state such as identity material, trusted fingerprints, preferences, and sequence state.

At a high level:

1. A user selects a server, room, nickname, and optional shared password.
2. Sivr loads or creates a persistent Ed25519 identity.
3. The shared password and room name are used to derive an AES-256-GCM room key with PBKDF2-SHA-256.
4. The client establishes a WebSocket connection using the hack.chat transport.
5. Sivr clients exchange signed `hello` packets containing public-key information.
6. Messages intended for Sivr are wrapped in the `[SIVR:1]` wire format.
7. Incoming secure packets are authenticated and checked before their content is presented to the UI.

The implementation intentionally keeps transport handling, protocol parsing, cryptographic operations, persistent storage, and UI responsibilities separated into dedicated modules.

## Key capabilities

- End-to-end encrypted room messaging using AES-256-GCM.
- Ed25519-based long-term client identity and message authentication.
- SHA-256 public-key fingerprints for identity display and trust management.
- Trust-On-First-Use (TOFU) fingerprint verification.
- Persistent trusted-peer records in IndexedDB.
- Per-peer sequence tracking and persisted replay protection.
- Authenticated presence discovery.
- Signed and verified `hello` packets.
- Reconnection and local state recovery.
- Rejection of malformed, unauthenticated, replayed, or undecryptable secure packets before normal message rendering.
- QR generation and scanning for room/profile workflows.
- Local room-history export as UTF-8 plain text.
- Material UI interface with responsive layouts and light/dark themes.
- Capacitor Android integration.
- Tauri desktop packaging.
- In-process fake-server infrastructure for protocol/integration testing.

## Security model

Sivr separates **transport** from **trust**.

The relay/WebSocket layer is responsible for connecting clients to a room and forwarding hack.chat-compatible messages. The Sivr client is responsible for security-sensitive processing:

| Responsibility | Sivr client | Relay |
|---|:---:|:---:|
| Room transport | ✓ | ✓ |
| Password-to-key derivation | ✓ | — |
| Message encryption/decryption | ✓ | — |
| Message signing/verification | ✓ | — |
| Identity generation/storage | ✓ | — |
| Fingerprint trust decisions | ✓ | — |
| Replay validation | ✓ | — |
| Message rendering | ✓ | — |

A successful secure message path is therefore:

**identity → key derivation → packet construction → authentication → encryption → relay → parsing → authentication → replay check → decryption → rendering**

The relay is not trusted with the plaintext of Sivr-encrypted message bodies.

## Cryptographic design

Sivr uses browser/platform-native cryptographic primitives through the Web Crypto API.

### Room key derivation

The shared room password is converted into an AES-256-GCM key with:

- PBKDF2
- SHA-256
- 250,000 iterations
- 256-bit derived key
- a deterministic salt derived from the normalized room/channel name

The room salt is not a secret. Its purpose is to bind the derived key to the room name.

The implementation derives the key from:

```text
password + normalized channel
        │
        ▼
PBKDF2-SHA-256
250,000 iterations
        │
        ▼
AES-256-GCM room key
```

### Message encryption

Message bodies use AES-256-GCM with a fresh 12-byte random IV for each encrypted string payload. GCM authentication failures are treated as decryption failures rather than producing plaintext.

### Identity and signatures

Each client has a persistent Ed25519 key pair. On first launch, Sivr generates the identity and stores it locally. The SHA-256 digest of the public key is used as the displayed fingerprint.

Secure packets use Ed25519 signatures to authenticate the public key advertised by a peer and to protect message/presence packet integrity.

### Fingerprint obfuscation

The v2 wire format does not place the raw fingerprint directly in the outer Sivr packet. Instead, the implementation wraps it into an `efp` value using AES-256-GCM with an embedded key and fixed IV.

This is **obfuscation, not a secret security boundary**. The key is shipped with the client, so anyone who has the application/source can recover it. The layer is intended to keep the raw fingerprint out of the wire representation and make trivial log scraping less direct. Authentication of the peer's public key is provided by Ed25519 signatures.

## SIVR protocol

The current implementation advertises protocol version 2 and the following features:

```text
[SIVR:1]
version = 2
features = aes-256-gcm, ed25519, presence-v1
```

A secure wire message has the conceptual form:

```text
[SIVR:1] efp:encryptedPacket
```

The receiver performs the following high-level operations:

1. Detect the Sivr protocol header.
2. Split the outer `efp` and encrypted packet.
3. Recover the fingerprint from `efp`.
4. Derive the per-packet AES key from the fingerprint using HKDF-SHA-256.
5. Decrypt and parse the inner packet.
6. Perform semantic validation.
7. For `hello`, verify that the advertised public key hashes to the claimed fingerprint and verify its Ed25519 signature.
8. For messages/presence, verify the signature before accepting authenticated content.
9. Apply freshness and sequence/replay checks where required.
10. Decrypt the message body with the room key.
11. Only then expose the readable content to the normal message UI.

The code intentionally keeps protocol parsing separate from the higher-level `SecureChannel` logic. Parsing recovers the packet; semantic trust decisions happen in the secure-channel layer.

## Identity and trust

Identity is persistent and client-local.

On first launch:

```text
load identity from IndexedDB
        │
        ├── exists → reuse it
        │
        └── missing → generate Ed25519 key pair
                         │
                         ▼
                    calculate fingerprint
                         │
                         ▼
                    persist identity
```

A peer becomes a recognizable cryptographic identity only after a valid signed `hello` is accepted.

Sivr also maintains a local trust registry. A user can inspect fingerprints from the Members/Profile flows, mark a fingerprint as trusted, and later remove that trust.

TOFU means the first accepted identity is not automatically equivalent to an independently verified out-of-band identity. Users who need stronger assurance should compare fingerprints through a trusted external channel before treating a key as confirmed.

## Replay protection

Secure message packets carry a sequence number.

Important protocol semantics:

- Each outbound `message` advances the local sequence counter.
- `hello` and `presence` packets advertise the current counter but do not consume a new sequence number.
- The local sequence state is persisted so a client restart does not intentionally reuse an already-issued counter.
- Trusted peer receive counters are persisted locally.
- A previously accepted sequence number is rejected when replayed.

The implementation serializes sequence updates to avoid races between concurrent packet processing.

## Transport

The transport layer is implemented in `src/services/network/hackchat.ts`.

Sivr uses the hack.chat text-based JSON/WebSocket model and targets the `/chat-ws` endpoint of the configured server origin. The transport handles connection lifecycle, server commands, reconnect behavior, room membership events, and system events.

The secure protocol is layered above this transport. A normal hack.chat client may see the Sivr wire text as ordinary chat content, while a Sivr client recognizes and processes the `[SIVR:1]` payload.

## Local storage and privacy

The application uses IndexedDB for persistent local state.

The codebase stores/loads data including:

- the persistent cryptographic identity;
- trusted fingerprints;
- sequence state used by replay protection;
- local preferences;
- optional remembered login/session information.

The Login UI explicitly treats the shared password as client-side data. The password is used for local key derivation rather than being passed to the Sivr secure protocol as a server-side cryptographic secret.

The project also supports a "remember last session" flow. Users who enable it should understand that the selected session credentials are persisted locally by the application.

## Room history export

The Members page can export the messages currently available on the device as a UTF-8 plain-text room history.

The export is local:

- the browser/web implementation can create a local download;
- the Tauri desktop build exposes a native `save_room_history` command;
- the native command writes into the user's `Downloads` directory;
- the filename is sanitized against path separators/traversal characters;
- existing files are not silently overwritten.

The export contains the readable message text available to the client at export time. It is not an encrypted backup format.

## QR workflows

Sivr contains QR helpers for room/profile workflows.

Room QR data contains server/room information and does not include the shared room secret. Profile QR workflows can expose identity/profile information intended for peer verification.

The camera scanner uses `getUserMedia`, requests camera permission, enumerates available cameras after permission is granted, prefers an environment/rear camera when available, and decodes QR frames in the client.

## Application architecture

The application is organized into several layers.

```text
React UI
  │
  ├── Login / Chat / Members / Profile pages
  │
  ├── Zustand session/profile stores
  │
  ▼
SecureChannel
  │
  ├── identity loading
  ├── room-key derivation
  ├── hello/signature verification
  ├── message encryption/decryption
  ├── sequence/replay checks
  └── member/trust state
  │
  ├───────────────┐
  ▼               ▼
Protocol       HackChatConnection
  │               │
  ▼               ▼
Crypto          WebSocket
  │
  ▼
Web Crypto API

Persistent local state
  └── IndexedDB
```

### Main application technologies

- React 19
- TypeScript
- Vite
- React Router
- Material UI
- Zustand
- Web Crypto API
- IndexedDB via `idb`
- `marked` + `DOMPurify` for message rendering
- `jsqr` / QRCode utilities
- Capacitor 8 for Android integration
- Tauri 2 for desktop packaging

## Supported packaging targets

The repository contains integrations for:

### Web

The Vite build produces the standard `dist` frontend bundle.

### Android

Capacitor is configured with:

- application ID: `app.sivr.client`
- app name: `Sivr`
- HTTPS Android scheme
- camera permission configuration
- pre-generated launcher resources under `resources/android`

The Android resource README documents how to scaffold/sync the native project and apply the generated launcher assets.

### Desktop

Tauri is configured for native desktop packaging. The current Tauri configuration identifies the application as:

```text
productName: Sivr
identifier: app.sivr.client
version: 0.1.0
```

The desktop bundle is configured for Windows/macOS/Linux targets through Tauri's bundle configuration, with a Windows installer configuration and native room-history saving.

## Development

### Prerequisites

Install a current Node.js environment compatible with the repository's TypeScript/Vite toolchain. The project uses npm-compatible scripts and also contains a pnpm workspace/lockfile.

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Run the type checker:

```bash
npm run typecheck
```

Run the linter:

```bash
npm run lint
```

Build the web application:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Testing

The repository defines a test command that runs the cryptographic, integration, wire-format, reconnect, and live-server test suites:

```bash
npm test
```

The project also includes an in-process fake hack.chat server in `src/services/testHarness.ts`. It allows secure-channel logic to be exercised without requiring a live network connection.

When changing protocol or cryptographic behavior, tests should cover at least:

- packet serialization/parsing;
- signature generation and verification;
- encryption/decryption failures;
- wrong-password behavior;
- fingerprint handling;
- sequence persistence;
- replay rejection;
- reconnect behavior;
- presence/hello handling.

## Build commands

### Web

```bash
npm run build
```

### Tauri development

```bash
npm run tauri:dev
```

### Tauri release build

```bash
npm run tauri:build
```

### Android

The Android resource workflow is documented in `resources/android/README.md`. A typical native Capacitor flow is:

```bash
npx cap add android
npx cap sync android
```

The repository's generated Android resources should be applied as documented there before producing a native build.

## Security considerations and limitations

Sivr's security properties should be understood precisely.

### No independent audit claim

The repository contains cryptographic code and automated tests, but the project documentation does not establish that the implementation has undergone an independent security audit, penetration test, or formal verification.

### Shared-password model

The room encryption key is derived from a shared password and channel name. Anyone who possesses the same room password can derive the same room key. Password quality therefore matters.

### TOFU is not out-of-band verification

TOFU can detect changes after an identity has been observed/trusted, but it does not by itself prove that the first key belongs to the intended person.

### Fingerprint obfuscation is not confidentiality

The embedded `efp` obfuscation key is part of the client. It should not be treated as a secret key.

### Relay visibility

Sivr protects the encrypted message content from the relay, but the relay remains part of the communication path. The implementation should not be described as providing complete traffic-analysis resistance, anonymity, or metadata hiding.

### Local device compromise

If an attacker can access the running application, local storage, device memory, or the user's unlocked profile, client-side cryptography cannot by itself restore trust in that device.

### Exported history is plaintext

Room-history export is intentionally a readable text file. Protect exported files according to the sensitivity of the conversations they contain.

### No claim of forward secrecy

The repository's documented design uses a persistent Ed25519 identity and a password-derived room key. This README therefore makes no claim that the current implementation provides a forward-secret session protocol.

## Project structure

```text
.
├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   │   ├── crypto/
│   │   ├── network/
│   │   └── protocol/
│   ├── store/
│   ├── theme/
│   ├── types/
│   └── utils/
├── resources/
│   └── android/
├── scripts/
├── src-tauri/
├── .github/
├── capacitor.config.json
├── vite.config.ts
├── package.json
└── index.html
```

The most security-sensitive implementation areas are:

```text
src/services/crypto/
src/services/protocol/
src/services/storage/
src/services/network/
```

Changes in these areas should receive extra review because they can affect interoperability or the security properties of existing clients.

## Contributing

When contributing to Sivr:

1. Keep cryptographic operations inside the dedicated crypto/protocol layers.
2. Avoid moving secrets into UI state or network-layer logs.
3. Preserve deterministic packet canonicalization when modifying signed data.
4. Treat protocol-version changes as interoperability changes.
5. Add regression tests for security-sensitive behavior.
6. Document changes to packet structure, sequence semantics, trust behavior, or persistent storage.
7. Do not describe an implementation property as a security guarantee unless the code actually enforces it.

For protocol changes, document the wire-format impact and whether older clients can continue to parse or safely ignore the new packet.

## License and attribution

The repository metadata available to this project does not specify a project license. Do not assume an open-source license from the presence of source code alone.

Sivr is built around the hack.chat transport model and includes its own application-layer protocol and client implementation. Check the repository's license files and dependency licenses before redistributing builds or source.
