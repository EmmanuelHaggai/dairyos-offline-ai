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
    var resettingSubscription = false
    var subscription: String?
    var timer: Timer?
    var writeID: String?
    var writeTimer: Timer?
    var attempt = BLEAttemptState()
    var closingBoards: [UUID: CBPeripheral] = [:]
    var queuedBoard: CBPeripheral?
    var closingTimeout: Timer?
    var phase = "idle"
    var lastRSSI: Int?
    var signalTimer: Timer?
    var lastPacketAt: Date?
    var recovering = false
    var recoveryCycle = 0
    var recoveryTimeout: Timer?
    var reconnectTimer: Timer?
    var diagnostics: [[String: Any]] = []
    var lastTelemetryLog = Date.distantPast
    var telemetryCount = 0
    var controlWrites = 0
    var emit: (String, String, Any) -> Void
    init(emit: @escaping (String, String, Any) -> Void) {
        self.emit = emit; super.init()
        let home = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        if let data = try? Data(contentsOf: home.appendingPathComponent("ble-diagnostics.json")), let report = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let events = report["events"] as? [[String: Any]] { diagnostics = Array(events.suffix(120)) }
    }
    func event(_ value: [String: Any]) {
        if value["kind"] as? String == "telemetry" { telemetryCount += 1; lastPacketAt = Date() }
        if value["kind"] as? String != "telemetry" || Date().timeIntervalSince(lastTelemetryLog) >= 10 {
            var record = value; record["time"] = ISO8601DateFormatter().string(from: Date())
            record["phase"] = phase; if let rssi = lastRSSI { record["rssi"] = rssi }; if let at = lastPacketAt { record["secondsSincePacket"] = Date().timeIntervalSince(at) }
            diagnostics.append(record); diagnostics = Array(diagnostics.suffix(120))
            if value["kind"] as? String == "telemetry" { lastTelemetryLog = Date() }
            let home = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let report: [String: Any] = ["events": diagnostics, "telemetryCount": telemetryCount, "updatedAt": record["time"]!, "connected": peripheral?.state == .connected, "phase": phase, "lastRSSI": lastRSSI as Any? ?? NSNull()]
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: home.appendingPathComponent("ble-diagnostics.json"), options: .atomic) }
        }
        if value["kind"] as? String != "diagnostic", let id = subscription { var delivered = value; delivered["phase"] = phase; emit(id, "ble", delivered) }
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
            phase = "scanning"; let scanTicket = attempt.advance()
            devices.removeAll(); central.scanForPeripherals(withServices: [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
            event(["kind": "status", "text": "Scanning for DairyOS boards…"])
            timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in guard let self = self, self.attempt.isCurrent(scanTicket) else { return }; self.central.stopScan(); self.phase = "idle"; self.event(["kind": "scanComplete", "text": "Scan finished. Nearby boards are shown below."]) }
            emit(id, "result", true)
        case "bleConnect":
            guard peripheral == nil, let key = value["device"] as? String, let uuid = UUID(uuidString: key), let board = devices[uuid], central.state == .poweredOn else { emit(id, "error", "Scan and select an available DairyOS board."); return }
            timer?.invalidate(); central.stopScan()
            UserDefaults.standard.set(uuid.uuidString, forKey: "dairyosPreferredBLEBoard")
            if !attempt.canConnect {
                queuedBoard = board; phase = "closing"
                event(["kind": "status", "text": "Previous Bluetooth connection is closing. Reconnecting when it is released…"])
                closingTimeout?.invalidate()
                closingTimeout = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in
                    guard let self = self, self.queuedBoard != nil else { return }
                    self.queuedBoard = nil
                    self.event(["kind": "disconnected", "text": "The previous Bluetooth connection has not closed yet. Wait briefly, then scan again."])
                }
            } else { startConnection(board) }
            emit(id, "result", true)
        case "bleRead":
            guard let board = peripheral, board.state == .connected, let rx = rx, rx.isNotifying, rx.properties.contains(.read) else { emit(id, "error", "Connect a board with a readable telemetry characteristic first."); return }
            board.readValue(for: rx); emit(id, "result", true)
        case "bleDisconnect": disconnect("Disconnected. Last received measurements are retained."); emit(id, "result", true)
        case "bleWrite":
            guard writeID == nil, let board = peripheral, board.state == .connected, let tx = tx, rx?.isNotifying == true,
                  let bytes = value["bytes"] as? [Int], bytes.count == 20, bytes.allSatisfy({ (0...255).contains($0) }), (bytes[0] == 1 || bytes[0] == 2), bytes[1] <= 2,
                  bytes[12] == 1 || bytes[12] == 2, bytes[13...19].allSatisfy({ $0 == 0 }), bytes[11] == 0, bytes[10] <= 30,
                  (bytes[1] == 0 && bytes[10] == 0) || (bytes[1] == 1 && bytes[10] > 0) || (bytes[0] == 2 && bytes[1] == 2 && bytes[10] == 0) else { emit(id, "error", "BLE control is unavailable or command is invalid."); return }
            controlWrites += 1
            writeID = id; board.writeValue(Data(bytes.map { UInt8($0) }), for: tx, type: .withResponse)
            writeTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in self?.disconnect("Write timed out; output state is unknown.") }
        default: emit(id, "error", "Unknown Bluetooth request.")
        }
    }
    func disconnect(_ reason: String) {
        timer?.invalidate(); recoveryTimeout?.invalidate(); reconnectTimer?.invalidate(); signalTimer?.invalidate(); closingTimeout?.invalidate(); queuedBoard = nil; recovering = false; recoveryCycle += 1
        writeTimer?.invalidate(); central?.stopScan()
        if let id = writeID { emit(id, "error", reason); writeID = nil }
        let old = peripheral; peripheral = nil; tx = nil; rx = nil; resettingSubscription = false
        _ = attempt.advance()
        if let old = old, old.state != .disconnected {
            closingBoards[old.identifier] = old; attempt.cancel(old.identifier)
            central?.cancelPeripheralConnection(old)
        }
        event(["kind": "diagnostic", "text": "Local disconnect", "reason": reason])
        phase = "idle"
        event(["kind": "disconnected", "text": reason])
    }
    func recoverConnection(_ board: CBPeripheral) {
        guard central.state == .poweredOn, UIApplication.shared.applicationState != .background else { disconnect("Disconnected. Last received measurements are retained."); return }
        timer?.invalidate(); signalTimer?.invalidate(); tx = nil; rx = nil; writeTimer?.invalidate(); phase = "reconnecting"; _ = attempt.advance()
        if let id = writeID { emit(id, "error", "Connection interrupted. Output state unknown; command will not be retried."); writeID = nil }
        recovering = true; recoveryCycle += 1; let cycle = recoveryCycle
        event(["kind": "reconnecting", "text": "Connection interrupted. Reconnecting for up to 15 seconds…"])
        central.connect(board)
        recoveryTimeout = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            guard let self = self, self.recovering, self.recoveryCycle == cycle, self.peripheral === board else { return }
            self.disconnect("Connection lost for 15 seconds. Last received measurements are retained; scan to reconnect.")
        }
    }
    func retryConnection(_ board: CBPeripheral) {
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in
            guard let self = self, self.recovering, self.peripheral === board, self.central.state == .poweredOn else { return }
            self.central.connect(board)
        }
    }
    func startConnection(_ board: CBPeripheral) {
        guard attempt.canConnect, peripheral == nil, central.state == .poweredOn else { return }
        closingTimeout?.invalidate(); queuedBoard = nil; peripheral = board; board.delegate = self
        armStage("connecting", seconds: 30)
        central.connect(board); event(["kind": "status", "text": "Connecting…"])
    }
    func armStage(_ name: String, seconds: TimeInterval = 15) {
        phase = name; timer?.invalidate(); let ticket = attempt.advance()
        event(["kind": "diagnostic", "text": "Connection stage", "stage": name])
        guard !recovering else { return } // Recovery retains its one overall15s deadline.
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self = self, self.attempt.isCurrent(ticket) else { return }
            self.disconnect("Bluetooth timed out during \(name). Automatic connection will retry when enabled.")
        }
    }
    func cancellationFinished(_ board: CBPeripheral) -> Bool {
        guard let old = closingBoards[board.identifier], old === board, attempt.closed(board.identifier) else { return false }
        closingBoards.removeValue(forKey: board.identifier)
        event(["kind": "diagnostic", "text": "Previous connection cancellation completed"])
        if attempt.canConnect, let next = queuedBoard { startConnection(next) }
        return true
    }
    func callback(_ name: String, error: Error?) {
        var record: [String: Any] = ["kind": "diagnostic", "text": name]
        if let error = error as NSError? { record["errorDomain"] = error.domain; record["errorCode"] = error.code; record["detail"] = error.localizedDescription }
        event(record)
    }
    func isActive(_ board: CBPeripheral) -> Bool { peripheral === board && !attempt.closing.contains(board.identifier) && board.state == .connected }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard central === self.central else { return }
        let text: String
        switch central.state {
        case .poweredOn: text = "Bluetooth ready. Scan for a DairyOS board."
        case .poweredOff: text = "Bluetooth is off. Enable Bluetooth; Wi-Fi and cellular can stay off."
        case .unauthorized: text = "Allow DairyOS Bluetooth access in iPhone Settings."
        case .unsupported: text = "Bluetooth Low Energy is unsupported."
        default: text = "Bluetooth is initializing."
        }
        if central.state != .poweredOn {
            disconnect(text)
            if central.state == .poweredOff || central.state == .resetting { attempt.reset(); closingBoards.removeAll(); devices.removeAll() }
        }
        event(["kind": "status", "text": text, "preferredId": UserDefaults.standard.string(forKey: "dairyosPreferredBLEBoard") ?? "", "radio": central.state == .poweredOn ? "ready" : (central.state == .unknown || central.state == .resetting ? "initializing" : "unavailable")])
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard central === self.central else { return }
        devices[peripheral.identifier] = peripheral; lastRSSI = RSSI.intValue
        event(["kind": "device", "id": peripheral.identifier.uuidString, "name": (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? "DairyOS board", "rssi": RSSI])
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard central === self.central else { return }
        if attempt.closing.contains(peripheral.identifier) { central.cancelPeripheralConnection(peripheral); return }
        guard self.peripheral === peripheral else { return }
        event(["kind": "diagnostic", "text": "Peripheral delegate at connection", "delegateMatches": peripheral.delegate === self])
        peripheral.delegate = self
        callback("Radio link connected", error: nil)
        armStage("service discovery"); peripheral.discoverServices([service])
    }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard central === self.central else { return }
        callback("Connection attempt failed", error: error)
        if cancellationFinished(peripheral) { return }
        if self.peripheral === peripheral { if recovering { retryConnection(peripheral) } else { disconnect(error?.localizedDescription ?? "Connection failed.") } }
    }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard central === self.central else { return }
        callback("Bluetooth link disconnected", error: error)
        if cancellationFinished(peripheral) { return }
        if self.peripheral === peripheral { if recovering { retryConnection(peripheral) } else { recoverConnection(peripheral) } }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        event(["kind": "diagnostic", "text": "Service callback received", "matchesActive": self.peripheral === peripheral, "state": peripheral.state.rawValue, "closing": attempt.closing.contains(peripheral.identifier)])
        guard isActive(peripheral) else { return }
        callback("Service discovery completed", error: error)
        guard error == nil, let found = peripheral.services?.first(where: { $0.uuid == service }) else { disconnect("DairyOS service unavailable."); return }
        armStage("characteristic discovery"); peripheral.discoverCharacteristics([telemetry, control], for: found)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard isActive(peripheral) else { return }
        callback("Characteristic discovery completed", error: error)
        guard error == nil, let chars = service.characteristics else { disconnect("Incompatible DairyOS characteristics."); return }
        prepareNotifications(peripheral, chars)
    }
    func prepareNotifications(_ board: CBPeripheral, _ chars: [CBCharacteristic]) {
        guard let rx = chars.first(where: { $0.uuid == telemetry }), let tx = chars.first(where: { $0.uuid == control }), rx.properties.contains(.notify), tx.properties.contains(.write) else { disconnect("Incompatible DairyOS characteristics."); return }
        armStage("telemetry subscription"); self.rx = rx; self.tx = tx
        resettingSubscription = rx.isNotifying
        board.setNotifyValue(!resettingSubscription, for: rx)
    }
    func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
        guard isActive(peripheral), invalidatedServices.contains(where: { $0.uuid == service }) else { return }
        disconnect("Board services changed. Automatic connection will rediscover them when enabled.")
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard isActive(peripheral), characteristic === rx else { return }
        callback("Notification subscription completed", error: error)
        if resettingSubscription {
            resettingSubscription = false
            guard error == nil, !characteristic.isNotifying else { disconnect("Could not reset telemetry notifications."); return }
            peripheral.setNotifyValue(true, for: characteristic); return
        }
        guard error == nil, characteristic.isNotifying else { disconnect("Could not subscribe to telemetry."); return }
        timer?.invalidate(); recoveryTimeout?.invalidate(); reconnectTimer?.invalidate(); recovering = false; recoveryCycle += 1; phase = "ready"; _ = attempt.advance()
        signalTimer?.invalidate(); peripheral.readRSSI()
        signalTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            guard let self = self, let board = self.peripheral, self.isActive(board) else { return }; board.readRSSI()
        }
        event(["kind": "connected", "text": "Connected. Waiting for telemetry."])
        if characteristic.properties.contains(.read) { peripheral.readValue(for: characteristic) }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard isActive(peripheral), characteristic === rx, characteristic.uuid == telemetry else { return }
        event(telemetryDeliveryEvent(data: characteristic.value, error: error))
    }
    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
        guard isActive(peripheral) else { return }
        if error == nil { lastRSSI = RSSI.intValue; event(["kind": "signal", "rssi": RSSI.intValue]) }
        callback("Connected signal measurement", error: error)
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard let id = writeID else { return }; writeTimer?.invalidate(); writeID = nil
        emit(id, error == nil ? "result" : "error", error == nil ? "Delivered; waiting for board acknowledgment." : error!.localizedDescription)
    }
}
