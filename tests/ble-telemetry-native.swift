import Foundation
import CoreBluetooth

@main struct BLETelemetryTests {
    static func main() {
        func kind(_ event: [String: Any]) -> String { event["kind"] as! String }
        assert(kind(telemetryDeliveryEvent(data: nil, error: nil)) == "status")
        assert(kind(telemetryDeliveryEvent(data: Data(), error: nil)) == "status")
        let wrong = telemetryDeliveryEvent(data: Data([1, 2]), error: nil)
        assert(kind(wrong) == "error"); assert((wrong["text"] as! String).contains("2 bytes"))
        let frame = Data(repeating: 0, count: 20)
        assert(kind(telemetryDeliveryEvent(data: frame, error: nil)) == "telemetry")
        for code in [CBATTError.Code.insufficientAuthentication, .insufficientEncryption, .insufficientAuthorization] {
            let failure = telemetryDeliveryEvent(data: frame, error: NSError(domain: CBATTErrorDomain, code: code.rawValue))
            assert(kind(failure) == "error"); assert((failure["text"] as! String).contains("pairing is required")); assert(failure["bytes"] == nil)
        }
        let denied = telemetryDeliveryEvent(data: nil, error: NSError(domain: CBATTErrorDomain, code: CBATTError.Code.readNotPermitted.rawValue))
        assert(kind(denied) == "status")
        let transport = telemetryDeliveryEvent(data: frame, error: NSError(domain: "TestTransport", code: 42, userInfo: [NSLocalizedDescriptionKey: "Read timed out"]))
        assert((transport["detail"] as! String).contains("42")); assert((transport["text"] as! String).contains("Read timed out")); assert(transport["bytes"] == nil)
        print("PASS native telemetry: empty/startup, wrong length, valid frame, authentication/encryption/authorization, read permission, transport failure")
    }
}
