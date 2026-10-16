"""
펜던트(FR-HMI, Debian 11 arm64, 인터넷 없음)에 설치할 .deb 파일을
인터넷 되는 PC에서 받는 스크립트.

  python fetch_debs.py pendant_apt.txt [패키지=버전 ...]

- pendant_apt.txt 의 "== dpkg ==" 아래(dpkg --list)로 펜던트에 이미 있는 패키지를 판단
- snapshot.debian.org 에서 Debian 11 arm64 패키지 목록을 받아 의존성 계산
- 펜던트에 없는 것만 ./pendant_debs 폴더에 받음 (SHA256 확인)
- 이미 설치된 패키지를 더 높은 버전으로 요구하면 받지 않고 경고만 출력
"""
import hashlib
import lzma
import os
import re
import sys
import urllib.request

ARCH = "arm64"
DEFAULT_TARGETS = ["mariadb-server-10.5=1:10.5.15-0+deb11u1"]
SNAPSHOTS = ["20220801T000000Z", "20220601T000000Z", "20221001T000000Z", "20220415T000000Z"]
ARCHIVES = [("debian", "bullseye"), ("debian-security", "bullseye-security")]
OUT_DIR = "pendant_debs"


# ---------- Debian 버전 비교 ----------
def _order(c):
    if c == "~":
        return -1
    if c.isdigit():
        return 0
    if c.isalpha():
        return ord(c)
    return ord(c) + 256


def _cmp_part(a, b):
    while a or b:
        na = re.match(r"^\D*", a).group(0)
        nb = re.match(r"^\D*", b).group(0)
        a, b = a[len(na):], b[len(nb):]
        for i in range(max(len(na), len(nb))):
            ca = _order(na[i]) if i < len(na) else 0
            cb = _order(nb[i]) if i < len(nb) else 0
            if ca != cb:
                return ca - cb
        da = re.match(r"^\d*", a).group(0)
        db = re.match(r"^\d*", b).group(0)
        a, b = a[len(da):], b[len(db):]
        if int(da or 0) != int(db or 0):
            return int(da or 0) - int(db or 0)
    return 0


def vcmp(x, y):
    def split(v):
        e, _, rest = v.rpartition(":") if ":" in v else ("0", "", v)
        u, _, r = rest.rpartition("-") if "-" in rest else (rest, "", "0")
        return int(e or 0), u, r
    ex, ux, rx = split(x)
    ey, uy, ry = split(y)
    if ex != ey:
        return ex - ey
    return _cmp_part(ux, uy) or _cmp_part(rx, ry)


def satisfies(ver, op, want):
    if not op:
        return True
    c = vcmp(ver, want)
    return {"=": c == 0, ">=": c >= 0, "<=": c <= 0, ">>": c > 0, "<<": c < 0}[op]


# ---------- 입력 ----------
def read_installed(path):
    inst = {}
    in_dpkg = False
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("== dpkg =="):
                in_dpkg = True
                continue
            if in_dpkg and re.match(r"^[a-z][a-z] ", line):
                p = line.split()
                if p[0][1] == "i":
                    inst[p[1].split(":")[0]] = p[2]
    return inst


def fetch(url):
    print("  GET", url, flush=True)
    with urllib.request.urlopen(url, timeout=60) as r:
        total = int(r.headers.get("Content-Length") or 0)
        buf, last = bytearray(), 0
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            buf += chunk
            if len(buf) - last >= 512 * 1024:
                last = len(buf)
                pct = f" / {total / 1e6:.1f} MB" if total else ""
                print(f"\r    {len(buf) / 1e6:.1f} MB{pct}", end="", flush=True)
        if last:
            print()
        return bytes(buf)


def parse_packages(text, base):
    pkgs = {}
    for block in text.split("\n\n"):
        d, key = {}, None
        for line in block.split("\n"):
            if line.startswith(" ") and key:
                d[key] += "\n" + line
            elif ":" in line:
                key, _, val = line.partition(":")
                d[key] = val.strip()
        if "Package" in d:
            d["_base"] = base
            pkgs.setdefault(d["Package"], []).append(d)
    return pkgs


def load_index():
    for ts in SNAPSHOTS:
        index = {}
        try:
            for arch_name, dist in ARCHIVES:
                base = f"https://snapshot.debian.org/archive/{arch_name}/{ts}/"
                url = f"{base}dists/{dist}/main/binary-{ARCH}/Packages.xz"
                part = parse_packages(lzma.decompress(fetch(url)).decode("utf-8", "replace"), base)
                for k, v in part.items():
                    index.setdefault(k, []).extend(v)
        except Exception as e:
            print("  실패:", e)
            continue
        return ts, index
    sys.exit("패키지 목록을 받지 못했습니다. 인터넷/방화벽을 확인하세요.")


# ---------- 의존성 계산 ----------
def parse_deps(s):
    out = []
    for group in filter(None, (g.strip() for g in s.split(","))):
        alts = []
        for alt in group.split("|"):
            m = re.match(r"\s*([^\s(:]+)(?::\S+)?\s*(?:\(\s*([<>=]+)\s*([^)]+?)\s*\))?", alt)
            if m:
                alts.append((m.group(1), m.group(2), m.group(3)))
        out.append(alts)
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    installed = read_installed(sys.argv[1])
    targets = sys.argv[2:] or DEFAULT_TARGETS
    print(f"펜던트 설치 패키지 {len(installed)}개 읽음")
    ts, index = load_index()
    print(f"스냅샷 {ts} 사용, 패키지 {len(index)}종")

    providers = {}
    for name, lst in index.items():
        for d in lst:
            for alts in parse_deps(d.get("Provides", "")):
                for pname, _, _ in alts:
                    providers.setdefault(pname, set()).add(name)

    def pick(name, op=None, want=None):
        cands = [d for d in index.get(name, []) if satisfies(d["Version"], op, want)]
        cands.sort(key=lambda d: d["Version"], reverse=False)
        best = None
        for d in cands:
            if best is None or vcmp(d["Version"], best["Version"]) > 0:
                best = d
        return best

    chosen, warnings, missing = {}, [], []

    def installed_ok(name, op, want):
        if name in installed:
            return satisfies(installed[name], op, want) or "old"
        for p in providers.get(name, ()):
            if p in installed and not op:
                return True
        return False

    def add(name, op=None, want=None, why=""):
        if name in chosen:
            return True
        d = pick(name, op, want)
        if d is None:
            return False
        chosen[name] = d
        for field in ("Pre-Depends", "Depends"):
            for alts in parse_deps(d.get(field, "")):
                resolve(alts, name)
        return True

    def resolve(alts, parent):
        for n, op, want in alts:
            ok = installed_ok(n, op, want)
            if ok is True or n in chosen:
                return
            if ok == "old":
                warnings.append(f"{parent} 가 {n} ({op} {want}) 요구, 펜던트는 {installed[n]}")
                return
        for n, op, want in alts:
            if add(n, op, want, parent):
                return
            for p in sorted(providers.get(n, ())):
                if add(p, None, None, parent):
                    return
        missing.append(f"{parent} -> {' | '.join(a[0] for a in alts)}")

    for t in targets:
        name, _, ver = t.partition("=")
        if not add(name, "=" if ver else None, ver or None):
            sys.exit(f"{t} 를 스냅샷에서 찾지 못했습니다.")

    print(f"\n받을 패키지 {len(chosen)}개:")
    for n in sorted(chosen):
        print("  ", n, chosen[n]["Version"])
    if warnings:
        print("\n[경고] 펜던트 버전이 낮음 (받지 않음):")
        for w in warnings:
            print("  ", w)
    if missing:
        print("\n[경고] 찾지 못한 의존성:")
        for m in missing:
            print("  ", m)
    print()
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    with open(os.path.join(OUT_DIR, "list.txt"), "w", encoding="utf-8") as lf:
        for name in sorted(chosen):
            d = chosen[name]
            fn = os.path.basename(d["Filename"])
            path = os.path.join(OUT_DIR, fn)
            lf.write(f"{name} {d['Version']} {fn}\n")
            if not os.path.exists(path):
                data = fetch(d["_base"] + d["Filename"])
                if hashlib.sha256(data).hexdigest() != d.get("SHA256"):
                    sys.exit(f"SHA256 불일치: {fn}")
                with open(path, "wb") as f:
                    f.write(data)
            total += os.path.getsize(path)
    print(f"\n완료: {len(chosen)}개, {total / 1e6:.1f} MB -> {OUT_DIR}")


if __name__ == "__main__":
    main()
