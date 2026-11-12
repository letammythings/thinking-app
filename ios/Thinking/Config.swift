import Foundation

enum Config {
    static var apiBase: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "THINKING_API_BASE") as? String,
           let url = URL(string: raw) {
            return url
        }
        #if targetEnvironment(simulator)
        return URL(string: "http://127.0.0.1:8787")!
        #else
        return URL(string: "http://127.0.0.1:8787")!
        #endif
    }
}
