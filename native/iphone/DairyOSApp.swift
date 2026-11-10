import SwiftUI
import WebKit
import PhotosUI
import Metal
import Darwin
import CryptoKit

@main struct DairyOSPhoneApp: App {
    var body: some Scene { WindowGroup { PhoneView().ignoresSafeArea(.container, edges: .bottom) } }
}

struct PhoneView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> PhoneController { PhoneController() }
    func updateUIViewController(_ controller: PhoneController, context: Context) {}
}

final class AssetHandler: NSObject, WKURLSchemeHandler {
    let root = Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true).standardizedFileURL
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request.url!
        let relative = request.path.isEmpty || request.path == "/" ? "index.html" : String(request.path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard !relative.split(separator: "/").contains(".."), !relative.contains("\\") else { urlSchemeTask.didFailWithError(NSError(domain: "DairyOS", code: 403)); return }
        let bytes: Data
        do { bytes = try Data(contentsOf: file) }
        catch { urlSchemeTask.didFailWithError(NSError(domain: "DairyOS", code: 404, userInfo: [NSLocalizedDescriptionKey: "Cannot read local asset \(relative): \(error.localizedDescription)"])); return }
        let mime = ["html": "text/html", "js": "application/javascript", "css": "text/css", "json": "application/json", "png": "image/png", "ttf": "font/ttf", "ico": "image/x-icon"][file.pathExtension] ?? "application/octet-stream"
        urlSchemeTask.didReceive(URLResponse(url: request, mimeType: mime, expectedContentLength: bytes.count, textEncodingName: mime.hasPrefix("text/") || mime.contains("javascript") ? "utf-8" : nil))
        urlSchemeTask.didReceive(bytes); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class PhoneController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    lazy var bluetooth = FarmBluetooth { [weak self] id, type, value in self?.emit(id, type, value) }
    var web: WKWebView!
    var worklet: BareWorklet?
    var ipc: BareIPC?
    var incoming = Data()
    var bootMessage: [String: Any]?
    var activeID: String?
    var inferenceRequests = 0
    var interactionBusy = false
    var operatorTestActive: Bool { selfTest || reconnectTest || ProcessInfo.processInfo.environment["DAIRYOS_DURATION_TEST"] == "1" || ProcessInfo.processInfo.environment["DAIRYOS_CHAT_FEEDBACK_TEST"] == "1" || ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1" || ProcessInfo.processInfo.environment["DAIRYOS_AUTOMATIC_BLE_TEST"] == "1" }
    var pickerID: String?
    var photoPath: URL?
    var sampling: Timer?
    var startupTimeout: Timer?
    var answerTimeout: Timer?
    var peakFootprint: UInt64 = 0
    var minAvailable: UInt64 = UInt64.max
    var sampleCount = 0
    let home = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let selfTest = ProcessInfo.processInfo.arguments.contains("--dairyos-self-test") || ProcessInfo.processInfo.environment["DAIRYOS_SELF_TEST"] == "1"
    let bulbTest = ProcessInfo.processInfo.environment["DAIRYOS_BULB1_TEST"] == "1"
    let reconnectTest = ProcessInfo.processInfo.environment["DAIRYOS_RECONNECT_TEST"] == "1"
    let bleTest = ProcessInfo.processInfo.environment["DAIRYOS_BLE_TEST"] == "1"
    let persistenceTest = ProcessInfo.processInfo.environment["DAIRYOS_PERSISTENCE_TEST"] == "1"
    let models: [String: (String, Int64)] = ["text": ("text-qwen3-4b-q3.gguf", 2075618016), "vision": ("vision-flash.gguf", 303143488), "projection": ("vision-flash-mmproj.gguf", 108782144)]
    let checksums = ["text-qwen3-4b-q3.gguf": "8e607bb4c5562e1b514e733ea3d636a1ff5ac9fd914704fb4e8e729e50bd8b53", "vision-flash.gguf": "90b0abe16180f1fe5918bc5d89c3b6eeaf40520a50f906d6303a59a32b699fbc", "vision-flash-mmproj.gguf": "bbb0691873a4e638f6928898b3c3be9a4730bd4ced301197726a4fcb549695d0"]

    override func viewDidLoad() {
        super.viewDidLoad()
        if ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1" {
            freopen(home.appendingPathComponent("native-model-loader.log").path, "a", stderr)
        }
        UIApplication.shared.isIdleTimerDisabled = operatorTestActive
        writeStatus("viewLoaded")
        if ProcessInfo.processInfo.environment["DAIRYOS_AUTOMATIC_BLE_TEST"] == "1" { UIApplication.shared.isIdleTimerDisabled = true }
        try? FileManager.default.createDirectory(at: home.appendingPathComponent("models"), withIntermediateDirectories: true)
        view.backgroundColor = UIColor(red: 244.0/255, green: 247.0/255, blue: 243.0/255, alpha: 1)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AssetHandler(), forURLScheme: "dairyos")
        config.userContentController.add(self, name: "dairyos")
        let script = "window.dairyosPhone=true;window.dairyosTest=\(selfTest ? "true" : "false");window.dairyosPersistenceTest=\(persistenceTest ? "true" : "false");window.dairyosErrors=[];window.addEventListener('error',e=>window.dairyosErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.dairyosErrors.push(String(e.reason)));"
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isInspectable = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        web.load(URLRequest(url: URL(string: "dairyos://app/")!))
        NotificationCenter.default.addObserver(self, selector: #selector(bluetoothBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(bluetoothForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.willResignActiveNotification, object: nil)
    }

    @objc func bluetoothBackground() {
        bluetooth.event(["kind": "lifecycle", "active": false])
        bluetooth.disconnect("App paused. Output state is unknown; the board run limit still applies.")
    }
    @objc func bluetoothForeground() {
        UIApplication.shared.isIdleTimerDisabled = interactionBusy || operatorTestActive || activeID != nil
        bluetooth.event(["kind": "lifecycle", "active": true])
    }
    @objc func background() {
        if activeID != nil { write(["id": "background", "command": "stop", "value": [:]]) }
    }
    func emit(_ id: String, _ type: String, _ value: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "type": type, "value": value], options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dairyosReceive && window.dairyosReceive(\(json))", completionHandler: nil)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, web.url?.scheme == "dairyos", let body = message.body as? [String: Any], let id = body["id"] as? String, let command = body["command"] as? String else { return }
        writeStatus("command:" + command)
        let value = body["value"] as? [String: Any] ?? [:]
        switch command {
        case "bleSubscribe", "bleScan", "bleConnect", "bleDisconnect", "bleWrite", "bleRead": bluetooth.handle(id, command, value)
        case "models":
            var state: [String: Any] = [:]
            for (slot, (name, _)) in models {
                let file = home.appendingPathComponent("models/" + name)
                if let info = try? FileManager.default.attributesOfItem(atPath: file.path), let size = info[.size] as? NSNumber { state[slot] = ["name": name, "bytes": size] }
                else { state[slot] = NSNull() }
            }
            emit(id, "result", state)
        case "semanticValidation" where ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1":
            var report = value; report["workerSHA256"] = modelWorkerDigest()
            try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("semantic-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "semanticResume" where ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1" && ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_RESUME"] == "1":
            if let data = try? Data(contentsOf: home.appendingPathComponent("semantic-validation.json")), let report = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let digest = modelWorkerDigest(), report["workerSHA256"] as? String == digest { emit(id, "result", report) }
            else { emit(id, "error", "No saved semantic validation is available.") }
        case "answer": startAnswer(id, value)
        case "durationValidation" where ProcessInfo.processInfo.environment["DAIRYOS_DURATION_TEST"] == "1":
            var report = value; report["controlWrites"] = bluetooth.controlWrites
            if bluetooth.controlWrites != 0 { report["passed"] = false }
            try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("duration-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "chatFeedbackValidation" where ProcessInfo.processInfo.environment["DAIRYOS_CHAT_FEEDBACK_TEST"] == "1":
            var report = value; report["controlWrites"] = bluetooth.controlWrites
            if bluetooth.controlWrites != 0 { report["passed"] = false }
            try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("chat-feedback-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "interactionBusy":
            interactionBusy = value["active"] as? Bool == true
            UIApplication.shared.isIdleTimerDisabled = interactionBusy || operatorTestActive || activeID != nil
            emit(id, "result", true)
        case "automaticBLEValidation" where ProcessInfo.processInfo.environment["DAIRYOS_AUTOMATIC_BLE_TEST"] == "1":
            var report = value; report["inferenceRequests"] = inferenceRequests; report["controlWrites"] = bluetooth.controlWrites
            if inferenceRequests != 0 || bluetooth.controlWrites != 0 { report["passed"] = false }
            try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("automatic-ble-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "sensorChatValidation" where ProcessInfo.processInfo.environment["DAIRYOS_SENSOR_CHAT_TEST"] == "1":
            try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("sensor-chat-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "stop":
            if activeID != nil { write(["id": id, "command": "stop", "value": [:]]) } else { emit(id, "result", true) }
        case "photo": showPhotoPicker(id, camera: value["camera"] as? Bool ?? false)
        case "reconnectValidation" where reconnectTest:
            try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("reconnect-validation.json"), options: .atomic)
            emit(id, "result", true)
        case "bulbValidation" where bulbTest:
            try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("bulb1-validation.json"), options: .atomic)
            web.takeSnapshot(with: nil) { image, _ in try? image?.pngData()?.write(to: self.home.appendingPathComponent("bulb1-validation.png")) }
            emit(id, "result", true)
        case "validation" where selfTest:
            try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent(persistenceTest ? "iphone-persistence-validation.json" : "iphone-validation.json"), options: .atomic)
            web.takeSnapshot(with: nil) { image, _ in try? image?.pngData()?.write(to: self.home.appendingPathComponent("iphone-validation.png")) }
            emit(id, "result", true)
        case "testPhoto" where selfTest || ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1":
            if let url = Bundle.main.url(forResource: "test-leaf", withExtension: "jpg"), let data = try? Data(contentsOf: url) { emit(id, "result", "data:image/jpeg;base64," + data.base64EncodedString()) }
            else { emit(id, "error", "Test photo missing") }
        case "testLibrary" where selfTest || ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1":
            if let url = Bundle.main.url(forResource: "starter-library", withExtension: "json"), let data = try? Data(contentsOf: url), let library = try? JSONSerialization.jsonObject(with: data) { emit(id, "result", library) }
            else { emit(id, "error", "Test library missing") }
        case "verifyModels" where selfTest || ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1":
            DispatchQueue.global(qos: .utility).async {
                do {
                    var result: [[String: Any]] = []
                    for (name, expected) in self.checksums.sorted(by: { $0.key < $1.key }) {
                        let handle = try FileHandle(forReadingFrom: self.home.appendingPathComponent("models/" + name))
                        var hash = SHA256()
                        while let chunk = try handle.read(upToCount: 1048576), !chunk.isEmpty { hash.update(data: chunk) }
                        try handle.close()
                        let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
                        result.append(["file": name, "sha256": actual, "matches": actual == expected])
                    }
                    DispatchQueue.main.async { self.emit(id, "result", result) }
                } catch { DispatchQueue.main.async { self.emit(id, "error", error.localizedDescription) } }
            }
        default: emit(id, "error", "Unknown local request.")
        }
    }

    func startAnswer(_ id: String, _ input: [String: Any]) {
        inferenceRequests += 1
        guard activeID == nil else { emit(id, "error", "Wait for the current answer to finish."); return }
        guard let question = input["question"] as? String, !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, question.count <= 1500 else { emit(id, "error", "Enter a question up to 1,500 characters."); return }
        var value = input
        // Paths and runtime configuration are owned by this host, never by the question.
        value.removeValue(forKey: "photo"); value.removeValue(forKey: "photoPath")
        if let photo = input["photo"] as? String {
            guard photo.hasPrefix("data:image/jpeg;base64,"), let bytes = Data(base64Encoded: String(photo.dropFirst(23))), bytes.count <= 2000000, bytes.starts(with: [255, 216]) else { emit(id, "error", "Choose a local JPEG photo under 2 MB."); return }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("dairyos-photo-\(UUID().uuidString).jpg")
            do { try bytes.write(to: file, options: .atomic) } catch { emit(id, "error", error.localizedDescription); return }
            photoPath = file; value["photoPath"] = file.path
        }
        activeID = id; bootQuestion = question; value["home"] = home.path
        value["diagnostics"] = ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1"
        value["device"] = ProcessInfo.processInfo.environment["DAIRYOS_MODEL_DEVICE"] == "cpu" ? "cpu" : "gpu"
        value.removeValue(forKey: "gpuLayers")
        if ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1", let raw = ProcessInfo.processInfo.environment["DAIRYOS_GPU_LAYERS"], let layers = Int(raw), layers >= 0, layers <= 37 { value["gpuLayers"] = layers }
        UIApplication.shared.isIdleTimerDisabled = true
        incoming.removeAll(keepingCapacity: true)
        peakFootprint = 0; minAvailable = UInt64.max; sampleCount = 0
        sampling = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.sampleMemory() }
        writeStatus("runtime:configuration")
        let configuration = BareWorkletConfiguration.default()
        configuration?.memoryLimit = 256 * 1024 * 1024
        guard let worklet = BareWorklet(configuration: configuration) else { finish(); emit(id, "error", "Native runtime could not initialize."); return }
        writeStatus("runtime:initialized")
        guard let bundle = Bundle.main.url(forResource: "worker", withExtension: "bundle") else {
            finish(); emit(id, "error", "Native QVAC runtime could not start."); return
        }
        self.worklet = worklet
        bootMessage = ["id": id, "command": "answer", "value": value]
        writeStatus("runtime:starting")
        worklet.start(bundle.path, arguments: [home.path, "worker", "{\"HOME_DIR\":\"\(home.path)\"}"])
        writeStatus("runtime:started")
        // Worklet.start initializes the port descriptors. Constructing BareIPC
        // earlier captures the uninitialized descriptors, even if polling is delayed.
        guard let ipc = BareIPC(worklet: worklet) else { finish(); emit(id, "error", "Native runtime channel could not start."); return }
        self.ipc = ipc
        writeStatus("runtime:channelReady")
        // Start polling only after the worklet has started; the poll setup waits
        // for the runtime loop and would otherwise block the calling thread.
        ipc.readable = { [weak self] stream in
            while let data = stream.read(), !data.isEmpty {
                DispatchQueue.main.async { [weak self] in self?.receive(data) }
            }
        }
        startupTimeout = Timer.scheduledTimer(withTimeInterval: 25, repeats: false) { [weak self] _ in
            guard let self = self, self.bootMessage != nil else { return }
            self.finish { self.emit(id, "error", "The local AI runtime did not start. Records and the library remain available.") }
        }
        answerTimeout = Timer.scheduledTimer(withTimeInterval: 240, repeats: false) { [weak self] _ in
            guard let self = self, self.activeID == id else { return }
            self.write(["id": "timeout", "command": "stop", "value": [:]])
        }
    }
    func write(_ object: [String: Any]) {
        guard var data = try? JSONSerialization.data(withJSONObject: object) else { return }
        data.append(10)
        ipc?.write(data) { [weak self] error in
            if let error = error { DispatchQueue.main.async { [weak self] in self?.emit(object["id"] as? String ?? "", "error", error.localizedDescription) } }
        }
    }
    func receive(_ data: Data) {
        incoming.append(data)
        while let end = incoming.firstIndex(of: 10) {
            let line = incoming[..<end]; incoming.removeSubrange(...end)
            guard let message = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any], let id = message["id"] as? String, let type = message["type"] as? String else { continue }
            if type == "phase" { writeStatus("runtime:" + String(describing: message["value"] ?? "")); continue }
            if type == "ready" { writeStatus("runtime:workerReady"); startupTimeout?.invalidate(); startupTimeout = nil; if let boot = bootMessage { bootMessage = nil; write(boot) }; continue }
            if type == "status" { writeStatus("inference:" + String(describing: message["value"] ?? "")) }
            if id == "boot" && type == "error", let requestID = activeID { finish { self.emit(requestID, "error", message["value"] ?? "Native runtime error") }; continue }
            if id == activeID && (type == "result" || type == "error") {
                sampleMemory()
                if selfTest || ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1" {
                    let report: [String: Any] = ["capturedAt": ISO8601DateFormatter().string(from: Date()), "peakSampledFootprintBytes": peakFootprint, "minimumSampledAvailableBytes": minAvailable, "samples": sampleCount, "question": bootQuestion ?? "", "type": type, "result": message["value"] ?? NSNull()]
                    try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: home.appendingPathComponent("last-inference-check.json"), options: .atomic)
                    let logFile = home.appendingPathComponent("inference-checks.json")
                    var logs = ((try? Data(contentsOf: logFile)).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [[String: Any]]) ?? []
                    logs.append(report)
                    try? JSONSerialization.data(withJSONObject: Array(logs.suffix(20)), options: [.prettyPrinted, .sortedKeys]).write(to: logFile, options: .atomic)
                }
                finish { self.emit(id, type, message["value"] ?? NSNull()) }
                continue
            }
            emit(id, type, message["value"] ?? NSNull())
        }
    }
    var bootQuestion: String?
    func writeStatus(_ stage: String) {
        let status: [String: Any] = ["stage": stage, "selfTest": selfTest, "time": ISO8601DateFormatter().string(from: Date())]
        try? JSONSerialization.data(withJSONObject: status, options: [.prettyPrinted]).write(to: home.appendingPathComponent("iphone-runtime-status.json"), options: .atomic)
    }
    func finish(completion: (() -> Void)? = nil) {
        sampling?.invalidate(); sampling = nil
        startupTimeout?.invalidate(); startupTimeout = nil; answerTimeout?.invalidate(); answerTimeout = nil
        let previous = worklet; let channel = ipc
        ipc?.readable = nil; ipc = nil; worklet = nil; bootMessage = nil
        if let file = photoPath { try? FileManager.default.removeItem(at: file); photoPath = nil }
        // The worker completes QVAC cleanup before sending its final message.
        DispatchQueue.global(qos: .utility).async {
            channel?.close(); previous?.terminate()
            DispatchQueue.main.async { self.activeID = nil; UIApplication.shared.isIdleTimerDisabled = self.interactionBusy || self.operatorTestActive; completion?() }
        }
    }
    func modelWorkerDigest() -> String? {
        guard let url = Bundle.main.url(forResource: "worker", withExtension: "bundle"), let data = try? Data(contentsOf: url) else { return nil }
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    func sampleMemory() {
        minAvailable = min(minAvailable, UInt64(os_proc_available_memory()))
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let status = withUnsafeMutablePointer(to: &info) { pointer in pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) } }
        if status == KERN_SUCCESS { peakFootprint = max(peakFootprint, info.phys_footprint) }
        sampleCount += 1
        if ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1", sampleCount % 4 == 0 {
            var data: [String: Any] = ["time": ISO8601DateFormatter().string(from: Date()), "peakFootprintBytes": peakFootprint, "minimumAvailableBytes": minAvailable, "samples": sampleCount, "physicalMemoryBytes": ProcessInfo.processInfo.physicalMemory, "thermalState": ProcessInfo.processInfo.thermalState.rawValue]
            if status == KERN_SUCCESS { data["virtualSizeBytes"] = info.virtual_size; data["residentSizeBytes"] = info.resident_size }
            if let gpu = MTLCreateSystemDefaultDevice() { data["metalAllocatedBytes"] = gpu.currentAllocatedSize; data["metalWorkingSetBytes"] = gpu.recommendedMaxWorkingSetSize }
            try? JSONSerialization.data(withJSONObject: data).write(to: home.appendingPathComponent("semantic-memory.json"), options: .atomic)
        }
    }
    func showPhotoPicker(_ id: String, camera: Bool) {
        guard pickerID == nil else { emit(id, "error", "Close the current photo picker first."); return }
        pickerID = id
        if camera {
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else { pickerID = nil; emit(id, "error", "Camera unavailable."); return }
            let picker = UIImagePickerController(); picker.sourceType = .camera; picker.delegate = self; present(picker, animated: true)
        } else {
            var config = PHPickerConfiguration(); config.filter = .images; config.selectionLimit = 1
            let picker = PHPickerViewController(configuration: config); picker.delegate = self; present(picker, animated: true)
        }
    }
    func deliverPhoto(_ image: UIImage?) {
        guard let id = pickerID else { return }; pickerID = nil
        guard let image = image else { emit(id, "result", NSNull()); return }
        let scale = min(1, 1024 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = resized.jpegData(compressionQuality: 0.8) else { emit(id, "error", "Could not read this photo."); return }
        emit(id, "result", "data:image/jpeg;base64," + data.base64EncodedString())
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let result = results.first else { deliverPhoto(nil); return }
        result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in DispatchQueue.main.async { self?.deliverPhoto(object as? UIImage) } }
    }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { picker.dismiss(animated: true); deliverPhoto(info[.originalImage] as? UIImage) }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated: true); deliverPhoto(nil) }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) { decisionHandler(navigationAction.request.url?.scheme == "dairyos" ? .allow : .cancel) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if ProcessInfo.processInfo.environment["DAIRYOS_DURATION_TEST"] == "1", let url = Bundle.main.url(forResource: "duration-test", withExtension: "js"), let script = try? String(contentsOf: url) { webView.evaluateJavaScript(script, completionHandler: nil) }
        if ProcessInfo.processInfo.environment["DAIRYOS_CHAT_FEEDBACK_TEST"] == "1", let url = Bundle.main.url(forResource: "chat-feedback-test", withExtension: "js"), let script = try? String(contentsOf: url) { webView.evaluateJavaScript(script, completionHandler: nil) }
        if ProcessInfo.processInfo.environment["DAIRYOS_AUTOMATIC_BLE_TEST"] == "1", let url = Bundle.main.url(forResource: "automatic-ble-test", withExtension: "js"), let script = try? String(contentsOf: url) { webView.evaluateJavaScript(script, completionHandler: nil) }
        if ProcessInfo.processInfo.environment["DAIRYOS_SENSOR_CHAT_TEST"] == "1", let url = Bundle.main.url(forResource: "sensor-chat-test", withExtension: "js"), let script = try? String(contentsOf: url) { webView.evaluateJavaScript(script, completionHandler: nil) }
        if ProcessInfo.processInfo.environment["DAIRYOS_REVIEW_CHAT"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                webView.evaluateJavaScript("localStorage.getItem('dairyos-phone-v1:turns')") { value, _ in
                    if let text = value as? String { try? text.write(to: self.home.appendingPathComponent("conversation-review.json"), atomically: true, encoding: .utf8) }
                }
            }
        }
        if ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_TEST"] == "1", let url = Bundle.main.url(forResource: "semantic-test", withExtension: "js"), let script = try? String(contentsOf: url) {
            let actuate = ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_ACTUATE"] == "1" ? "true" : "false"
            let smoke = ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_SMOKE"] == "1" ? "true" : "false"
            let resume = ProcessInfo.processInfo.environment["DAIRYOS_SEMANTIC_RESUME"] == "1" ? "true" : "false"
            webView.evaluateJavaScript("window.dairyosSemanticActuate=\(actuate);window.dairyosSemanticSmoke=\(smoke);window.dairyosSemanticResume=\(resume);" + script, completionHandler: nil)
        }
        if reconnectTest, let url = Bundle.main.url(forResource: "reconnect-test", withExtension: "js"), let script = try? String(contentsOf: url) {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
        if bleTest || bulbTest {
            let script = """
            (async()=>{const pause=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<100;i++){const tab=document.querySelector('[role=tab][aria-label=Devices]');if(tab){tab.click();break;}await pause(100);}await pause(2000);document.querySelector('[aria-label="Scan for boards"]')?.click();for(let i=0;i<120;i++){const buttons=[...document.querySelectorAll('[role=button]')].filter(e=>e.getAttribute('aria-label')?.startsWith('Connect '));if(buttons.length===1){buttons[0].click();break;}await pause(100);}})()
            """
            webView.evaluateJavaScript(script, completionHandler: nil)
        }

        if bulbTest, let url = Bundle.main.url(forResource: "bulb1-test", withExtension: "js"), let script = try? String(contentsOf: url) {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
        writeStatus("pageLoaded")
        if selfTest {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                webView.evaluateJavaScript("JSON.stringify({url:location.href,body:document.body.innerText.slice(0,2000),errors:window.dairyosErrors})") { value, error in
                    let data: [String: Any] = ["selfTest": self.selfTest, "state": value ?? NSNull(), "error": error?.localizedDescription ?? ""]
                    try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted]).write(to: self.home.appendingPathComponent("iphone-ui-state.json"), options: .atomic)
                }
            }
        }
        guard selfTest, let url = Bundle.main.url(forResource: "self-test", withExtension: "js"), let script = try? String(contentsOf: url) else { return }
        webView.evaluateJavaScript(script) { _, error in
            if let error = error { try? error.localizedDescription.write(to: self.home.appendingPathComponent("iphone-script-error.txt"), atomically: true, encoding: .utf8) }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { writeStatus("pageError:" + error.localizedDescription) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { writeStatus("pageError:" + error.localizedDescription) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "DairyOS Local", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "DairyOS Local", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Delete", style: .destructive) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { background(); bluetoothBackground(); webView.reload() }
}
