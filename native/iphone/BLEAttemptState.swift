import Foundation

// CoreBluetooth cancellation completes asynchronously. Do not reuse a link
// until its didDisconnect/didFailToConnect callback acknowledges cancellation.
struct BLEAttemptState {
    private(set) var generation = 0
    private(set) var closing = Set<UUID>()
    var canConnect: Bool { closing.isEmpty }
    mutating func advance() -> Int { generation += 1; return generation }
    func isCurrent(_ ticket: Int) -> Bool { generation == ticket }
    mutating func cancel(_ id: UUID) { closing.insert(id); _ = advance() }
    @discardableResult mutating func closed(_ id: UUID) -> Bool { closing.remove(id) != nil }
    mutating func reset() { closing.removeAll(); _ = advance() }
}
