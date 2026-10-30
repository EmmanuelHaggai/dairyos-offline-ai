import SwiftUI
import Metal
import Darwin

struct ResourceSnapshot: Codable {
    var capturedAt: String
    var hardware: String
    var osVersion: String
    var physicalMemoryBytes: UInt64
    var appAvailableDirtyMemoryBytes: UInt64
    var appPhysicalFootprintBytes: UInt64?
    var storageTotalBytes: Int64?
    var storageFreeBytes: Int64?
    var storageAvailableForImportantUsageBytes: Int64?
    var metalDevice: String?
    var metalRecommendedWorkingSetBytes: UInt64?
    var metalMaxBufferBytes: UInt64?
    var metalCurrentAllocatedBytes: UInt64?
    var supportsAppleGPUFamily8: Bool
    var processorCount: Int
    var thermalState: String
    var lowPowerMode: Bool
    var batteryLevel: Float
    var note: String
}

func captureResources() -> ResourceSnapshot {
    var system = utsname()
    uname(&system)
    let machineCapacity = MemoryLayout.size(ofValue: system.machine)
    let hardware = withUnsafePointer(to: &system.machine) {
        $0.withMemoryRebound(to: CChar.self, capacity: machineCapacity) { String(cString: $0) }
    }
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let status = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    let document = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let disk = try? document.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey])
    let gpu = MTLCreateSystemDefaultDevice()
    UIDevice.current.isBatteryMonitoringEnabled = true
    let process = ProcessInfo.processInfo
    return ResourceSnapshot(
        capturedAt: ISO8601DateFormatter().string(from: Date()), hardware: hardware,
        osVersion: UIDevice.current.systemVersion, physicalMemoryBytes: process.physicalMemory,
        appAvailableDirtyMemoryBytes: UInt64(os_proc_available_memory()),
        appPhysicalFootprintBytes: status == KERN_SUCCESS ? info.phys_footprint : nil,
        storageTotalBytes: disk?.volumeTotalCapacity.map(Int64.init),
        storageFreeBytes: disk?.volumeAvailableCapacity.map(Int64.init),
        storageAvailableForImportantUsageBytes: disk?.volumeAvailableCapacityForImportantUsage,
        metalDevice: gpu?.name, metalRecommendedWorkingSetBytes: gpu?.recommendedMaxWorkingSetSize,
        metalMaxBufferBytes: gpu.map { UInt64($0.maxBufferLength) },
        metalCurrentAllocatedBytes: gpu.map { UInt64($0.currentAllocatedSize) },
        supportsAppleGPUFamily8: gpu?.supportsFamily(.apple8) ?? false,
        processorCount: process.processorCount, thermalState: String(describing: process.thermalState),
        lowPowerMode: process.isLowPowerModeEnabled, batteryLevel: UIDevice.current.batteryLevel,
        note: "Read-only resource snapshot from a small native diagnostic app. Available dirty memory is a changing per-app limit, not free system RAM or a QVAC fit/performance guarantee. No model or large test allocation was loaded."
    )
}

@main struct ResourceProbeApp: App {
    @State private var snapshot: ResourceSnapshot?
    @State private var failure = ""
    func refresh() {
        let value = captureResources()
        snapshot = value
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let path = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("resource-report.json")
            try encoder.encode(value).write(to: path, options: .atomic)
            failure = ""
        } catch { failure = error.localizedDescription }
    }
    func gb(_ bytes: UInt64) -> String { String(format: "%.2f GiB", Double(bytes) / 1073741824) }
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                List {
                    Section("DairyOS resource check") {
                        Text("Diagnostic only — this is not the AI app.")
                        if let value = snapshot {
                            LabeledContent("Device", value: value.hardware)
                            LabeledContent("iOS", value: value.osVersion)
                            LabeledContent("Physical RAM", value: gb(value.physicalMemoryBytes))
                            LabeledContent("App memory remaining", value: gb(value.appAvailableDirtyMemoryBytes))
                            LabeledContent("Free storage", value: gb(UInt64(max(0, value.storageFreeBytes ?? 0))))
                            LabeledContent("GPU", value: value.metalDevice ?? "Unavailable")
                            LabeledContent("Metal working set", value: gb(value.metalRecommendedWorkingSetBytes ?? 0))
                            Text(value.note).font(.footnote)
                        }
                    }
                    Button("Refresh snapshot", action: refresh)
                    if !failure.isEmpty { Text(failure).foregroundStyle(.red) }
                }
                .navigationTitle("DairyOS Check")
                .task { refresh() }
            }
        }
    }
}
