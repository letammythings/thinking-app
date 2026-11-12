import Foundation

struct APIErrorPayload: Codable {
    let code: String
    let message: String
}

struct APIErrorBody: Codable {
    let error: APIErrorPayload
}

struct Identity: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String
    let personaCard: [String]
    let countryCode: String?
    let region: String?
    let ageRange: String?
    let languages: [String]
}

struct AccountInfo: Codable {
    let role: String
    let status: String
    let onboardingCompleted: Bool
    let createdAt: String
    let hasEmail: Bool
}

struct Me: Codable {
    let account: AccountInfo
    let identity: Identity?
    let interests: [String]
}

struct AuthResponse: Codable {
    let token: String
    let me: Me
}

struct Question: Codable, Identifiable {
    let id: String
    let prompt: String
    let kind: String
    let categoryId: String?
    let featured: Bool?
    let createdAt: String?
    let answerCount: Int?
}

struct Answer: Codable, Identifiable {
    let id: String
    let body: String?
    let voiceId: String?
    let createdAt: String
    let prompt: String?
    let questionId: String?
    let author: Identity
}

struct Note: Codable, Identifiable {
    let id: String
    let body: String
    let kind: String
    let createdAt: String
    let repliesAllowed: Bool
    let conversationAllowed: Bool
    let author: Identity
}

struct HomePayload: Codable {
    let questionOfTheDay: Question?
    let waiting: [Question]
    let answers: [Answer]
    let notes: [Note]
    let culture: [Question]
    let people: [Identity]
}

struct ConversationSummary: Codable, Identifiable {
    let id: String
    let intent: String
    let status: String
    let originType: String
    let scamWarned: Bool
    let createdAt: String
    let peer: Identity?
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    let type: String
    let body: String?
    let voiceId: String?
    let senderIdentityId: String?
    let mine: Bool
    let createdAt: String
}

struct Suggestion: Codable {
    let move: String
    let text: String
}

struct MessageBody: Encodable {
    let body: String
    let confirmPii: Bool
    let confirmScam: Bool
}
