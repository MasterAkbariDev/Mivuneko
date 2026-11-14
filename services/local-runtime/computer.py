"""Window-scoped Windows UI Automation and workspace file operations for Mivuneko."""
import base64
import ctypes
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import time

BLOCKED = {"windowsterminal.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "consent.exe", "credentialuibroker.exe", "logonui.exe", "lockapp.exe", "keepass.exe", "keepassxc.exe", "1password.exe", "bitwarden.exe", "msmpeng.exe", "sechealthui.exe", "chatgpt.exe", "codex.exe", "mivuneko.exe", "mivuneko-desktop.exe"}

def process_name(pid):
    ctypes.windll.kernel32.OpenProcess.restype = ctypes.c_void_p
    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
    if not handle: return ""
    try:
        size = ctypes.c_ulong(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        ctypes.windll.kernel32.QueryFullProcessImageNameW(ctypes.c_void_p(handle), 0, buffer, ctypes.byref(size))
        return Path(buffer.value).name.lower()
    finally: ctypes.windll.kernel32.CloseHandle(ctypes.c_void_p(handle))

def windows():
    from pywinauto import Desktop
    result = []
    for w in Desktop(backend="uia").windows(visible_only=True):
        try:
            title = w.window_text().strip()
            process = process_name(w.process_id())
            if not title or not process or process in BLOCKED or any(s in title.lower() for s in ["windows security", "sign in to your account", "password manager"]): continue
            r = w.rectangle()
            if r.width() < 120 or r.height() < 80: continue
            result.append({"id": str(w.handle), "title": title[:200], "process": process})
        except Exception: continue
    return {"windows": result[:80], "nonce": secrets.token_hex(32)}

def target(handle):
    from pywinauto import Desktop
    found = next((w for w in windows()["windows"] if w["id"] == str(handle)), None)
    if not found: raise ValueError("The selected window closed or is protected. Select another window.")
    w = Desktop(backend="uia").window(handle=int(handle)).wrapper_object()
    w.set_focus()
    return w

def element_id(e):
    return ".".join(str(x) for x in e.element_info.runtime_id)

def observe(req):
    from PIL import ImageGrab
    w = target(req["window"])
    time.sleep(0.15)
    r = w.rectangle()
    image = ImageGrab.grab(bbox=(r.left, r.top, r.right, r.bottom), all_screens=True)
    image.thumbnail((1280, 1000))
    output = io.BytesIO(); image.convert("RGB").save(output, format="JPEG", quality=80)
    items = []
    for e in w.descendants()[:600]:
        try:
            info = e.element_info
            if not e.is_visible() or info.control_type in {"Pane", "Window", "Group"}: continue
            protected = bool(getattr(info, "is_password", False))
            rect = e.rectangle()
            if rect.width() <= 0 or rect.height() <= 0: continue
            items.append({"id": element_id(e), "role": info.control_type, "name": "Protected input" if protected else info.name[:260], "protected": protected, "enabled": e.is_enabled(), "bounds": [rect.left-r.left, rect.top-r.top, rect.right-r.left, rect.bottom-r.top]})
        except Exception: continue
    return {"window": str(w.handle), "title": w.window_text()[:200], "width": r.width(), "height": r.height(), "imageWidth": image.width, "imageHeight": image.height, "image": base64.b64encode(output.getvalue()).decode(), "elements": items[:100], "windows":windows()["windows"], "observation": secrets.token_hex(16)}

def file_path(root, value):
    if not root: raise ValueError("This session has no folder access")
    root = Path(root).resolve(strict=True)
    path = (root / value).resolve()
    if path == root or root not in path.parents: raise ValueError("The path must stay inside the selected folder")
    for part in path.relative_to(root).parts:
        if part.lower() in {".env", ".ssh", ".aws", ".git", "credentials", "secrets"} or part.lower().startswith(".env.") or part.lower().endswith((".pem", ".key", ".pfx")): raise ValueError("Credential and repository-internal files are not available to computer sessions")
    # Reject junctions and symlinks along the path, including final files.
    current = root
    for part in Path(value).parts:
        current = current / part
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()): raise ValueError("Linked paths are not supported")
    return path

def file_action(req, action):
    root = req.get("workspace", "")
    if not root: raise ValueError("This session has no folder access")
    kind = action["kind"]
    if kind == "list_files" and not action.get("path"):
        p = Path(root).resolve(strict=True)
    else: p = file_path(root, action.get("path", ""))
    if kind == "list_files": return {"files": [{"name": e.name, "directory": e.is_dir()} for e in sorted(p.iterdir()) if not e.name.startswith(".")][:200]}
    if kind == "read_file":
        if p.stat().st_size > 131072: raise ValueError("Read files in sections; this file exceeds 128 KB")
        return {"text": p.read_text(encoding="utf-8")}
    if kind == "write_file":
        text = action.get("text", "")
        if len(text.encode()) > 131072: raise ValueError("A file edit is limited to 128 KB")
        if p.exists():
            backup = Path(req["backupDir"]); backup.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, backup / (secrets.token_hex(8)+"-"+p.name))
        p.parent.mkdir(parents=True, exist_ok=True)
        temporary = p.with_name(p.name+".mivuneko-"+secrets.token_hex(4))
        temporary.write_text(text, encoding="utf-8"); os.replace(temporary, p)
        return {"written": str(p.relative_to(Path(root).resolve()))}
    if kind == "move_file":
        dest = file_path(root, action.get("destination", ""))
        if dest.exists(): raise ValueError("Destination already exists")
        dest.parent.mkdir(parents=True, exist_ok=True); p.rename(dest)
        return {"moved": True}
    if kind == "trash_file":
        from send2trash import send2trash
        send2trash(str(p)); return {"recycled": True}
    raise ValueError("Unknown file operation")

def act(req):
    a = req["action"]
    kind = a["kind"]
    if kind == "switch_window":
        w=target(a["window"])
        return {"switched":str(w.handle)}
    if kind == "system_info":
        import psutil
        return {"cpuPercent":psutil.cpu_percent(interval=.2),"memory":dict(psutil.virtual_memory()._asdict()),"disks":[{"drive":p.mountpoint,"free":shutil.disk_usage(p.mountpoint).free,"total":shutil.disk_usage(p.mountpoint).total} for p in psutil.disk_partitions() if "fixed" in p.opts]}
    if kind in {"read_file", "write_file", "list_files", "move_file", "trash_file"}: return file_action(req, a)
    w = target(req["window"])
    expected=req.get("expected")
    if expected:
        current=w.rectangle()
        if current.width()!=expected.get("width") or current.height()!=expected.get("height") or w.window_text()[:200]!=expected.get("title"):
            raise ValueError("The window changed after observation. Observe it again before acting.")
    if kind == "focus": return {"focused": True}
    if kind == "window":
        operation=a.get("operation")
        if operation == "maximize":w.maximize()
        elif operation == "minimize":w.minimize()
        elif operation == "restore":w.restore()
        elif operation == "close":w.close()
        else:raise ValueError("Unsupported window operation")
        return {"windowOperation":operation}
    if kind == "wait": time.sleep(min(3, max(.1, float(a.get("seconds", 1))))); return {"waited": True}
    r = w.rectangle()
    if a.get("element"):
        element = next((e for e in w.descendants()[:600] if element_id(e) == a["element"]), None)
        if element is None: raise ValueError("The UI element changed. Observe the window again.")
        if getattr(element.element_info, "is_password", False): raise ValueError("Protected input requires manual interaction")
        if not element.is_visible() or not element.is_enabled(): raise ValueError("The target is unavailable")
        er = element.rectangle(); x, y = er.mid_point().x-r.left, er.mid_point().y-r.top
    else:
        x = round(float(a.get("x", 500))/1000*r.width()); y = round(float(a.get("y", 500))/1000*r.height())
    if not 0 <= x < r.width() or not 0 <= y < r.height(): raise ValueError("Input must stay inside the selected window")
    if kind in {"click", "double_click", "right_click"}:
        w.click_input(button="right" if kind == "right_click" else "left", coords=(x,y), double=kind == "double_click")
    elif kind == "drag":
        tx=round(float(a["toX"])/1000*r.width());ty=round(float(a["toY"])/1000*r.height())
        if not 0<=tx<r.width() or not 0<=ty<r.height(): raise ValueError("Drag must stay inside the selected window")
        w.drag_mouse_input(src=(x,y),dst=(tx,ty))
    elif kind == "type":
        from pywinauto.uia_defines import IUIA
        focused = IUIA().iuia.GetFocusedElement()
        if focused.CurrentIsPassword or focused.CurrentProcessId != w.process_id(): raise ValueError("Focus moved or the input is protected; observe the window again")
        text = a.get("text", "")
        if len(text)>12000: raise ValueError("Type up to 12000 characters at a time")
        if text.lower().lstrip().startswith(("javascript:", "powershell:", "ms-settings:", "cmd.exe")): raise ValueError("System command and settings protocols are unavailable")
        from pywinauto import keyboard
        escaped="".join("{"+c+"}" if c in "+^%~{}()" else c for c in text)
        keyboard.send_keys(escaped, with_spaces=True, with_newlines=True, with_tabs=True, pause=.002)
    elif kind == "key":
        from pywinauto import keyboard
        parts=a.get("key", "").upper().split("+")
        if set(parts)=={"CTRL","ALT","DELETE"}:raise ValueError("Secure-desktop shortcuts require manual interaction")
        mods={"CTRL":"^","CONTROL":"^","ALT":"%","SHIFT":"+"}
        names={"ENTER":"ENTER","TAB":"TAB","ESC":"ESC","ESCAPE":"ESC","BACKSPACE":"BACKSPACE","DELETE":"DELETE","LEFT":"LEFT","RIGHT":"RIGHT","UP":"UP","DOWN":"DOWN","HOME":"HOME","END":"END","PAGEUP":"PGUP","PAGEDOWN":"PGDN","SPACE":"SPACE"}
        if any(p not in mods for p in parts[:-1]): raise ValueError("Unsupported keyboard shortcut")
        last=parts[-1]
        if len(last)==1 and last.isalnum(): code=last.lower()
        elif last in names: code="{"+names[last]+"}"
        elif last.startswith("F") and last[1:].isdigit() and 1<=int(last[1:])<=12: code="{"+last+"}"
        else: raise ValueError("Unsupported key")
        keyboard.send_keys("".join(mods[p] for p in parts[:-1])+code)
    elif kind == "scroll":
        w.scroll(direction="down" if float(a.get("amount", 3))>0 else "up", amount=min(10, max(1, abs(int(a.get("amount",3))))))
    else: raise ValueError("Unknown computer action")
    time.sleep(.12)
    return {"performed": kind}

def run(req):
    if sys.platform != "win32": raise ValueError("Computer control currently requires Windows")
    try: ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception: pass
    if req["op"] == "windows": return windows()
    if req["op"] == "surfaces":
        from pywinauto import Desktop
        user=ctypes.windll.user32
        user.FindWindowW.restype=ctypes.c_void_p;user.FindWindowExW.restype=ctypes.c_void_p
        found=[]
        for parent in Desktop(backend="win32").windows(visible_only=False):
            try:
                shell=user.FindWindowExW(ctypes.c_void_p(parent.handle),None,"SHELLDLL_DefView",None)
                if not shell:continue
                icons=user.FindWindowExW(ctypes.c_void_p(shell),None,"SysListView32",None)
                if not icons:continue
                for item in Desktop(backend="uia").window(handle=icons).descendants(control_type="ListItem")[:200]:
                    r=item.rectangle()
                    if r.width()>0 and r.height()>0:found.append({"id":f"icon:{r.left}:{r.top}","left":r.left,"right":r.right,"y":r.top,"kind":"icon"})
            except Exception:continue
        return found
    if req["op"] == "observe": return observe(req)
    if req["op"] == "act": return act(req)
    raise ValueError("Unknown computer request")

if __name__ == "__main__":
    try:
        request=json.load(sys.stdin)
        result=run(request)
        print(json.dumps({"ok": True,"result": result}))
    except Exception as exc: print(json.dumps({"ok": False,"error": str(exc)[:1200]}))
