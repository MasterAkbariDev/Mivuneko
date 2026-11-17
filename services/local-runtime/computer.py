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

def vscode_workspaces():
    """Resolve local folders only when saved VS Code state matches a currently open window."""
    from urllib.parse import urlparse, unquote
    visible = [w for w in windows()["windows"] if w["process"] == "code.exe"]
    storage = Path(os.environ.get("APPDATA", ""))/"Code"/"User"/"globalStorage"/"storage.json"
    try: state = json.loads(storage.read_text(encoding="utf-8")).get("windowsState", {})
    except (OSError, ValueError): return {"workspaces": []}
    entries = [state.get("lastActiveWindow", {}), *state.get("openedWindows", [])]
    result = []
    for entry in entries:
        uri = entry.get("folder", "")
        parsed = urlparse(uri)
        if parsed.scheme != "file" or parsed.netloc: continue
        value = unquote(parsed.path)
        if len(value)>2 and value[0]=='/' and value[2]==':': value=value[1:]
        folder = Path(value)
        if not folder.is_dir(): continue
        matching = [w for w in visible if folder.name.lower() in [part.strip().lower() for part in w["title"].split(" - ")]]
        if matching and not any(x["path"].lower() == str(folder).lower() for x in result):
            result.append({"path": str(folder), "title": matching[0]["title"], "windowId": matching[0]["id"]})
    return {"workspaces": result}

def target(handle, focus=True):
    from pywinauto import Desktop
    found = next((w for w in windows()["windows"] if w["id"] == str(handle)), None)
    if not found: raise ValueError("The selected window closed or is protected. Select another window.")
    w = Desktop(backend="uia").window(handle=int(handle)).wrapper_object()
    if focus: w.set_focus()
    return w

def element_id(e):
    return ".".join(str(x) for x in e.element_info.runtime_id)

def observe(req):
    from PIL import ImageGrab
    w = target(req["window"], focus=not req.get("background", False))
    time.sleep(0.15)
    r = w.rectangle()
    image = ImageGrab.grab(window=w.handle)
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
    return {"window": str(w.handle), "processId": w.process_id(), "title": w.window_text()[:200], "width": r.width(), "height": r.height(), "imageWidth": image.width, "imageHeight": image.height, "image": base64.b64encode(output.getvalue()).decode(), "elements": items[:100], "tools":tool_environment(),"workspaceFiles":file_action({"workspace":req["workspace"]},{"kind":"list_files"})["files"] if req.get("workspace") else [], "windows":windows()["windows"], "observation": secrets.token_hex(16)}

def file_path(root, value, allow_root=False):
    if not root: raise ValueError("This session has no folder access")
    root = Path(root).resolve(strict=True)
    path = (root / value).resolve()
    if (path == root and not allow_root) or (path != root and root not in path.parents): raise ValueError("The path must stay inside the selected folder")
    for part in path.relative_to(root).parts:
        if part.lower() in {".env", ".ssh", ".aws", ".git", "credentials", "secrets"} or part.lower().startswith(".env.") or part.lower().endswith((".pem", ".key", ".pfx")): raise ValueError("Credential and repository-internal files are not available to computer sessions")
    # Reject junctions and symlinks along the path, including final files.
    current = root
    for part in Path(value).parts:
        current = current / part
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()): raise ValueError("Linked paths are not supported")
    return path

def vscode_executable():
    candidates = []
    for base in (os.environ.get("LOCALAPPDATA"), os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
        if base:
            candidates.extend([Path(base)/"Programs"/"Microsoft VS Code"/"Code.exe", Path(base)/"Microsoft VS Code"/"Code.exe"])
    found = shutil.which("Code.exe") or shutil.which("code")
    if found:
        entry = Path(found)
        candidates.extend([entry, entry.parent.parent/"Code.exe"])
    if os.name == "nt":
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, r"Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe") as key:
                    candidates.append(Path(winreg.QueryValueEx(key, "")[0]))
            except OSError:
                pass
    for candidate in candidates:
        if candidate.name.lower() == "code.exe" and candidate.is_file():
            return candidate.resolve()
    raise ValueError("Visual Studio Code is not installed or its executable could not be found")

def powershell_executable():
    candidates = []
    if os.environ.get("ProgramFiles"):
        candidates.append(Path(os.environ["ProgramFiles"])/"PowerShell"/"7"/"pwsh.exe")
    found = shutil.which("pwsh")
    if found: candidates.append(Path(found))
    candidates.append(Path(os.environ.get("SystemRoot", r"C:\Windows"))/"System32"/"WindowsPowerShell"/"v1.0"/"powershell.exe")
    for candidate in candidates:
        if candidate.is_file(): return candidate
    raise ValueError("PowerShell is unavailable")

def tool_environment():
    tools = {name: shutil.which(name) for name in ("git", "node", "npm", "python", "cargo", "dotnet")}
    tools["python"] = sys.executable
    try: tools["powershell"] = str(powershell_executable())
    except ValueError: tools["powershell"] = None
    try: tools["vscode"] = str(vscode_executable())
    except ValueError: tools["vscode"] = None
    return {"shell": "powershell" if tools["powershell"] else None, "executables": tools, "vscodeOnPath": bool(shutil.which("code") or shutil.which("Code.exe")), "powershellVersion": 7 if tools["powershell"] and Path(tools["powershell"]).name.lower() == "pwsh.exe" else 5}

def shell_path(path):
    value = str(path)
    prefix = "\\\\?\\"
    if value.startswith(prefix + "UNC\\"):
        return "\\\\" + value[len(prefix) + 4:]
    return value[len(prefix):] if value.startswith(prefix) else value

def run_command(req, action):
    import subprocess
    import tempfile
    command = action.get("command", "")
    runtime = action.get("executable")
    args = action.get("args", [])
    if runtime:
        if runtime not in {"node", "python", "git", "npm", "cargo", "dotnet"} or not isinstance(args, list) or len(args) > 128 or any(not isinstance(arg, str) or len(arg) > 16000 or "\0" in arg for arg in args):
            raise ValueError("Choose a discovered executable and a bounded literal argument list")
        if command: raise ValueError("Use a shell command or executable arguments, not both")
    elif not isinstance(command, str) or not command.strip() or len(command) > 16000 or "\0" in command:
        raise ValueError("A terminal command must contain 1–16000 characters")
    cwd = file_path(req.get("workspace", ""), action.get("cwd", "."), allow_root=True)
    if not cwd.is_dir(): raise ValueError("The terminal working directory must be an existing folder")
    timeout = max(1, min(300, float(action.get("seconds", 120))))
    env = {key: value for key, value in os.environ.items() if not any(word in key.upper() for word in ("API_KEY", "TOKEN", "SECRET", "PASSWORD", "PRIVATE_KEY", "ACCESS_KEY")) and key.upper() not in {"GEMINI_KEYS", "MIVUNEKO_GEMINI_KEYS", "SSH_AUTH_SOCK"}}
    try: env["MIVUNEKO_VSCODE"] = str(vscode_executable())
    except ValueError: env.pop("MIVUNEKO_VSCODE", None)
    if runtime:
        tools = tool_environment()["executables"]
        executable = tools.get(runtime)
        if not executable: return {"exitCode":127,"stdout":"","stderr":f"{runtime} executable was not discovered","cwd":shell_path(cwd),"command":runtime,"timedOut":False,"truncated":False}
        argv = [executable, *args]
        if runtime == "npm" and Path(executable).suffix.lower() == ".cmd":
            cli = Path(executable).parent/"node_modules"/"npm"/"bin"/"npm-cli.js"
            node = tools.get("node") or str(Path(executable).parent/"node.exe")
            if not cli.is_file(): raise ValueError("The npm CLI entrypoint was not found")
            argv = [node, str(cli), *args]
        command = subprocess.list2cmdline(argv)
    else:
        executable = powershell_executable()
        script = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $global:LASTEXITCODE=0; try { & {\n" + command + "\n}; $commandSucceeded=$?; if($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}; if(-not $commandSucceeded) {exit 1}; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
        encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
        argv = [str(executable), "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        child = subprocess.Popen(argv, cwd=shell_path(cwd), env=env, stdin=subprocess.DEVNULL, stdout=output, stderr=errors, creationflags=subprocess.CREATE_NO_WINDOW)
        timed_out = False
        try: code = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            subprocess.run([str(Path(os.environ.get("SystemRoot", r"C:\Windows"))/"System32"/"taskkill.exe"), "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=5, check=False)
            child.wait(timeout=5)
            code = -1
        def read(stream):
            length = stream.tell();stream.seek(0)
            return stream.read(8192).decode("utf-8", errors="replace"), length > 8192
        stdout, out_cut = read(output);stderr, err_cut = read(errors)
    return {"command": command, "cwd": shell_path(cwd), "exitCode": code, "stdout": stdout, "stderr": stderr, "timedOut": timed_out, "truncated": out_cut or err_cut, "text": stdout + ("\n" + stderr if stderr else "")}

def file_action(req, action):
    root = req.get("workspace", "")
    if not root: raise ValueError("This session has no folder access")
    kind = action["kind"]
    if kind == "open_folder":
        p = file_path(root, action.get("path", "."), allow_root=True)
        if not p.is_dir(): raise ValueError("Choose an existing workspace directory, not a file")
        if action.get("program") != "vscode": raise ValueError("Select a supported folder editor")
        import subprocess
        child = subprocess.Popen([str(vscode_executable()), "--new-window", shell_path(p)], creationflags=subprocess.CREATE_NO_WINDOW)
        return {"openedFolder": str(p), "program": "vscode", "processId": child.pid}
    if kind == "list_files" and not action.get("path"):
        p = Path(root).resolve(strict=True)
    else: p = file_path(root, action.get("path", ""))
    if kind == "list_files": return {"files": [{"name": e.name, "directory": e.is_dir()} for e in sorted(p.iterdir()) if not e.name.startswith(".")][:200]}
    if kind == "open_file":
        if not p.is_file():raise ValueError("The file must exist before opening it")
        if action.get("program") != "notepad":raise ValueError("Select a supported editor")
        import subprocess
        executable=Path(os.environ.get("WINDIR",r"C:\Windows"))/"System32"/"notepad.exe"
        subprocess.Popen([str(executable),str(p)],creationflags=subprocess.CREATE_NO_WINDOW)
        return {"opened":str(p.relative_to(Path(root).resolve())),"program":"Notepad"}
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
    background = req.get("background", False)
    if kind == "run_command": return run_command(req, a)
    if kind == "switch_window":
        w=target(a["window"], focus=not background)
        return {"switched":str(w.handle)}
    if kind == "system_info":
        import psutil
        return {"cpuPercent":psutil.cpu_percent(interval=.2),"memory":dict(psutil.virtual_memory()._asdict()),"disks":[{"drive":p.mountpoint,"free":shutil.disk_usage(p.mountpoint).free,"total":shutil.disk_usage(p.mountpoint).total} for p in psutil.disk_partitions() if "fixed" in p.opts]}
    if kind in {"read_file", "open_file", "open_folder", "write_file", "list_files", "move_file", "trash_file"}: return file_action(req, a)
    w = target(req["window"], focus=not background)
    expected=req.get("expected")
    if expected:
        if expected.get("processId") and w.process_id()!=expected["processId"]:raise ValueError("The window changed after observation. Observe it again before acting.")
        current=w.rectangle()
        if not a.get("element") and (current.width()!=expected.get("width") or current.height()!=expected.get("height")):
            raise ValueError("The window changed after observation. Observe it again before acting.")
    if kind == "focus": return {"focused":not background, "background":background}
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
    element = None
    if a.get("element"):
        element = next((e for e in w.descendants()[:600] if element_id(e) == a["element"]), None)
        if element is None: raise ValueError("The UI element changed. Observe the window again.")
        if getattr(element.element_info, "is_password", False): raise ValueError("Protected input requires manual interaction")
        if not element.is_visible() or not element.is_enabled(): raise ValueError("The target is unavailable")
        er = element.rectangle(); x, y = er.mid_point().x-r.left, er.mid_point().y-r.top
    else:
        x = round(float(a.get("x", 500))/1000*r.width()); y = round(float(a.get("y", 500))/1000*r.height())
    if not 0 <= x < r.width() or not 0 <= y < r.height(): raise ValueError("Input must stay inside the selected window")
    if background:
        try:
            if kind == "click" and element is not None:
                if element.element_info.control_type in {"Edit", "Document"}:
                    return {"selected":a["element"],"background":True}
                if element.element_info.control_type == "CheckBox":element.iface_toggle.Toggle()
                else:element.iface_invoke.Invoke()
            elif kind == "type" and element is not None:
                text=a.get("text", "")
                if len(text)>12000:raise ValueError("Type up to 12000 characters at a time")
                if text.lower().lstrip().startswith(("javascript:","powershell:","ms-settings:","cmd.exe")):raise ValueError("System command and settings protocols are unavailable")
                if element.handle and element.element_info.control_type == "Edit":
                    # Native edit messages avoid providers that focus their window
                    # as a side effect of UIA ValuePattern.SetValue.
                    buffer=ctypes.create_unicode_buffer(text);result=ctypes.c_size_t()
                    send=ctypes.windll.user32.SendMessageTimeoutW
                    send.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.POINTER(ctypes.c_size_t)]
                    if not send(ctypes.c_void_p(element.handle),0x000C,0,ctypes.cast(buffer,ctypes.c_void_p),2,2000,ctypes.byref(result)):raise RuntimeError("Edit control did not respond")
                else:element.iface_value.SetValue(text)
            elif kind == "scroll":
                amount=float(a.get("amount",3))
                (element or w).iface_scroll.Scroll(2,3 if amount>0 else 1)
            else:
                raise RuntimeError("No background control pattern")
            return {"performed":kind,"background":True}
        except ValueError:raise
        except Exception:
            raise ValueError("FOREGROUND_REQUIRED: This control needs visible mouse or keyboard interaction.")
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
        from pywinauto.uia_defines import IUIA
        focused=IUIA().iuia.GetFocusedElement()
        if focused.CurrentIsPassword or focused.CurrentProcessId != w.process_id():raise ValueError("Focus moved or the input is protected; observe the window again")
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
    if req["op"] == "nonce":return {"nonce":secrets.token_hex(32)}
    if req["op"] == "workspace":
        return {"title":"Requested workspace","width":0,"height":0,"image":"","elements":[],"tools":tool_environment(),"workspaceFiles":file_action({"workspace":req["workspace"]},{"kind":"list_files"})["files"],"observation":secrets.token_hex(16)}
    if req["op"] == "web_results":
        from urllib.request import Request,build_opener,ProxyHandler
        from urllib.parse import urlencode,urlparse
        import xml.etree.ElementTree as ET
        query=str(req.get("query","")).strip()
        if not query or len(query)>500:raise ValueError("Invalid search query")
        opener=build_opener(ProxyHandler({}))
        def fetch(url):
            with opener.open(Request(url,headers={"User-Agent":"Mivuneko/0.3 (desktop companion page lookup)"}),timeout=8) as response:return response.read(1500000)
        results=[]
        try:
            feed=ET.fromstring(fetch("https://www.bing.com/search?"+urlencode({"q":query,"format":"rss"})))
            for item in feed.findall("./channel/item")[:8]:
                url=item.findtext("link","");parsed=urlparse(url)
                if parsed.scheme in {"http","https"} and parsed.hostname and not parsed.username and not parsed.password:
                    results.append({"title":item.findtext("title","")[:300],"url":url,"snippet":item.findtext("description","")[:800]})
        except Exception:pass
        try:
            import re,html
            payload=json.loads(fetch("https://en.wikipedia.org/w/api.php?"+urlencode({"action":"query","list":"search","srsearch":query,"srlimit":6,"format":"json"})))
            wiki=[{"title":item["title"],"url":"https://en.wikipedia.org/?curid="+str(item["pageid"]),"snippet":html.unescape(re.sub('<[^>]+>','',item.get("snippet","")))[:800]} for item in payload.get("query",{}).get("search",[])]
            results=wiki+results
        except Exception:pass
        if not results:raise ValueError("Web lookup is unavailable. Check the internet connection; I have not opened a guessed page.")
        return {"results":results}
    if req["op"] == "browser":
        from urllib.parse import urlparse
        url=req["url"];parsed=urlparse(url)
        if parsed.scheme not in {"http","https"} or not parsed.hostname or parsed.username or parsed.password:raise ValueError("Invalid website address")
        browser=req.get("browser","default")
        if browser=="default":os.startfile(url)
        else:
            import winreg,subprocess
            executable={"edge":"msedge.exe","chrome":"chrome.exe","firefox":"firefox.exe"}.get(browser)
            if not executable:raise ValueError("Unsupported browser")
            path=None
            for hive in [winreg.HKEY_CURRENT_USER,winreg.HKEY_LOCAL_MACHINE]:
                for view in [winreg.KEY_WOW64_64KEY,winreg.KEY_WOW64_32KEY]:
                    try:
                        with winreg.OpenKey(hive,r"Software\Microsoft\Windows\CurrentVersion\App Paths"+chr(92)+executable,0,winreg.KEY_READ|view) as key:path=winreg.QueryValue(key,None).strip('"')
                    except OSError:continue
                    if path:break
                if path:break
            if not path or not Path(path).is_file():raise ValueError("The requested browser is not installed")
            startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=4
            subprocess.Popen([path,url],startupinfo=startup,creationflags=subprocess.CREATE_NO_WINDOW)
        return {"opened":True,"url":url,"background":True}
    if req["op"] == "windows": return windows()
    if req["op"] == "editor_workspaces": return vscode_workspaces()
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
