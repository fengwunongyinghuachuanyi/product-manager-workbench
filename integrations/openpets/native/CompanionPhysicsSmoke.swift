import AppKit
import Foundation
import Darwin
@testable import OpenPetsKit

@main
struct CompanionPhysicsSmoke {
    @MainActor static func main() {
        _ = NSApplication.shared
        NSApplication.shared.setActivationPolicy(.accessory)
        guard let screen = NSScreen.screens.first else { fatalError("No screen geometry") }
        let area = screen.visibleFrame
        let left = area.minX + 100
        let top = area.maxY - 240
        let panel = NSPanel(contentRect: CGRect(x: left, y: top + 80, width: 120, height: 130), styleMask: [.borderless], backing: .buffered, defer: false)
        // The panel is never shown; tests only exercise native frame geometry.
        var now = Date()
        var platforms = [OpenPetsWindowPlatform(id: 20, left: left, right: left + 500, top: top, windowX: left, ownerPID: Int(getppid()))]
        var moves = 0
        let physics = OpenPetsWindowCompanion(window: panel, anchor: { CGRect(x: 0, y: 0, width: 120, height: 130) }, onMove: { moves += 1 }, onLand: {}, platformProvider: { _ in platforms }, trackedPlatformProvider: { id, _ in platforms.first(where: { $0.id == id }) }, visibility: { true }, clock: { now })
        physics.perch()
        precondition(abs(panel.frame.minY + 8.45 - top) < 1.1, "Perch must align feet with window edge")
        let old = panel.frame.origin
        platforms = [OpenPetsWindowPlatform(id: 20, left: left + 45, right: left + 545, top: top - 35, windowX: left + 45, ownerPID: Int(getppid()))]
        now.addTimeInterval(0.3)
        physics.step(dt: 0.033)
        precondition(abs(panel.frame.minX - old.x - 45) < 1.1, "Pet must follow horizontal movement")
        precondition(abs(panel.frame.minY - old.y + 35) < 1.1, "Pet must follow vertical movement")
        let beforeFastFollow = panel.frame.origin
        platforms = [OpenPetsWindowPlatform(id: 20, left: left + 51, right: left + 551, top: top - 39, windowX: left + 51, ownerPID: Int(getppid()))]
        now.addTimeInterval(1.0 / 60.0 + 0.001)
        physics.step(dt: 1.0 / 60.0)
        precondition(abs(panel.frame.minX - beforeFastFollow.x - 6) < 1.1, "Follow must advance between 250 ms full scans")
        precondition(abs(panel.frame.minY - beforeFastFollow.y + 4) < 1.1, "Vertical follow must advance between full scans")
        let movesBeforeIdle = moves
        for _ in 0..<60 { now.addTimeInterval(1.0 / 60.0 + 0.001); physics.step(dt: 1.0 / 60.0) }
        precondition(moves == movesBeforeIdle, "Stationary pet must not repeatedly move panels or redraw")
        // Multiple exposed spans of the same window must not drop a right-side attachment.
        let center = panel.frame.midX
        platforms = [
            OpenPetsWindowPlatform(id: 20, left: left + 51, right: center - 80, top: top - 39, windowX: left + 51, ownerPID: Int(getppid())),
            OpenPetsWindowPlatform(id: 20, left: center - 60, right: left + 551, top: top - 39, windowX: left + 51, ownerPID: Int(getppid()))
        ]
        now.addTimeInterval(0.3)
        let attachedY = panel.frame.minY
        physics.step(dt: 0.033)
        precondition(abs(panel.frame.minY - attachedY) < 1.1, "Attachment must resolve the containing span")
        platforms = []
        now.addTimeInterval(0.3)
        physics.step(dt: 0.033)
        precondition(panel.frame.minY < attachedY, "Pet must fall when window disappears")
        for _ in 0..<100 { physics.step(dt: 0.033) }
        precondition(abs(panel.frame.minY + 8.45 - area.minY) < 1.1, "Pet must land on desktop floor")
        physics.stop()
        if let primary = NSScreen.screens.first,
           let live = OpenPetsWindowCompanion.visiblePlatforms(primaryTop: primary.frame.maxY).first {
            var times: [Double] = []
            for _ in 0..<120 {
                let start = ProcessInfo.processInfo.systemUptime
                let tracked = OpenPetsWindowCompanion.trackedPlatform(id: live.id, primaryTop: primary.frame.maxY)
                precondition(tracked?.id == live.id, "Targeted probe must return the supporting window")
                times.append((ProcessInfo.processInfo.systemUptime - start) * 1000)
            }
            times.sort()
            print(String(format: "Targeted window probe: median %.3f ms; p95 %.3f ms (120 real samples)", times[60], times[114]))
        }
        panel.close()
        print("PASS: perch, horizontal/vertical follow, 60 Hz targeted follow, idle redraw suppression, exposed spans, disappear/fall, desktop floor")
    }
}
