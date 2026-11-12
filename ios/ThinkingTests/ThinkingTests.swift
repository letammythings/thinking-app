import XCTest
@testable import Thinking

final class ThinkingTests: XCTestCase {
    func testIdentityNamesAreDecodable() throws {
        let json = """
        {"id":"1","displayName":"Blue Lantern","personaCard":["Curious"],"countryCode":null,"region":null,"ageRange":null,"languages":[]}
        """.data(using: .utf8)!
        let ident = try JSONDecoder().decode(Identity.self, from: json)
        XCTAssertEqual(ident.displayName, "Blue Lantern")
        XCTAssertEqual(ident.personaCard, ["Curious"])
    }

    func testApiErrorPayload() throws {
        let json = """
        {"error":{"code":"scam_warning","message":"Be careful."}}
        """.data(using: .utf8)!
        let body = try JSONDecoder().decode(APIErrorBody.self, from: json)
        XCTAssertEqual(body.error.code, "scam_warning")
    }
}
