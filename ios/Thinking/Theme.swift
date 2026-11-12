import SwiftUI

enum ThinkingTheme {
    static let paper = Color(red: 0.957, green: 0.929, blue: 0.886)
    static let card = Color(red: 1.0, green: 0.976, blue: 0.945)
    static let ink = Color(red: 0.141, green: 0.118, blue: 0.094)
    static let muted = Color(red: 0.427, green: 0.388, blue: 0.345)
    static let ember = Color(red: 0.769, green: 0.361, blue: 0.149)
    static let sage = Color(red: 0.310, green: 0.435, blue: 0.376)
    static let line = Color(red: 0.894, green: 0.847, blue: 0.776)
}

struct ThinkingButton: View {
    let title: String
    var kind: Kind = .primary
    let action: () -> Void

    enum Kind { case primary, secondary, danger }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(background)
                .foregroundStyle(foreground)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(ThinkingTheme.line, lineWidth: kind == .secondary ? 1 : 0))
        }
        .buttonStyle(.plain)
    }

    private var background: Color {
        switch kind {
        case .primary: return ThinkingTheme.ink
        case .secondary: return .clear
        case .danger: return Color(red: 0.60, green: 0.18, blue: 0.18)
        }
    }

    private var foreground: Color {
        kind == .secondary ? ThinkingTheme.ink : ThinkingTheme.paper
    }
}
