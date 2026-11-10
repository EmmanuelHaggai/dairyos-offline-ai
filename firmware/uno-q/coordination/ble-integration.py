# Merge into the commissioned BLE host; keep its tested advertisement,
# telemetry sensor handling and current demonstration authentication policy.
import sys
sys.path.insert(0, '/opt/dairyos-output')
from client import OutputClient
from protocol import Controller

# Existing commissioned Bridge object remains responsible for sensor snapshots.
# controller = Controller(bridge, coordinator=OutputClient())
# Enable protocol-v2 advertising/telemetry ONLY after the daemon, cloud API,
# MCU dairyos_latch RPC, and removal of ALL old cloud output writers are verified.
# The updated protocol.Controller routes v1 and v2 writes through the coordinator.
# Remove startup/disconnect/finally callbacks that call dairyos_set(...,0).
# BLE disconnect must NOT reset a persistent lamp state.
# Keep actual physical-interlock enforcement in the MCU.
