import Foundation
@main struct BLEAttemptTests {
    static func main() {
        var attempt = BLEAttemptState()
        let a = UUID(), b = UUID()
        let first = attempt.advance()
        assert(attempt.isCurrent(first)); assert(attempt.canConnect)
        attempt.cancel(a)
        assert(!attempt.canConnect); assert(!attempt.isCurrent(first))
        attempt.cancel(b)
        assert(attempt.closed(a)); assert(!attempt.canConnect)
        assert(!attempt.closed(a), "duplicate callback cannot release another closing link")
        assert(attempt.closed(b)); assert(attempt.canConnect)
        let next = attempt.advance()
        assert(attempt.isCurrent(next)); assert(!attempt.isCurrent(first))
        let setup = attempt.advance()
        assert(!attempt.isCurrent(next), "expired radio-stage timer cannot cancel GATT setup")
        assert(attempt.isCurrent(setup))
        attempt.cancel(a); attempt.reset()
        assert(attempt.canConnect); assert(!attempt.isCurrent(setup)); assert(!attempt.closed(a))
        print("PASS asynchronous cancellation gate, duplicate callbacks, stale phase timers and Bluetooth reset")
    }
}
