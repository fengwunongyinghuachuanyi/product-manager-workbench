import Foundation

// Resource accessor for the direct local build (equivalent to SwiftPM's generated accessor).
extension Bundle {
    static let module = Bundle(url: Bundle.main.executableURL!
        .deletingLastPathComponent()
        .appendingPathComponent("OpenPetsKit_OpenPetsKit.bundle"))!
}
