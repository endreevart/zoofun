"""Turn garden JPEGs into a short HLS playlist the TV can AirPlay or Cast."""

from __future__ import annotations

import contextlib
import queue
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

SEGMENT_NAME = re.compile(r"^seg\d+\.ts$")


class HlsPump:
    def __init__(self) -> None:
        self._dir: Path | None = None
        self._proc: subprocess.Popen[bytes] | None = None
        self._queue: queue.Queue[bytes | None] = queue.Queue(maxsize=8)
        self._thread: threading.Thread | None = None

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> None:
        self.stop()
        self._dir = Path(tempfile.mkdtemp(prefix="zoofun-tv-"))
        playlist = self._dir / "live.m3u8"
        segment = str(self._dir / "seg%03d.ts")
        try:
            self._proc = subprocess.Popen(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "image2pipe",
                    "-framerate",
                    "6",
                    "-c:v",
                    "mjpeg",
                    "-i",
                    "pipe:0",
                    "-an",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-preset",
                    "veryfast",
                    "-tune",
                    "zerolatency",
                    "-g",
                    "12",
                    "-keyint_min",
                    "12",
                    "-f",
                    "hls",
                    "-hls_time",
                    "1",
                    "-hls_list_size",
                    "6",
                    "-hls_flags",
                    "delete_segments+independent_segments",
                    "-hls_segment_filename",
                    segment,
                    str(playlist),
                ],
                stdin=subprocess.PIPE,
            )
        except FileNotFoundError:
            shutil.rmtree(self._dir, ignore_errors=True)
            self._dir = None
            self._proc = None
            return
        self._queue = queue.Queue(maxsize=8)
        self._thread = threading.Thread(target=self._pump, daemon=True)
        self._thread.start()

    def push(self, jpeg: bytes) -> None:
        if not self.running:
            return
        with contextlib.suppress(queue.Full):
            self._queue.put_nowait(jpeg)

    def playlist(self) -> bytes | None:
        if self._dir is None:
            return None
        path = self._dir / "live.m3u8"
        if not path.exists():
            return None
        data = path.read_bytes()
        return data if b".ts" in data else None

    def segment(self, name: str) -> bytes | None:
        if self._dir is None or not SEGMENT_NAME.fullmatch(name):
            return None
        path = self._dir / name
        if not path.exists():
            return None
        return path.read_bytes()

    def stop(self) -> None:
        thread = self._thread
        proc = self._proc
        folder = self._dir
        self._thread = None
        self._proc = None
        self._dir = None
        with contextlib.suppress(queue.Full):
            self._queue.put_nowait(None)
        if proc is not None:
            if proc.stdin:
                with contextlib.suppress(OSError):
                    proc.stdin.close()
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        if thread is not None:
            thread.join(timeout=1)
        if folder is not None:
            shutil.rmtree(folder, ignore_errors=True)

    def _pump(self) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None:
            return
        while True:
            item = self._queue.get()
            if item is None:
                break
            try:
                proc.stdin.write(item)
                proc.stdin.flush()
            except BrokenPipeError:
                break
