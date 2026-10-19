import AppKit
import Darwin
import Foundation
import OpenPetsKit

/// Workbench-owned host. It never installs global configuration or reads AI credentials.
@main
struct WorkbenchPet {
    @MainActor
    static func main() {
        do {
            let arguments = CommandLine.arguments
            guard arguments.count == 5,
                  let size = Double(arguments[3]), [120.0, 200.0, 280.0, 360.0].contains(size),
                  let parentPID = Int32(arguments[4]), parentPID == getppid() else {
                throw CocoaError(.fileReadInvalidFileName)
            }
            let app = NSApplication.shared
            Darwin.umask(0o077)
            app.setActivationPolicy(.accessory)
            let petURL = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Pets/deepseek")
            let pet = try PetBundle.load(from: petURL)
            let configuration = OpenPetsHostConfiguration(
                petDirectoryURL: petURL,
                socketPath: arguments[1],
                display: .init(scale: size / Double(pet.atlas.cellWidth)),
                positionStoreURL: URL(fileURLWithPath: arguments[2])
            )
            let companionMenu = CompanionMenu()
            let session = OpenPetsHostSession(configuration: configuration, terminatesApplicationOnShutdown: true, contextMenuProvider: { companionMenu.menu() })
            try session.start()
            session.setWindowCompanionEnabled(true)
            let delegate = PetApplicationDelegate(session: session)
            app.delegate = delegate
            let parentWatch = Task { @MainActor in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    if getppid() != parentPID || Darwin.kill(parentPID, 0) != 0 {
                        session.stop()
                        app.terminate(nil)
                        return
                    }
                }
            }
            withExtendedLifetime(delegate) { app.run() }
            parentWatch.cancel()
            session.stop()
        } catch {
            FileHandle.standardError.write(Data("WorkbenchPet: \(error.localizedDescription)\n".utf8))
            Foundation.exit(1)
        }
    }
}

@MainActor
private final class PetApplicationDelegate: NSObject, NSApplicationDelegate {
    let session: OpenPetsHostSession
    init(session: OpenPetsHostSession) {
        self.session = session
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(petDoubleClicked), name: .openPetsPetDoubleClicked, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(petClicked), name: .openPetsPetClicked, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(actionRequested(_:)), name: .openPetsActionURLRequested, object: nil)
    }

    @objc private func petClicked() { emit(["workbenchPet": true, "type": "pet-action", "action": "pet"]) }
    @objc private func petDoubleClicked() { emit(["workbenchPet": true, "type": "open-chat"]) }

    @objc private func actionRequested(_ notification: Notification) {
        guard let url = notification.userInfo?["url"] as? URL,
              url.scheme == "openpets", url.host == "action",
              url.pathComponents.count == 3, url.pathComponents[1] == "conversation" else { return }
        let conversationID = url.lastPathComponent
        guard conversationID.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { return }
        emit(["workbenchPet": true, "type": "open-result", "conversationId": conversationID])
    }

    private func emit(_ event: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        FileHandle.standardOutput.write(data + Data([10]))
    }
    func applicationWillTerminate(_ notification: Notification) { session.stop() }
}
