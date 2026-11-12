import SwiftUI

struct RootView: View {
    @State private var session = SessionStore()

    var body: some View {
        Group {
            if session.isSignedIn && session.needsOnboarding {
                OnboardingView(session: session)
            } else if session.isSignedIn {
                MainTabView(session: session)
            } else {
                WelcomeView(session: session)
            }
        }
        .tint(ThinkingTheme.ember)
        .task { await session.restore() }
    }
}

struct WelcomeView: View {
    @Bindable var session: SessionStore
    @State private var email = ""
    @State private var password = ""
    @State private var birth = Date(timeIntervalSince1970: 757382400)
    @State private var register = false
    @State private var confirmed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Thinking")
                    .font(.custom("Iowan Old Style", size: 44))
                Text("People connect through thoughts, not followers.")
                    .font(.title3)
                    .foregroundStyle(ThinkingTheme.muted)
                if let error = session.error {
                    Text(error).foregroundStyle(.red)
                }
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                if register {
                    DatePicker("Birth date", selection: $birth, displayedComponents: .date)
                    Toggle("I am 18 or older", isOn: $confirmed)
                }
                ThinkingButton(title: register ? "Create account" : "Sign in") {
                    Task {
                        if register {
                            let fmt = DateFormatter()
                            fmt.dateFormat = "yyyy-MM-dd"
                            guard confirmed else { session.error = "Please confirm you are 18 or older."; return }
                            await session.register(email: email, password: password, birthDate: fmt.string(from: birth))
                        } else {
                            await session.login(email: email, password: password)
                        }
                    }
                }
                Button(register ? "I already have an account" : "Create a private account") {
                    register.toggle()
                }
                .foregroundStyle(ThinkingTheme.sage)
            }
            .padding(24)
        }
        .background(ThinkingTheme.paper.ignoresSafeArea())
    }
}

struct OnboardingView: View {
    @Bindable var session: SessionStore
    @State private var name: String = ""
    @State private var one = "Curious traveler"
    @State private var two = "Loves food"
    @State private var three = "Learning languages"
    @State private var picked: Set<String> = []
    @State private var interests: [(slug: String, name: String)] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Your public self").font(.custom("Iowan Old Style", size: 32))
                Text("Strangers never see your email.").foregroundStyle(ThinkingTheme.muted)
                TextField("Display name", text: $name)
                TextField("Line one", text: $one)
                TextField("Line two", text: $two)
                TextField("Line three", text: $three)
                FlexibleChips(options: interests.map(\.slug), labels: Dictionary(uniqueKeysWithValues: interests.map { ($0.slug, $0.name) }), picked: $picked)
                ThinkingButton(title: "Enter Thinking") {
                    Task {
                        await session.completeOnboarding(
                            name: name,
                            card: [one, two, three].filter { !$0.isEmpty },
                            interests: Array(picked)
                        )
                    }
                }
            }
            .padding(24)
        }
        .background(ThinkingTheme.paper.ignoresSafeArea())
        .task {
            name = session.me?.identity?.displayName ?? ""
            struct InterestWrap: Codable { let interests: [Interest] }
            struct Interest: Codable { let slug: String; let name: String }
            if let wrap: InterestWrap = try? await APIClient.shared.request("GET", path: "/v1/interests") {
                interests = wrap.interests.map { ($0.slug, $0.name) }
            }
        }
    }
}

struct FlexibleChips: View {
    let options: [String]
    let labels: [String: String]
    @Binding var picked: Set<String>

    var body: some View {
        FlowLayout {
            ForEach(options, id: \.self) { slug in
                Button(labels[slug] ?? slug) {
                    if picked.contains(slug) { picked.remove(slug) } else { picked.insert(slug) }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(picked.contains(slug) ? ThinkingTheme.ink : ThinkingTheme.card)
                .foregroundStyle(picked.contains(slug) ? ThinkingTheme.paper : ThinkingTheme.ink)
                .clipShape(Capsule())
            }
        }
    }
}

struct FlowLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal: proposal, subviews: subviews)
        let height = rows.last.map { $0.origin.y + $0.size.height } ?? 0
        return CGSize(width: proposal.width ?? 300, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(proposal: proposal, subviews: subviews)
        for (sub, frame) in zip(subviews, rows) {
            sub.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> [CGRect] {
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        let maxW = proposal.width ?? 300
        var frames: [CGRect] = []
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > maxW {
                x = 0
                y += rowH + 8
                rowH = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowH = max(rowH, size.height)
            x += size.width + 8
        }
        return frames
    }
}

struct MainTabView: View {
    var session: SessionStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "sun.max") }
            QuestionsView()
                .tabItem { Label("Questions", systemImage: "text.quote") }
            NotesView()
                .tabItem { Label("Notes", systemImage: "note.text") }
            TalksView()
                .tabItem { Label("Talks", systemImage: "bubble.left.and.bubble.right") }
            YouView(session: session)
                .tabItem { Label("You", systemImage: "person.crop.circle") }
        }
        .background(ThinkingTheme.paper)
    }
}

struct HomeView: View {
    @State private var home: HomePayload?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let q = home?.questionOfTheDay {
                        NavigationLink(value: q.id) {
                            Card {
                                Text("QUESTION OF THE DAY").font(.caption).foregroundStyle(ThinkingTheme.ember)
                                Text(q.prompt).font(.custom("Iowan Old Style", size: 26))
                                    .foregroundStyle(ThinkingTheme.ink)
                            }
                        }
                    }
                    ForEach(home?.answers ?? []) { answer in
                        Card {
                            Text(answer.author.displayName).font(.caption).foregroundStyle(ThinkingTheme.muted)
                            Text(answer.body ?? "Voice answer")
                            NavigationLink("Talk about this") {
                                ConversationLoader(startAnswerId: answer.id)
                            }
                        }
                    }
                    ForEach(home?.notes ?? []) { note in
                        Card {
                            Text(note.author.displayName).font(.caption)
                            Text(note.body).font(.custom("Iowan Old Style", size: 22))
                        }
                    }
                }
                .padding()
            }
            .background(ThinkingTheme.paper.ignoresSafeArea())
            .navigationTitle("Thinking")
            .navigationDestination(for: String.self) { QuestionDetailView(id: $0) }
            .task {
                struct Wrap: Codable { let questionOfTheDay: Question?; let waiting: [Question]; let answers: [Answer]; let notes: [Note]; let culture: [Question]; let people: [Identity] }
                home = try? await APIClient.shared.request("GET", path: "/v1/home")
            }
        }
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThinkingTheme.card)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(ThinkingTheme.line, lineWidth: 1))
    }
}

struct QuestionsView: View {
    @State private var questions: [Question] = []
    @State private var prompt = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("A question that opens a conversation", text: $prompt, axis: .vertical)
                    ThinkingButton(title: "Publish") {
                        Task {
                            struct Created: Codable { let question: Question }
                            _ = try? await APIClient.shared.request("POST", path: "/v1/questions", body: ["prompt": prompt]) as Created
                            prompt = ""
                            await load()
                        }
                    }
                    ForEach(questions) { q in
                        NavigationLink(value: q.id) {
                            Card { Text(q.prompt).foregroundStyle(ThinkingTheme.ink) }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Questions")
            .navigationDestination(for: String.self) { QuestionDetailView(id: $0) }
            .task { await load() }
            .background(ThinkingTheme.paper.ignoresSafeArea())
        }
    }

    func load() async {
        struct Wrap: Codable { let questions: [Question] }
        questions = (try? await APIClient.shared.request("GET", path: "/v1/questions") as Wrap)?.questions ?? []
    }
}

struct QuestionDetailView: View {
    let id: String
    @State private var prompt = ""
    @State private var answers: [Answer] = []
    @State private var draft = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(prompt).font(.custom("Iowan Old Style", size: 28))
                TextField("Here’s what is true for me…", text: $draft, axis: .vertical)
                ThinkingButton(title: "Share answer") {
                    Task {
                        struct Id: Codable { let id: String }
                        _ = try? await APIClient.shared.request("POST", path: "/v1/questions/\(id)/answers", body: ["body": draft]) as Id
                        draft = ""
                        await load()
                    }
                }
                ForEach(answers) { a in
                    Card {
                        Text(a.author.displayName).font(.caption)
                        Text(a.body ?? "Voice answer")
                        NavigationLink("Start a conversation") {
                            ConversationLoader(startAnswerId: a.id)
                        }
                    }
                }
            }
            .padding()
        }
        .background(ThinkingTheme.paper.ignoresSafeArea())
        .task { await load() }
    }

    func load() async {
        struct QWrap: Codable { let question: Question }
        struct AWrap: Codable { let answers: [Answer] }
        prompt = (try? await APIClient.shared.request("GET", path: "/v1/questions/\(id)") as QWrap)?.question.prompt ?? ""
        answers = (try? await APIClient.shared.request("GET", path: "/v1/questions/\(id)/answers") as AWrap)?.answers ?? []
    }
}

struct NotesView: View {
    @State private var notes: [Note] = []
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("A thought you wish someone else knew", text: $draft, axis: .vertical)
                    ThinkingButton(title: "Leave a note") {
                        Task {
                            struct Id: Codable { let id: String }
                            _ = try? await APIClient.shared.request("POST", path: "/v1/notes", body: ["body": draft, "kind": "thought"]) as Id
                            draft = ""
                            await load()
                        }
                    }
                    ForEach(notes) { note in
                        Card {
                            Text(note.kind.uppercased()).font(.caption).foregroundStyle(ThinkingTheme.ember)
                            Text(note.body).font(.custom("Iowan Old Style", size: 22))
                            Text(note.author.displayName).font(.caption).foregroundStyle(ThinkingTheme.muted)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Notes")
            .task { await load() }
            .background(ThinkingTheme.paper.ignoresSafeArea())
        }
    }

    func load() async {
        struct Wrap: Codable { let notes: [Note] }
        notes = (try? await APIClient.shared.request("GET", path: "/v1/notes") as Wrap)?.notes ?? []
    }
}

struct TalksView: View {
    @State private var items: [ConversationSummary] = []

    var body: some View {
        NavigationStack {
            List(items) { item in
                NavigationLink {
                    ConversationView(id: item.id)
                } label: {
                    VStack(alignment: .leading) {
                        Text(item.peer?.displayName ?? "Conversation")
                        Text(item.intent.replacingOccurrences(of: "_", with: " "))
                            .font(.caption)
                            .foregroundStyle(ThinkingTheme.muted)
                    }
                }
            }
            .navigationTitle("Talks")
            .task {
                struct Wrap: Codable { let conversations: [ConversationSummary] }
                items = (try? await APIClient.shared.request("GET", path: "/v1/conversations") as Wrap)?.conversations ?? []
            }
        }
    }
}

struct ConversationLoader: View {
    let startAnswerId: String
    @State private var id: String?

    var body: some View {
        Group {
            if let id { ConversationView(id: id) }
            else { ProgressView() }
        }
        .task {
            struct Started: Codable { let conversationId: String }
            id = try? await APIClient.shared.request(
                "POST",
                path: "/v1/answers/\(startAnswerId)/converse",
                body: ["intent": "just_talk", "firstMessage": "I read your answer and would like to talk."]
            ) as Started
            .conversationId
        }
    }
}

struct ConversationView: View {
    let id: String
    @State private var messages: [ChatMessage] = []
    @State private var peer = "Conversation"
    @State private var scam = false
    @State private var draft = ""
    @State private var ideas: [Suggestion] = []
    @State private var warning: String?

    var body: some View {
        VStack {
            if scam {
                Text("This conversation contains patterns commonly associated with scams. Never send money, passwords, verification codes, cryptocurrency, or banking information.")
                    .font(.footnote)
                    .padding()
                    .background(Color.yellow.opacity(0.25))
            }
            ScrollView {
                ForEach(messages) { message in
                    HStack {
                        if message.mine { Spacer() }
                        Text(message.body ?? (message.voiceId == nil ? "" : "Voice message"))
                            .padding(12)
                            .background(message.mine ? ThinkingTheme.ink : ThinkingTheme.card)
                            .foregroundStyle(message.mine ? ThinkingTheme.paper : ThinkingTheme.ink)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        if !message.mine { Spacer() }
                    }
                    .padding(.horizontal)
                }
            }
            if let warning {
                Text(warning).font(.footnote).foregroundStyle(.red).padding(.horizontal)
            }
            ForEach(ideas, id: \.text) { idea in
                Button(idea.text) { draft = idea.text }
                    .font(.footnote)
            }
            HStack {
                TextField("A real sentence", text: $draft, axis: .vertical)
                Button("Send") { Task { await send() } }
            }
            .padding()
            HStack {
                Button("Help me") { Task { await assist() } }
                Button("End") { Task { let _: Empty = (try? await APIClient.shared.request("POST", path: "/v1/conversations/\(id)/end", body: EmptyBody())) ?? Empty() } }
            }
            .padding(.bottom)
        }
        .navigationTitle(peer)
        .background(ThinkingTheme.paper)
        .task { await load() }
    }

    func load() async {
        struct Wrap: Codable {
            struct Conversation: Codable {
                let peer: Identity?
                let scamWarned: Bool
            }
            let conversation: Conversation
            let messages: [ChatMessage]
        }
        if let wrap: Wrap = try? await APIClient.shared.request("GET", path: "/v1/conversations/\(id)") {
            messages = wrap.messages
            peer = wrap.conversation.peer?.displayName ?? "Talk"
            scam = wrap.conversation.scamWarned
        }
    }

    func send(confirmPii: Bool = false, confirmScam: Bool = false) async {
        do {
            struct Id: Codable { let id: String }
            let _: Id = try await APIClient.shared.request(
                "POST",
                path: "/v1/conversations/\(id)/messages",
                body: MessageBody(body: draft, confirmPii: confirmPii, confirmScam: confirmScam)
            )
            draft = ""
            warning = nil
            await load()
        } catch let APIError.server(code, message) {
            warning = message
            if code == "pii_warning" { await send(confirmPii: true, confirmScam: confirmScam) }
        } catch {
            warning = error.localizedDescription
        }
    }

    func assist() async {
        struct Wrap: Codable { let suggestions: [Suggestion] }
        ideas = (try? await APIClient.shared.request("POST", path: "/v1/conversations/\(id)/assist", body: EmptyBody()) as Wrap)?.suggestions ?? []
    }
}

struct YouView: View {
    var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                Section("Identity") {
                    Text(session.me?.identity?.displayName ?? "")
                    Text((session.me?.identity?.personaCard ?? []).joined(separator: " · "))
                        .foregroundStyle(ThinkingTheme.muted)
                }
                Section("Safety") {
                    NavigationLink("Safety center") { SafetyView() }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await session.logout() }
                    }
                    Button("Delete account", role: .destructive) {
                        Task {
                            let _: Empty = (try? await APIClient.shared.request("DELETE", path: "/v1/me")) ?? Empty()
                            APIClient.shared.token = nil
                            await session.logout()
                        }
                    }
                }
            }
            .navigationTitle("You")
        }
    }
}

struct SafetyView: View {
    @State private var rules: [String] = []

    var body: some View {
        List(rules, id: \.self) { Text($0) }
            .navigationTitle("Safety")
            .task {
                struct Wrap: Codable { let rules: [String] }
                rules = (try? await APIClient.shared.request("GET", path: "/v1/safety") as Wrap)?.rules ?? []
            }
    }
}
