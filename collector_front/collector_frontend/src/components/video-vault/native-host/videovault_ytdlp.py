#!/usr/bin/env python3
"""Reference local helper for VideoVault yt-dlp integration (native messaging).

Reads length-prefixed JSON from stdin, writes length-prefixed JSON to stdout.
Actions: ping | formats {url} | download {url, formatId}.
Requires yt-dlp on PATH; ffmpeg optional (for merges). Never handles
passwords/cookies/tokens — login happens on the platform site itself.
"""
import json
import struct
import sys
import subprocess
import shutil


def read_msg():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    (length,) = struct.unpack("<I", raw_len)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def write_msg(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def ping():
    write_msg({"ok": True, "ytdlp": bool(shutil.which("yt-dlp")), "ffmpeg": bool(shutil.which("ffmpeg"))})


def formats(url):
    if not url or not str(url).startswith(("http://", "https://")):
        write_msg({"error": "Invalid URL", "formats": []})
        return
    try:
        out = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist", "--no-warnings", url],
            capture_output=True, text=True, timeout=25,
        )
    except FileNotFoundError:
        write_msg({"error": "yt-dlp unavailable", "formats": []})
        return
    except subprocess.TimeoutExpired:
        write_msg({"error": "network timeout", "formats": []})
        return
    text = (out.stdout or "").strip()
    err = (out.stderr or "").lower()
    if "sign in" in err or "login" in err or "not logged in" in err:
        write_msg({"authRequired": True, "error": out.stderr.strip()[-500:], "formats": []})
        return
    if "private" in err or "restricted" in err or "paywall" in err or "drm" in err:
        write_msg({"private": True, "error": out.stderr.strip()[-500:], "formats": []})
        return
    if not text:
        write_msg({"error": (out.stderr.strip()[-500:] or "yt-dlp found no formats"), "formats": []})
        return
    try:
        info = json.loads(text.splitlines()[0])
    except Exception as exc:  # noqa: BLE001 - report to UI
        write_msg({"error": f"invalid yt-dlp response: {exc}", "formats": []})
        return
    fmts = []
    for f in info.get("formats") or []:
        fmts.append({
            "format": f.get("format_note") or f.get("ext") or "",
            "ext": f.get("ext") or "",
            "quality": f.get("resolution") or (f"{f['height']}p" if f.get("height") else ""),
            "url": f.get("url") or "",
            "formatId": f.get("format_id") or "",
        })
    write_msg({"title": info.get("title") or "", "formats": fmts})


def download(url, format_id="best"):
    if not url or not str(url).startswith(("http://", "https://")):
        write_msg({"error": "Invalid URL"})
        return
    cmd = ["yt-dlp", "-f", format_id or "best", "--newline", "--no-playlist", "-o", "%(title)s.%(ext)s", url]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except FileNotFoundError:
        write_msg({"error": "yt-dlp unavailable"})
        return
    for line in proc.stdout or []:
        if "[download]" in line and "%" in line:
            try:
                pct = line.split("%")[0].split()[-1]
                write_msg({"progress": {"percent": float(pct)}})
            except Exception:  # noqa: BLE001 - best effort
                pass
    code = proc.wait()
    if code == 0:
        write_msg({"done": True, "result": {"ok": True}})
    else:
        write_msg({"error": f"yt-dlp exited with code {code}"})


def main():
    while True:
        msg = read_msg()
        if msg is None:
            break
        action = msg.get("action")
        if action == "ping":
            ping()
        elif action == "formats":
            formats(msg.get("url", ""))
        elif action == "download":
            download(msg.get("url", ""), msg.get("formatId", "best"))
        else:
            write_msg({"error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
