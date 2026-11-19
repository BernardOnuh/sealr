#!/usr/bin/env python3
"""Render video.html frame by frame with headless Chrome (DevTools protocol, stdlib only).

usage: python3 render_frames.py OUT_DIR [--fps 30] [--page vox.html]
"""
import argparse
import base64
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE = Path(__file__).resolve().parent


class DevTools:
    """Just enough of a WebSocket client to speak the Chrome DevTools protocol."""

    def __init__(self, ws_url):
        host_port, path = ws_url[len("ws://"):].split("/", 1)
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, host_port, key)).encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.sock.recv(4096)
        assert b" 101 " in resp.split(b"\r\n")[0], resp
        self.buf = resp.split(b"\r\n\r\n", 1)[1]
        self.next_id = 0

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise ConnectionError("DevTools socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _recv_message(self):
        data = b""
        while True:
            b0, b1 = self._read(2)
            length = b1 & 0x7F
            if length == 126:
                length = int.from_bytes(self._read(2), "big")
            elif length == 127:
                length = int.from_bytes(self._read(8), "big")
            data += self._read(length)
            if b0 & 0x80:
                return json.loads(data)

    def call(self, method, **params):
        self.next_id += 1
        payload = json.dumps({"id": self.next_id, "method": method, "params": params}).encode()
        mask = os.urandom(4)
        header = bytes([0x81])
        n = len(payload)
        if n < 126:
            header += bytes([0x80 | n])
        elif n < 65536:
            header += bytes([0x80 | 126]) + n.to_bytes(2, "big")
        else:
            header += bytes([0x80 | 127]) + n.to_bytes(8, "big")
        self.sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
        while True:
            msg = self._recv_message()
            if msg.get("id") == self.next_id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg["result"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--page", default="video.html")
    args = ap.parse_args()
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    with socket.socket() as probe:  # a free port of our own, so two renders can never share one browser
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    profile = tempfile.mkdtemp(prefix="chrome-video-")
    chrome = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=%d" % port,
                               "--user-data-dir=" + profile, "--window-size=1920,1080", (HERE / args.page).as_uri()],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                targets = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port).read())
                page = next(t for t in targets if t["type"] == "page")
                break
            except (OSError, StopIteration):
                time.sleep(0.1)
        dt = DevTools(page["webSocketDebuggerUrl"])
        dt.call("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)
        dt.call("Runtime.evaluate", expression="Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode())])",
                awaitPromise=True)
        duration = dt.call("Runtime.evaluate", expression="window.DURATION", returnByValue=True)["result"]["value"]
        frames = int(duration * args.fps)
        start = time.time()
        for i in range(frames):
            dt.call("Runtime.evaluate", expression="render(%f)" % (i / args.fps))
            for attempt in range(3):
                try:
                    shot = dt.call("Page.captureScreenshot", format="jpeg", quality=92)
                    break
                except RuntimeError:
                    if attempt == 2:
                        raise
                    time.sleep(1)
            (out / ("f%05d.jpg" % i)).write_bytes(base64.b64decode(shot["data"]))
            if i % 300 == 0:
                print("frame %d/%d (%.0fs)" % (i, frames, time.time() - start), flush=True)
        print("rendered %d frames in %.0fs" % (frames, time.time() - start))
    finally:
        chrome.terminate()


if __name__ == "__main__":
    main()
