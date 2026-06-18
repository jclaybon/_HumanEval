#!/usr/bin/env python3

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import webbrowser
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree


APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
LEGACY_HTML_PATH = APP_DIR / "static" / "vibe-check-v2.html"
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
FRONTEND_INDEX_PATH = FRONTEND_DIST_DIR / "index.html"
DATA_DIR = ROOT_DIR / "data"
DEFAULT_IMAGE_DIR = DATA_DIR / "review_images"
DEFAULT_OUTPUT = DATA_DIR / "outputs" / "vibe_check_results.json"
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


def load_env_file(path, locked_keys):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in locked_keys:
            continue

        value = value.strip()
        if value[:1] == value[-1:] and value[:1] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def load_env_files():
    locked_keys = set(os.environ)
    load_env_file(ROOT_DIR / ".env", locked_keys)
    load_env_file(ROOT_DIR / ".env.local", locked_keys)


def env_value(name, fallback):
    return os.environ.get(name, fallback)


def parse_args():
    load_env_files()

    parser = argparse.ArgumentParser(
        description=(
            "Serve the swipe-based Vibe Check app from either a local image folder "
            "or a Cloudflare R2 bucket and start rating immediately when the page opens."
        )
    )
    parser.add_argument(
        "--source",
        choices={"local", "r2"},
        default=env_value("VIBE_CHECK_SOURCE", "local"),
        help="Image source to use: local or r2. Defaults to local.",
    )
    parser.add_argument(
        "--image-dir",
        default=env_value("VIBE_CHECK_IMAGE_DIR", str(DEFAULT_IMAGE_DIR)),
        help="Folder containing images to review when --source=local.",
    )
    parser.add_argument(
        "--output",
        default=env_value("VIBE_CHECK_OUTPUT", str(DEFAULT_OUTPUT)),
        help="Where to save the completed batch results JSON.",
    )
    parser.add_argument(
        "--host",
        default=env_value("VIBE_CHECK_HOST", "127.0.0.1"),
        help="Host to bind the local web app to. Defaults to 127.0.0.1.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(env_value("VIBE_CHECK_PORT", "8000")),
        help="Port to bind the local web app to. Defaults to 8000.",
    )
    parser.add_argument(
        "--r2-account-id",
        default=env_value("R2_ACCOUNT_ID", ""),
        help="Cloudflare account ID for R2.",
    )
    parser.add_argument(
        "--r2-bucket",
        default=env_value("R2_BUCKET", ""),
        help="R2 bucket name.",
    )
    parser.add_argument(
        "--r2-access-key-id",
        default=env_value("R2_ACCESS_KEY_ID", ""),
        help="R2 access key ID.",
    )
    parser.add_argument(
        "--r2-secret-access-key",
        default=env_value("R2_SECRET_ACCESS_KEY", ""),
        help="R2 secret access key.",
    )
    parser.add_argument(
        "--r2-prefix",
        default=env_value("R2_PREFIX", ""),
        help="Optional prefix inside the bucket to limit which images are reviewed.",
    )
    parser.add_argument(
        "--r2-endpoint",
        default=env_value("R2_ENDPOINT", ""),
        help=(
            "Optional custom R2 endpoint. Defaults to "
            "https://<account-id>.r2.cloudflarestorage.com."
        ),
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the app in the default browser after the server starts.",
    )
    return parser.parse_args()


def make_numeric_id(seed):
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return str(int(digest, 16) % (10**12)).zfill(12)


def is_supported_image(name):
    return Path(name).suffix.lower() in SUPPORTED_EXTENSIONS


def aws_encode(value):
    return quote(str(value), safe="-_.~")


def aws_encode_path(value):
    return quote(str(value), safe="/-_.~")


def canonical_query_string(params):
    encoded_pairs = []
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            values = value
        else:
            values = [value]
        for item in values:
            encoded_pairs.append((aws_encode(key), aws_encode(item)))
    encoded_pairs.sort()
    return "&".join(f"{key}={value}" for key, value in encoded_pairs)


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def child_text(element, name, default=""):
    for child in element:
        if local_name(child.tag) == name:
            return (child.text or default).strip()
    return default


def extension_mime_type(name):
    mime_type, _ = mimetypes.guess_type(name)
    return mime_type or "application/octet-stream"


def file_content_type(path):
    content_type = extension_mime_type(path.name)
    if content_type.startswith("text/") or content_type in {
        "application/javascript",
        "application/json",
    }:
        return f"{content_type}; charset=utf-8"
    return content_type


def get_frontend_entry_path():
    if FRONTEND_INDEX_PATH.exists():
        return FRONTEND_INDEX_PATH
    return LEGACY_HTML_PATH


def resolve_static_path(root_dir, request_path):
    candidate = (root_dir / request_path.lstrip("/")).resolve()
    root = root_dir.resolve()

    if candidate != root and root not in candidate.parents:
        return None
    if not candidate.exists() or not candidate.is_file():
        return None
    return candidate


def read_frontend_asset(request_path):
    if not FRONTEND_DIST_DIR.exists():
        return None

    asset_path = resolve_static_path(FRONTEND_DIST_DIR, request_path)
    if asset_path:
        return asset_path.read_bytes(), file_content_type(asset_path)

    if "." not in Path(request_path).name and FRONTEND_INDEX_PATH.exists():
        return FRONTEND_INDEX_PATH.read_bytes(), "text/html; charset=utf-8"

    return None


class ImageSourceError(RuntimeError):
    def __init__(self, message, status=HTTPStatus.BAD_GATEWAY):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class ImageRecord:
    id: str
    name: str
    key: str
    url: str


class LocalImageSource:
    source_type = "local"

    def __init__(self, image_dir):
        self.image_dir = image_dir

    @property
    def batch_name(self):
        return self.image_dir.name

    @property
    def source_label(self):
        return str(self.image_dir.resolve())

    def ensure_ready(self):
        self.image_dir.mkdir(parents=True, exist_ok=True)

    def list_records(self):
        payloads = []
        for path in sorted(
            (
                entry
                for entry in self.image_dir.iterdir()
                if entry.is_file() and is_supported_image(entry.name)
            ),
            key=lambda entry: entry.name.lower(),
        ):
            stat = path.stat()
            payloads.append(
                ImageRecord(
                    id=make_numeric_id(
                        f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}"
                    ),
                    name=path.name,
                    key=path.name,
                    url=f"/images/{quote(path.name, safe='')}",
                )
            )
        return payloads

    def read_image(self, key):
        requested_path = self.image_dir / key
        try:
            resolved = requested_path.resolve(strict=True)
        except FileNotFoundError as exc:
            raise FileNotFoundError("Image not found.") from exc

        root = self.image_dir.resolve()
        if resolved.parent != root:
            raise ImageSourceError("Invalid image path.", HTTPStatus.BAD_REQUEST)

        return resolved.read_bytes(), extension_mime_type(resolved.name)


class R2ImageSource:
    source_type = "r2"

    def __init__(
        self,
        account_id,
        bucket,
        access_key_id,
        secret_access_key,
        prefix="",
        endpoint="",
    ):
        self.account_id = account_id.strip()
        self.bucket = bucket.strip()
        self.access_key_id = access_key_id.strip()
        self.secret_access_key = secret_access_key.strip()
        self.prefix = prefix.strip().strip("/")
        self.endpoint = (
            endpoint.strip().rstrip("/")
            or f"https://{self.account_id}.r2.cloudflarestorage.com"
        )

    @property
    def batch_name(self):
        if self.prefix:
            return self.prefix.rsplit("/", 1)[-1]
        return self.bucket

    @property
    def source_label(self):
        if self.prefix:
            return f"r2://{self.bucket}/{self.prefix}"
        return f"r2://{self.bucket}"

    @property
    def list_prefix(self):
        if not self.prefix:
            return ""
        return f"{self.prefix}/"

    @classmethod
    def from_args(cls, args):
        missing = []
        for field_name, value in (
            ("R2_ACCOUNT_ID", args.r2_account_id),
            ("R2_BUCKET", args.r2_bucket),
            ("R2_ACCESS_KEY_ID", args.r2_access_key_id),
            ("R2_SECRET_ACCESS_KEY", args.r2_secret_access_key),
        ):
            if not value:
                missing.append(field_name)

        if missing:
            joined = ", ".join(missing)
            raise SystemExit(
                f"Missing R2 configuration: {joined}. "
                "Set them as flags or in .env/.env.local."
            )

        return cls(
            account_id=args.r2_account_id,
            bucket=args.r2_bucket,
            access_key_id=args.r2_access_key_id,
            secret_access_key=args.r2_secret_access_key,
            prefix=args.r2_prefix,
            endpoint=args.r2_endpoint,
        )

    def ensure_ready(self):
        return

    def _signing_key(self, datestamp):
        date_key = hmac.new(
            f"AWS4{self.secret_access_key}".encode("utf-8"),
            datestamp.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        region_key = hmac.new(date_key, b"auto", hashlib.sha256).digest()
        service_key = hmac.new(region_key, b"s3", hashlib.sha256).digest()
        return hmac.new(service_key, b"aws4_request", hashlib.sha256).digest()

    def _request(self, object_key="", query=None):
        query = query or {}
        parsed_endpoint = urlparse(self.endpoint)
        host = parsed_endpoint.netloc

        now = datetime.now(timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        datestamp = now.strftime("%Y%m%d")
        canonical_uri = (
            f"/{aws_encode(self.bucket)}"
            if not object_key
            else f"/{aws_encode(self.bucket)}/{aws_encode_path(object_key)}"
        )
        canonical_query = canonical_query_string(query)
        canonical_headers = (
            f"host:{host}\n"
            f"x-amz-content-sha256:{EMPTY_SHA256}\n"
            f"x-amz-date:{amz_date}\n"
        )
        signed_headers = "host;x-amz-content-sha256;x-amz-date"
        canonical_request = "\n".join(
            [
                "GET",
                canonical_uri,
                canonical_query,
                canonical_headers,
                signed_headers,
                EMPTY_SHA256,
            ]
        )
        credential_scope = f"{datestamp}/auto/s3/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )
        signing_key = self._signing_key(datestamp)
        signature = hmac.new(
            signing_key,
            string_to_sign.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        authorization = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self.access_key_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )

        request_url = f"{self.endpoint}{canonical_uri}"
        if canonical_query:
            request_url = f"{request_url}?{canonical_query}"

        request = Request(
            request_url,
            headers={
                "Authorization": authorization,
                "Host": host,
                "x-amz-content-sha256": EMPTY_SHA256,
                "x-amz-date": amz_date,
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=30) as response:
                return response.read(), response.headers.get_content_type()
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace").strip()
            if exc.code == 404:
                raise FileNotFoundError("Image not found.") from exc
            raise ImageSourceError(
                message or f"Cloudflare R2 request failed with status {exc.code}.",
                HTTPStatus.BAD_GATEWAY,
            ) from exc
        except URLError as exc:
            raise ImageSourceError(
                f"Could not reach Cloudflare R2: {exc.reason}",
                HTTPStatus.BAD_GATEWAY,
            ) from exc

    def list_records(self):
        continuation_token = None
        records = []

        while True:
            params = {"list-type": "2", "max-keys": "1000"}
            if self.list_prefix:
                params["prefix"] = self.list_prefix
            if continuation_token:
                params["continuation-token"] = continuation_token

            body, _ = self._request(query=params)
            try:
                root = ElementTree.fromstring(body)
            except ElementTree.ParseError as exc:
                raise ImageSourceError(
                    "Cloudflare R2 returned an unreadable object listing.",
                    HTTPStatus.BAD_GATEWAY,
                ) from exc

            for entry in root:
                if local_name(entry.tag) != "Contents":
                    continue

                key = child_text(entry, "Key")
                if not key or key.endswith("/") or not is_supported_image(key):
                    continue

                etag = child_text(entry, "ETag").strip('"')
                size = child_text(entry, "Size", "0")
                last_modified = child_text(entry, "LastModified")
                records.append(
                    ImageRecord(
                        id=make_numeric_id(f"{key}:{etag}:{size}:{last_modified}"),
                        name=key,
                        key=key,
                        url=f"/images/{quote(key, safe='')}",
                    )
                )

            if child_text(root, "IsTruncated", "false").lower() != "true":
                break

            continuation_token = child_text(root, "NextContinuationToken")
            if not continuation_token:
                break

        records.sort(key=lambda record: record.name.lower())
        return records

    def read_image(self, key):
        body, content_type = self._request(object_key=key)
        return body, content_type or extension_mime_type(key)


def validate_results(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    results = payload.get("results")
    if not isinstance(results, list):
        raise ValueError("results must be a list.")

    normalized = []
    for item in results:
        if not isinstance(item, dict):
            raise ValueError("Each result entry must be an object.")

        item_id = item.get("id") or make_numeric_id(item.get("name", ""))
        name = item.get("name")
        verdict = item.get("verdict")
        failure_points = item.get("failure_points")
        masked_areas = item.get("masked_areas", 0)
        mask_data_url = item.get("mask_data_url")
        mask_binary = item.get("mask_binary")
        notes = item.get("notes", item.get("feedback", ""))

        if not isinstance(item_id, str) or not item_id or not item_id.isdigit():
            raise ValueError("Each result must include a numeric id.")
        if not isinstance(name, str) or not name:
            raise ValueError("Each result must include a non-empty image name.")
        if verdict not in {"like", "super_like", "not_like", "skip"}:
            raise ValueError("verdict must be like, super_like, not_like, or skip.")
        if failure_points not in {None, "clear", "mark"}:
            raise ValueError("failure_points must be null, clear, or mark.")
        if not isinstance(masked_areas, int) or masked_areas < 0:
            raise ValueError("masked_areas must be a non-negative integer.")
        if mask_data_url is not None and not isinstance(mask_data_url, str):
            raise ValueError("mask_data_url must be a string when provided.")

        if mask_binary is None:
            mask_binary = "yes" if masked_areas > 0 or mask_data_url else "no"
        if mask_binary not in {"yes", "no"}:
            raise ValueError("mask_binary must be yes or no.")
        if not isinstance(notes, str):
            raise ValueError("notes must be a string.")

        normalized.append(
            {
                "id": item_id,
                "name": name,
                "verdict": verdict,
                "failure_points": failure_points,
                "mask_binary": mask_binary,
                "masked_areas": masked_areas,
                "mask_data_url": mask_data_url,
                "notes": notes.strip(),
            }
        )

    return normalized


def build_summary(results):
    rated = [item for item in results if item["verdict"] != "skip"]
    likes = [item for item in rated if item["verdict"] in {"like", "super_like"}]
    super_likes = [item for item in rated if item["verdict"] == "super_like"]
    not_likes = [item for item in rated if item["verdict"] == "not_like"]
    marked = [item for item in rated if item["failure_points"] == "mark"]

    return {
        "reviewed_count": len(rated),
        "likes": len(likes),
        "super_likes": len(super_likes),
        "not_likes": len(not_likes),
        "marked_issues": len(marked),
    }


def build_saved_payload(image_source, output_path, results):
    summary = build_summary(results)
    return {
        "app": "vibe_check",
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "batch_name": image_source.batch_name,
        "image_dir": image_source.source_label,
        "source_type": image_source.source_type,
        "output_path": str(output_path.resolve()),
        **summary,
        "results": results,
    }


def make_handler(image_source, output_path):
    class VibeCheckHandler(BaseHTTPRequestHandler):
        def _send_bytes(self, body, content_type, status=HTTPStatus.OK):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, payload, status=HTTPStatus.OK):
            body = json.dumps(payload, indent=2).encode("utf-8")
            self._send_bytes(body, "application/json; charset=utf-8", status)

        def do_GET(self):
            parsed = urlparse(self.path)

            if parsed.path == "/":
                self._send_bytes(
                    get_frontend_entry_path().read_bytes(),
                    "text/html; charset=utf-8",
                )
                return

            if parsed.path == "/api/bootstrap":
                try:
                    records = image_source.list_records()
                except ImageSourceError as exc:
                    self._send_json({"error": str(exc)}, exc.status)
                    return

                payload = {
                    "batch_name": image_source.batch_name,
                    "image_dir": image_source.source_label,
                    "source_type": image_source.source_type,
                    "output_path": str(output_path.resolve()),
                    "images": [
                        {
                            "id": record.id,
                            "name": record.name,
                            "url": record.url,
                        }
                        for record in records
                    ],
                }
                self._send_json(payload)
                return

            if parsed.path == "/health":
                self._send_json({"ok": True})
                return

            if parsed.path.startswith("/images/"):
                key = unquote(parsed.path.removeprefix("/images/"))
                if not key:
                    self._send_json(
                        {"error": "Image key missing."},
                        HTTPStatus.BAD_REQUEST,
                    )
                    return

                try:
                    body, content_type = image_source.read_image(key)
                except FileNotFoundError:
                    self._send_json({"error": "Image not found."}, HTTPStatus.NOT_FOUND)
                    return
                except ImageSourceError as exc:
                    self._send_json({"error": str(exc)}, exc.status)
                    return

                self._send_bytes(body, content_type)
                return

            frontend_asset = read_frontend_asset(parsed.path)
            if frontend_asset:
                body, content_type = frontend_asset
                self._send_bytes(body, content_type)
                return

            self._send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)

        def do_POST(self):
            parsed = urlparse(self.path)
            if parsed.path != "/api/save-results":
                self._send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
                return

            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length)
                payload = json.loads(raw_body.decode("utf-8"))
                results = validate_results(payload)
                saved_payload = build_saved_payload(image_source, output_path, results)
                output_path.write_text(
                    json.dumps(saved_payload, indent=2) + "\n",
                    encoding="utf-8",
                )
            except json.JSONDecodeError:
                self._send_json(
                    {"error": "Request body must be valid JSON."},
                    HTTPStatus.BAD_REQUEST,
                )
                return
            except ValueError as exc:
                self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            except OSError as exc:
                self._send_json(
                    {"error": f"Could not write results: {exc}"},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
                return

            self._send_json(saved_payload)

        def log_message(self, format_, *args):
            return

    return VibeCheckHandler


def build_image_source(args):
    if args.source == "r2":
        return R2ImageSource.from_args(args)
    return LocalImageSource(Path(args.image_dir).expanduser())


def main():
    args = parse_args()
    image_source = build_image_source(args)
    output_path = Path(args.output).expanduser()
    frontend_entry_path = get_frontend_entry_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image_source.ensure_ready()

    if not frontend_entry_path.exists():
        raise SystemExit(f"Frontend file not found: {frontend_entry_path}")

    handler = make_handler(image_source, output_path)

    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        url = f"http://{args.host}:{server.server_address[1]}"
        frontend_label = (
            "React build"
            if frontend_entry_path == FRONTEND_INDEX_PATH
            else "legacy static HTML"
        )
        print(f"Serving frontend from {frontend_entry_path} ({frontend_label})")
        print(f"Serving Vibe Check from {image_source.source_label}")
        print(f"Saving results to {output_path.resolve()}")
        print(f"Open {url} in your browser")
        print("Press Ctrl+C to stop the server")

        if args.open:
            webbrowser.open(url)

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
