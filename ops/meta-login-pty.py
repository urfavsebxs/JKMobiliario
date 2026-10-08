import os, pty, select, time

BASE = "/home/arch-tarok/.claude/jobs/9f9ca405/tmp"
LOG = os.path.join(BASE, "meta_login.log")
IN = os.path.join(BASE, "meta_reply.txt")

pid, fd = pty.fork()
if pid == 0:
    os.environ["TERM"] = "xterm-256color"
    os.chdir(BASE)
    os.execvp("claude", ["claude", "mcp", "login", "meta_social_technologies", "--no-browser"])

log = open(LOG, "wb", buffering=0)
log.write(b"[PTY abierto]\n")

sent = False
deadline = time.time() + 1800
while time.time() < deadline:
    try:
        r, _, _ = select.select([fd], [], [], 1.0)
    except (OSError, ValueError):
        break
    if r:
        try:
            data = os.read(fd, 4096)
        except OSError:
            data = b""
        if not data:
            break
        log.write(data)

    if not sent and os.path.exists(IN):
        try:
            txt = open(IN).read().strip()
        except OSError:
            txt = ""
        if txt:
            os.write(fd, (txt + "\n").encode())
            sent = True
            try:
                os.remove(IN)
            except OSError:
                pass
            log.write(b"\n[respuesta enviada al PTY]\n")

    try:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done:
            log.write(b"\n[proceso terminado]\n")
            break
    except ChildProcessError:
        break

log.write(b"[PTY cerrado]\n")
