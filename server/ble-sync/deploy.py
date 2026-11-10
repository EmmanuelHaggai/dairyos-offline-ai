#!/usr/bin/env python3
"""Apply only reviewed service/controller additions; preserve unrelated server edits."""
import hashlib, os, shutil, subprocess, tempfile
from datetime import datetime, timezone
from pathlib import Path
root=Path('/var/www/DairyOS');stage=Path(__file__).resolve().parent
files=[('application/libraries/Farm_iot_service.php','51f94fc2d951fd410d3c3d58b05e805f65d589c05b39172a50d7395025a4408b'),('application/modules/devices/controllers/iot_api.php','5b8b319956ac2948007e1cadaae4d35ad52fff2e41b2f8f5eaab8084f58dc182')]
for name,digest in files:
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
  raise SystemExit('Source changed since review: '+name+'; rebase before applying.')
for name in ['Farm_iot_service.php','iot_api.php']:subprocess.run(['php','-l',str(stage/name)],check=True)
subprocess.run(['php',str(stage/'check.php')],check=True)
route=root/'application/config/routes.php';text=route.read_text();line="$route['api/v1/iot/local-command'] = 'devices/iot_api/local_command';"
if line not in text:
 marker="$route['api/v1/iot/acknowledge'] = 'devices/iot_api/acknowledge';"
 if marker not in text:raise SystemExit('Expected IoT route marker missing')
 text=text.replace(marker,marker+'\n'+line)
backup=Path('/var/backups/dairyos-ble-sync')/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup.mkdir(parents=True,mode=0o700)
for name,_ in files:
 path=root/name;shutil.copy2(path,backup/path.name)
shutil.copy2(route,backup/'routes.php')
def replace(path,data):
 stat=path.stat();fd,tmp=tempfile.mkstemp(dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,stat.st_mode);os.chown(tmp,stat.st_uid,stat.st_gid);os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
try:
 for name,_ in files:replace(root/name,(stage/Path(name).name).read_bytes())
 replace(route,text.encode())
 subprocess.run(['php','-l',str(route)],check=True)
except BaseException:
 for name,_ in files:replace(root/name,(backup/Path(name).name).read_bytes())
 replace(route,(backup/'routes.php').read_bytes());raise
print('DEPLOYED; rollback copies: '+str(backup))
