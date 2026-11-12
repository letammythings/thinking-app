import AVFoundation
import Foundation

@MainActor
final class VoiceService: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var isPlaying = false
    @Published var durationMs = 0
    @Published var levels: [CGFloat] = Array(repeating: 0.12, count: 24)

    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var fileURL: URL?

    func requestPermission() async -> Bool {
        await withCheckedContinuation { cont in
            AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
        }
    }

    func startRecording() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("thinking-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder?.isMeteringEnabled = true
        recorder?.record()
        fileURL = url
        isRecording = true
        durationMs = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func stopRecording() -> (Data, Int)? {
        recorder?.stop()
        isRecording = false
        timer?.invalidate()
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        return (data, durationMs)
    }

    func cancel() {
        recorder?.stop()
        isRecording = false
        timer?.invalidate()
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
    }

    func play(data: Data) throws {
        player = try AVAudioPlayer(data: data)
        player?.delegate = self
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    private func tick() {
        recorder?.updateMeters()
        let power = recorder?.averagePower(forChannel: 0) ?? -50
        let norm = CGFloat(max(0, min(1, (power + 50) / 50)))
        levels.removeFirst()
        levels.append(0.12 + norm * 0.88)
        if let recorder { durationMs = Int(recorder.currentTime * 1000) }
    }
}

extension VoiceService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.isPlaying = false }
    }
}
