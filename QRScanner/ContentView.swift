import SwiftUI

struct ContentView: View {
    @ObservedObject var appState: AppState

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            NavigationStack {
                ScannerView(session: appState.scannerSession)
            }
            .tabItem {
                Label("Scanner", systemImage: "qrcode.viewfinder")
            }
            .tag(AppTab.scanner)

            NavigationStack {
                HistoryView(session: appState.scannerSession)
            }
            .tabItem {
                Label("History", systemImage: "clock")
            }
            .tag(AppTab.history)
        }
        .tabViewStyle(.automatic)
    }
}

private struct ScannerView: View {
    let session: ScannerSessionStore

    var body: some View {
        ContentUnavailableView(
            "Scanner",
            systemImage: "qrcode.viewfinder",
            description: Text("Camera scanning will appear here.")
        )
        .navigationTitle("Scanner")
    }
}

private struct HistoryView: View {
    let session: ScannerSessionStore

    var body: some View {
        ContentUnavailableView(
            "History",
            systemImage: "clock",
            description: Text("Your scan history will appear here.")
        )
        .navigationTitle("History")
    }
}

#Preview {
    ContentView(appState: AppState())
}
