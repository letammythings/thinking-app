import Foundation
import Security

enum APIError: LocalizedError {
    case server(code: String, message: String)
    case transport

    var errorDescription: String? {
        switch self {
        case .server(_, let message): return message
        case .transport: return "Could not reach Thinking."
        }
    }
}

final class APIClient {
    static let shared = APIClient()
    private let session = URLSession(configuration: .default)
    private let tokenKey = "thinking.session"

    var token: String? {
        get { Keychain.load(tokenKey) }
        set {
            if let newValue { Keychain.save(tokenKey, newValue) }
            else { Keychain.delete(tokenKey) }
        }
    }

    func request<T: Decodable>(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        var request = URLRequest(url: Config.apiBase.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.transport }
        if http.statusCode >= 400 {
            if let parsed = try? JSONDecoder().decode(APIErrorBody.self, from: data) {
                throw APIError.server(code: parsed.error.code, message: parsed.error.message)
            }
            throw APIError.transport
        }
        if T.self == Empty.self {
            return Empty() as! T
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func uploadVoice(data: Data, durationMs: Int) async throws -> VoiceUpload {
        let boundary = "thinking-\(UUID().uuidString)"
        var request = URLRequest(url: Config.apiBase.appending(path: "/v1/voice"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"durationMs\"\r\n\r\n\(durationMs)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"note.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        let (resp, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
            throw APIError.transport
        }
        return try JSONDecoder().decode(VoiceUpload.self, from: resp)
    }
}

struct Empty: Decodable {}
struct VoiceUpload: Decodable { let id: String; let durationMs: Int }

struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ value: any Encodable) {
        encodeFn = value.encode
    }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}

enum Keychain {
    static func save(_ key: String, _ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
