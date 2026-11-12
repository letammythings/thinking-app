import Foundation
import Observation

struct RegisterBody: Encodable {
    let email: String
    let password: String
    let birthDate: String
    let ageConfirmed: Bool
}

struct LoginBody: Encodable {
    let email: String
    let password: String
}

struct IdentityBody: Encodable {
    let displayName: String
    let personaCard: [String]
}

struct InterestsBody: Encodable {
    let slugs: [String]
}

@Observable
final class SessionStore {
    var me: Me?
    var error: String?
    var loading = false

    var isSignedIn: Bool { APIClient.shared.token != nil && me != nil }
    var needsOnboarding: Bool { me?.account.onboardingCompleted == false }

    func restore() async {
        guard APIClient.shared.token != nil else { return }
        do {
            me = try await APIClient.shared.request("GET", path: "/v1/me")
        } catch {
            APIClient.shared.token = nil
            me = nil
        }
    }

    func register(email: String, password: String, birthDate: String) async {
        loading = true
        defer { loading = false }
        do {
            let auth: AuthResponse = try await APIClient.shared.request(
                "POST",
                path: "/v1/auth/register",
                body: RegisterBody(email: email, password: password, birthDate: birthDate, ageConfirmed: true)
            )
            APIClient.shared.token = auth.token
            me = auth.me
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func login(email: String, password: String) async {
        loading = true
        defer { loading = false }
        do {
            let auth: AuthResponse = try await APIClient.shared.request(
                "POST",
                path: "/v1/auth/login",
                body: LoginBody(email: email, password: password)
            )
            APIClient.shared.token = auth.token
            me = auth.me
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func completeOnboarding(name: String, card: [String], interests: [String]) async {
        do {
            me = try await APIClient.shared.request(
                "POST",
                path: "/v1/onboarding/identity",
                body: IdentityBody(displayName: name, personaCard: card)
            )
            if !interests.isEmpty {
                let _: Me = try await APIClient.shared.request(
                    "POST",
                    path: "/v1/onboarding/interests",
                    body: InterestsBody(slugs: interests)
                )
            }
            me = try await APIClient.shared.request("POST", path: "/v1/onboarding/complete", body: EmptyBody())
        } catch {
            self.error = error.localizedDescription
        }
    }

    func logout() async {
        _ = try? await APIClient.shared.request("POST", path: "/v1/auth/logout", body: EmptyBody()) as Empty
        APIClient.shared.token = nil
        me = nil
    }
}

struct EmptyBody: Encodable {}
