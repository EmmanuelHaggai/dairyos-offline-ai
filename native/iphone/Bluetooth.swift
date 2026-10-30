import CoreBluetooth
import UIKit

// Foreground-only BLE central. The board owns its independent run timer.
final class FarmBluetooth: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    let service = CBUUID(string: "d8a10000-7c36-4f19-aef4-76b80a0d1000")
    let telemetry = CBUUID(string: "d8a10001-7c36-4f19-aef4-76b80a0d1000")
    let control = CBUUID(string: "d8a10002-7c36-4f19-aef4-76b80a0d1000")
    var central: CBCentralManager!
    var devices: [UUID: CBPeripheral] = [:]
    var peripheral: CBPeripheral?
    var tx: CBCharacteristic?
    var rx: CBCharacteristic?
    var subscription: String?
    var timer: Timer?
    var writeID: String?
    var writeTimer: Timer?
    var recovering = false
    var recoveryTimeout: Timer?
    var reconnectTimer: Timer?
    var diagnostics: [[String: Any]] = []
    var lastTelemetryLog = Date.distantPast
    var telemetryCount = 0
    var emit: (String, String, Any) -> Void
    init(emit: @escaping (String, String, Any) -> Void) { self.emit = emit; super.init() }
    func event(_ value: [String: Any]) {
        if value["kind"] as? String == "telemetry" { telemetryCount += 1 }
        if value["kind"] as? String != "telemetry" || Date().timeIntervalSince(lastTelemetryLog) >= 10 {
            var record = value; record["time"] = ISO8601DateFormatter().string(from: Date())
            diagnostics.append(record); diagnostics = Array(diagnostics.suffix(40))
            if value["kind"] as? String == "telemetry" { lastTelemetryLog = Date() }
            let home = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let report: [String: Any] = ["events": diagnostics, "telemetryCount": telemetryCount, "updatedAt": record["time"]!, "connected": peripheral?.state == .connected]
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: home.appendingPathComponent("ble-diagnostics.json"), options: .atomic) }
        }
        if let id = subscription { emit(id, "ble", value) }
    }
    func handle(_ id: String, _ command: String, _ value: [String: Any]) {
        if command == "bleSubscribe" {
            if let old = subscription { emit(old, "result", true) }
            subscription = id
            if central == nil { central = CBCentralManager(delegate: self, queue: .main) }
            else { centralManagerDidUpdateState(central) }
            return
        }
        guard central != nil else { emit(id, "error", "Open Devices first."); return }
        switch command {
        case "bleScan":
            guard central.state == .poweredOn, peripheral == nil else { emit(id, "error", "Enable Bluetooth and disconnect before scanning."); return }
            devices.removeAll(); central.scanForPeripherals(withServices: [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
            event(["kind": "status", "text": "Scanning for DairyOS boards…"])
            timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in self?.central.stopScan(); self?.event(["kind": "status", "text": "Scan finished. Select a board or scan again."]) }
            emit(id, "result", true)
        case "bleConnect":
            guard peripheral == nil, let key = value["device"] as? String, let uuid = UUID(uuidString: key), let board = devices[uuid], central.state == .poweredOn else { emit(id, "error", "Scan and select an available DairyOS board."); return }
            timer?.invalidate(); central.stopScan(); peripheral = board; board.delegate = self
            central.connect(board); event(["kind": "status", "text": "Connecting…"])
            timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in self?.disconnect("Connection setup timed out.") }
            emit(id, "result", true)
        case "bleRead":
            guard let board = peripheral, board.state == .connected, let rx = rx, rx.isNotifying, rx.properties.contains(.read) else { emit(id, "error", "Connect a board with a readable telemetry characteristic first."); return }
            board.readValue(for: rx); emit(id, "result", true)
        case "bleDisconnect": disconnect("Disconnected. Last received measurements are retained."); emit(id, "result", true)
        case "bleWrite":
            guard writeID == nil, let board = peripheral, board.state == .connected, let tx = tx, rx?.isNotifying == true,
                  let bytes = value["bytes"] as? [Int], bytes.count == 20, bytes.allSatisfy({ (0...255).contains($0) }), bytes[0] == 1, bytes[1] <= 1,
                  bytes[12] == 1 || bytes[12] == 2, bytes[13...19].allSatisfy({ $0 == 0 }), bytes[11] == 0, bytes[10] <= 30,
                  (bytes[1] == 0 && bytes[10] == 0) || (bytes[1] == 1 && bytes[10] > 0) else { emit(id, "error", "BLE control is unavailable or command is invalid."); return }
            writeID = id; board.writeValue(Data(bytes.map { UInt8($0) }), for: tx, type: .withResponse)
            writeTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in self?.disconnect("Write timed out; output state is unknown.") }
        default: emit(id, "error", "Unknown Bluetooth request.")
        }
    }
    func disconnect(_ reason: String) {
        timer?.invalidate(); recoveryTimeout?.invalidate(); reconnectTimer?.invalidate(); recovering = false
        writeTimer?.invalidate(); central?.stopScan()
        if let id = writeID { emit(id, "error", reason); writeID = nil }
        let old = peripheral; peripheral = nil; tx = nil; rx = nil
        if let old = old { central?.cancelPeripheralConnection(old) }
        event(["kind": "disconnected", "text": reason])
    }
    func recoverConnection(_ board: CBPeripheral) {
        guard central.state == .poweredOn, UIApplication.shared.applicationState != .background else { disconnect("Disconnected. Last received measurements are retained."); return }
        timer?.invalidate(); tx = nil; rx = nil; writeTimer?.invalidate()
        if let id = writeID { emit(id, "error", "Connection interrupted. Output state unknown; command will not be retried."); writeID = nil }
        recovering = true
        event(["kind": "reconnecting", "text": "Connection interrupted. Reconnecting for up to 15 seconds…"])
        central.connect(board)
        recoveryTimeout = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            self?.disconnect("Connection lost for 15 seconds. Last received measurements are retained; scan to reconnect.")
        }
    }
    func retryConnection(_ board: CBPeripheral) {
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in
            guard let self = self, self.recovering, self.peripheral === board, self.central.state == .poweredOn else { return }
            self.central.connect(board)
        }
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let text: String
        switch central.state {
        case .poweredOn: text = "Bluetooth ready. Scan for a DairyOS board."
        case .poweredOff: text = "Bluetooth is off. Enable Bluetooth; Wi-Fi and cellular can stay off."
        case .unauthorized: text = "Allow DairyOS Bluetooth access in iPhone Settings."
        case .unsupported: text = "Bluetooth Low Energy is unsupported."
        default: text = "Bluetooth is initializing."
        }
        if central.state != .poweredOn { disconnect(text) }
        event(["kind": "status", "text": text])
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        devices[peripheral.identifier] = peripheral
        event(["kind": "device", "id": peripheral.identifier.uuidString, "name": (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? "DairyOS board", "rssi": RSSI])
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) { guard self.peripheral === peripheral else { return }; peripheral.discoverServices([service]) }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { if self.peripheral === peripheral { if recovering { retryConnection(peripheral) } else { disconnect(error?.localizedDescription ?? "Connection failed.") } } }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) { if self.peripheral === peripheral { if recovering { retryConnection(peripheral) } else { recoverConnection(peripheral) } } }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard error == nil, let found = peripheral.services?.first(where: { $0.uuid == service }) else { disconnect("DairyOS service unavailable."); return }
        peripheral.discoverCharacteristics([telemetry, control], for: found)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard error == nil, let chars = service.characteristics, let rx = chars.first(where: { $0.uuid == telemetry }), let tx = chars.first(where: { $0.uuid == control }), rx.properties.contains(.notify), tx.properties.contains(.write) else { disconnect("Incompatible DairyOS characteristics."); return }
        self.rx = rx; self.tx = tx; peripheral.setNotifyValue(true, for: rx)
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard error == nil, characteristic.isNotifying else { disconnect("Could not subscribe to telemetry."); return }
        timer?.invalidate(); recoveryTimeout?.invalidate(); reconnectTimer?.invalidate(); recovering = false
        event(["kind": "connected", "text": "Connected. Waiting for telemetry."])
        if characteristic.properties.contains(.read) { peripheral.readValue(for: characteristic) }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard peripheral.state == .connected, characteristic.uuid == telemetry else { return }
        event(telemetryDeliveryEvent(data: characteristic.value, error: error))
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard let id = writeID else { return }; writeTimer?.invalidate(); writeID = nil
        emit(id, error == nil ? "result" : "error", error == nil ? "Delivered; waiting for board acknowledgment." : error!.localizedDescription)
    }
}
