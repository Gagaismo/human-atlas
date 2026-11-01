"""Fichero remoto de solo lectura sobre HTTP Range, para abrir un zip sin bajarlo entero.
Solo lee bytes: nunca ejecuta nada del zip."""
import io, urllib.request, sys

class RangeFile(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        if n < 0 or self.pos + n > self.size: n = self.size - self.pos
        if n <= 0: return b""
        end = self.pos + n - 1
        for attempt in range(6):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                break
            except Exception as e:
                if attempt == 5: raise
                import time; time.sleep(5 * (attempt + 1))
        self.pos += len(data)
        return data
    def readinto(self, b):
        d = self.read(len(b)); b[:len(d)] = d; return len(d)

URL = "https://zenodo.org/api/records/21887809/files/ImageCAS-X_dataset.zip/content"
SIZE = 1443579008
