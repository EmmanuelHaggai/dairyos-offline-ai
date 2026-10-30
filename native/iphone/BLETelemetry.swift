import Foundation
import CoreBluetooth

// A GATT read failure is not a malformed telemetry packet. BlueZ can expose an
// empty initial characteristic while its first MCU snapshot is still pending.
func telemetryDeliveryEvent(data: Data?, error: Error?) -> [String: Any] {
    if let error = error as NSError? {
        let detail = "\(error.domain) \(error.code): \(error.localizedDescription)"
        if error.domain == CBATTErrorDomain && (error.code == CBATTError.Code.insufficientAuthentication.rawValue || error.code == CBATTError.Code.insufficientEncryption.rawValue || error.code == CBATTError.Code.insufficientAuthorization.rawValue) {
            return ["kind": "error", "text": "Bluetooth pairing is required. Compare and approve the pairing code on the iPhone and UNO Q, then retry the reading.", "detail": detail]
        }
        if error.domain == CBATTErrorDomain && error.code == CBATTError.Code.readNotPermitted.rawValue {
            return ["kind": "status", "text": "Board does not permit an initial read. Waiting for telemetry notifications.", "detail": detail]
        }
        return ["kind": "error", "text": "Bluetooth read failed: \(error.localizedDescription). Retry the reading; the last received values are retained.", "detail": detail]
    }
    guard let data = data, !data.isEmpty else {
        return ["kind": "status", "text": "Connected. Waiting for the board's first telemetry update."]
    }
    guard data.count == 20 else {
        return ["kind": "error", "text": "Telemetry packet has \(data.count) bytes; DairyOS BLE v1 requires 20. Last received values are retained.", "bytes": Array(data).map { Int($0) }]
    }
    return ["kind": "telemetry", "bytes": Array(data).map { Int($0) }]
}
