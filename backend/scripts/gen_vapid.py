"""
Genera la coppia di chiavi VAPID per le notifiche push (una tantum).

Uso (dal Mac):  cd backend && pip install pywebpush && python3 scripts/gen_vapid.py
Poi esporta le due variabili nell'ambiente del backend (mai committarle):
  export VAPID_PUBLIC_KEY=...
  export VAPID_PRIVATE_KEY=...
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    priv = b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    pub = b64url(key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    print("VAPID_PUBLIC_KEY=" + pub)
    print("VAPID_PRIVATE_KEY=" + priv)
    print("\n→ aggiungile all'ambiente del backend (NON committarle nel repo).")


if __name__ == "__main__":
    main()
