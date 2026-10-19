import AppKit
import CoreGraphics
import Foundation
import Darwin

/// Geometry-only window platforms. Does not capture pixels, names, or window contents.
struct OpenPetsWindowPlatform: Equatable {
    let id: Int
    let left: CGFloat
    let right: CGFloat
    let top: CGFloat
    let windowX: CGFloat
    let ownerPID: Int
}

@MainActor
final class OpenPetsWindowCompanion {
    private weak var window: NSWindow?
    private let anchor: () -> CGRect
    private let onMove: () -> Void
    private let onLand: () -> Void
    private var task: Task<Void, Never>?
    private var dragging = false
    private var velocity = CGVector.zero
    private var attachment: (id: Int, offset: CGFloat)?
    private var platforms: [OpenPetsWindowPlatform] = []
    private var lastProbe = Date.distantPast
    private var lastTrackingProbe = Date.distantPast
    private let platformProvider: (CGFloat) -> [OpenPetsWindowPlatform]
    private let trackedPlatformProvider: ((Int, CGFloat) -> OpenPetsWindowPlatform?)?
    private let visibility: () -> Bool
    private let clock: () -> Date

    init(window: NSWindow, anchor: @escaping () -> CGRect, onMove: @escaping () -> Void, onLand: @escaping () -> Void, platformProvider: @escaping (CGFloat) -> [OpenPetsWindowPlatform] = OpenPetsWindowCompanion.visiblePlatforms, trackedPlatformProvider: ((Int, CGFloat) -> OpenPetsWindowPlatform?)? = OpenPetsWindowCompanion.trackedPlatform, visibility: (() -> Bool)? = nil, clock: @escaping () -> Date = Date.init) {
        self.window = window
        self.anchor = anchor
        self.onMove = onMove
        self.onLand = onLand
        self.platformProvider = platformProvider
        self.trackedPlatformProvider = trackedPlatformProvider
        self.visibility = visibility ?? { [weak window] in window?.isVisible == true }
        self.clock = clock
    }

    func start() {
        stop()
        task = Task { @MainActor [weak self] in
            var last = ContinuousClock.now
            while !Task.isCancelled {
                do { try await Task.sleep(for: .nanoseconds(16_666_667)) } catch { return }
                let now = ContinuousClock.now
                let elapsed = last.duration(to: now)
                last = now
                let dt = min(0.05, Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18)
                self?.step(dt: max(0, dt))
            }
        }
    }

    func stop() { task?.cancel(); task = nil }
    func dragStarted() { dragging = true; attachment = nil; velocity = .zero }
    func perch() {
        guard let window else { return }
        let pet = anchor()
        guard let primary = NSScreen.screens.first else { return }
        platforms = platformProvider(primary.frame.maxY)
        let eligible = platforms.filter { platform in
            guard let screen = NSScreen.screens.first(where: { $0.frame.contains(CGPoint(x: (platform.left + platform.right) / 2, y: platform.top - 1)) }) else { return false }
            return platform.top < screen.visibleFrame.maxY - pet.height && platform.top > screen.visibleFrame.minY && platform.right - platform.left > pet.width
        }
        guard let platform = eligible.first(where: { $0.ownerPID == Int(getppid()) }) ?? eligible.first else { return }
        let x = (platform.left + platform.right) / 2 - pet.midX
        attachment = (platform.id, x - platform.windowX)
        velocity = .zero
        dragging = false
        window.setFrameOrigin(CGPoint(x: x, y: platform.top - pet.minY - pet.height * 0.065))
        NSLog("[Companion] perched on window %d owner %d", platform.id, platform.ownerPID)
        onMove()
    }

    func interactionEnded() { dragging = false }
    func dragEnded(velocity: CGVector) {
        dragging = false
        self.velocity = CGVector(dx: max(-500, min(500, velocity.dx)), dy: max(-500, min(500, velocity.dy)))
    }

    func step(dt: Double) {
        guard !dragging, let window, visibility() else { return }
        let origin = window.frame.origin
        let pet = anchor()
        let center = origin.x + pet.midX
        let screen = NSScreen.screens.first { $0.frame.contains(CGPoint(x: center, y: origin.y + pet.midY)) } ?? NSScreen.main
        guard let screen else { return }
        let area = screen.visibleFrame
        let now = clock()
        let primaryTop = NSScreen.screens.first?.frame.maxY ?? screen.frame.maxY
        if now.timeIntervalSince(lastProbe) >= 0.25 {
            platforms = platformProvider(primaryTop)
            lastProbe = now
            lastTrackingProbe = now
        } else if let attachment, attachment.id >= 0,
                  now.timeIntervalSince(lastTrackingProbe) >= 1.0 / 60.0,
                  let trackedPlatformProvider {
            // Sample only the supporting window between full occlusion scans.
            // This removes quarter-second position jumps without scanning all windows at 60 Hz.
            lastTrackingProbe = now
            if let tracked = trackedPlatformProvider(attachment.id, primaryTop),
               let previous = platforms.first(where: { $0.id == attachment.id }) {
                let dx = tracked.windowX - previous.windowX
                platforms = platforms.map { platform in
                    guard platform.id == tracked.id else { return platform }
                    return OpenPetsWindowPlatform(id: platform.id, left: platform.left + dx, right: platform.right + dx, top: tracked.top, windowX: tracked.windowX, ownerPID: platform.ownerPID)
                }
            } else {
                platforms.removeAll { $0.id == attachment.id }
            }
        }
        let floor = OpenPetsWindowPlatform(id: -1, left: area.minX, right: area.maxX, top: area.minY, windowX: area.minX, ownerPID: -1)
        let candidates = platforms.filter { $0.top <= area.maxY - pet.height * 0.5 && $0.top > area.minY } + [floor]
        let footOffset = pet.minY + pet.height * 0.065
        if let attachment, let platform = candidates.first(where: { $0.id == attachment.id && $0.windowX + attachment.offset + pet.midX >= $0.left && $0.windowX + attachment.offset + pet.midX <= $0.right }) {
            let nextX = platform.windowX + attachment.offset
            let newCenter = nextX + pet.midX
            if newCenter >= platform.left && newCenter <= platform.right {
                let newY = platform.top - footOffset
                // NSWindow rounds origins to screen coordinates; compare the same
                // rounded target to avoid redrawing a stationary fractional anchor.
                let next = CGPoint(x: nextX.rounded(), y: newY.rounded())
                if abs(next.x - origin.x) > 0.01 || abs(next.y - origin.y) > 0.01 {
                    window.setFrameOrigin(next)
                    onMove()
                }
                return
            }
        }
        attachment = nil
        velocity.dy = max(-1200, velocity.dy - 1800 * dt)
        velocity.dx *= exp(-0.8 * dt)
        let nextX = max(area.minX - pet.minX, min(area.maxX - pet.maxX, origin.x + velocity.dx * dt))
        let nextY = origin.y + velocity.dy * dt
        let foot = origin.y + footOffset
        let nextFoot = nextY + footOffset
        let landing = velocity.dy <= 0 ? candidates.filter {
            nextX + pet.midX >= $0.left && nextX + pet.midX <= $0.right && foot >= $0.top - 3 && nextFoot <= $0.top
        }.max(by: { $0.top < $1.top }) : nil
        if let landing {
            NSLog("[Companion] landed on window %d", landing.id)
            attachment = (landing.id, nextX - landing.windowX)
            onLand()
            velocity = .zero
            window.setFrameOrigin(CGPoint(x: nextX, y: landing.top - footOffset))
        } else if nextFoot < area.minY {
            attachment = (floor.id, nextX - floor.windowX)
            onLand()
            velocity = .zero
            window.setFrameOrigin(CGPoint(x: nextX, y: area.minY - footOffset))
        } else {
            window.setFrameOrigin(CGPoint(x: nextX, y: nextY))
        }
        onMove()
    }

    /// Front-to-back occlusion keeps the pet off covered portions of window top edges.
    nonisolated static func trackedPlatform(id: Int, primaryTop: CGFloat) -> OpenPetsWindowPlatform? {
        guard let info = (CGWindowListCopyWindowInfo(.optionIncludingWindow, CGWindowID(id)) as? [[String: Any]])?.first(where: { ($0[kCGWindowNumber as String] as? Int) == id }),
              (info[kCGWindowIsOnscreen as String] as? Bool) == true,
              let bounds = info[kCGWindowBounds as String] as? [String: Any],
              let raw = CGRect(dictionaryRepresentation: bounds as CFDictionary),
              raw.width >= 80, raw.height >= 50 else { return nil }
        return OpenPetsWindowPlatform(id: id, left: raw.minX, right: raw.maxX, top: primaryTop - raw.minY, windowX: raw.minX, ownerPID: info[kCGWindowOwnerPID as String] as? Int ?? -1)
    }

    /// Full scans retain front-to-back occlusion and run at a lower cadence.
    nonisolated static func visiblePlatforms(primaryTop: CGFloat) -> [OpenPetsWindowPlatform] {
        guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        var covers: [CGRect] = []
        var result: [OpenPetsWindowPlatform] = []
        for info in windows.prefix(80) {
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  (info[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let id = info[kCGWindowNumber as String] as? Int,
                  let bounds = info[kCGWindowBounds as String] as? [String: Any],
                  let raw = CGRect(dictionaryRepresentation: bounds as CFDictionary),
                  raw.width >= 80, raw.height >= 50 else { continue }
            let rect = CGRect(x: raw.minX, y: primaryTop - raw.maxY, width: raw.width, height: raw.height)
            var spans: [(CGFloat, CGFloat)] = [(rect.minX, rect.maxX)]
            for cover in covers where cover.minY < rect.maxY && cover.maxY >= rect.maxY {
                spans = spans.flatMap { left, right -> [(CGFloat, CGFloat)] in
                    if cover.minX >= right || cover.maxX <= left { return [(left, right)] }
                    return [(left, min(right, cover.minX)), (max(left, cover.maxX), right)].filter { $0.1 - $0.0 > 24 }
                }
            }
            for span in spans where span.1 - span.0 > 30 {
                result.append(OpenPetsWindowPlatform(id: id, left: span.0, right: span.1, top: rect.maxY, windowX: rect.minX, ownerPID: info[kCGWindowOwnerPID as String] as? Int ?? -1))
            }
            covers.append(rect)
        }
        return result
    }
}
