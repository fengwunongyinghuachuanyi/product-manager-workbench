import CoreGraphics
import Foundation
import ImageIO
import AppKit
@testable import OpenPetsKit

@main
struct PetDisplaySmoke {
    @MainActor static func main() throws {
        _ = NSApplication.shared
        NSApplication.shared.setActivationPolicy(.accessory)
        let directory = URL(fileURLWithPath: CommandLine.arguments[1])
        let bundle = try PetBundle.load(from: directory)
        let assets = try PetHostAssets.load(from: bundle, displayScale: 1)
        precondition(assets.stableSpriteBounds == CGRect(x: 0, y: 0, width: 192, height: 208))
        precondition(assets.frames[.idle]?.first?.height == 208)
        precondition(assets.reactionFrames["right"]?.count == 16)
        precondition(assets.reactionFrames["wave"]?.count == 16)
        precondition(assets.reactionFrames["jump"]?.count == 23)
        precondition(PetAnimation.runningRight.companionReactionKind == "right")
        precondition(PetAnimation.waving.companionReactionKind == "wave")
        precondition(PetAnimation.idle.companionReactionKind == nil)
        if let image = assets.reactionFrames["wave"]?.first {
            let store = PetSpriteFrameStore(frames: [:], spriteSize: CGSize(width: 120, height: 130))
            let first = store.asset(for: image, spriteSize: CGSize(width: 120, height: 130))
            for _ in 0..<1000 {
                precondition(first === store.asset(for: image, spriteSize: CGSize(width: 120, height: 130)), "Reaction frames must reuse rendered images")
            }
        }
        // A 250 ms main-thread interruption skips stale frames without
        // stretching the clip. Finite, looping and held clips differ at end.
        let clock = PetAnimationTimeline(milliseconds: [60, 60, 60, 60], startedAt: 100, cycles: 1)
        precondition(clock.sample(at: 100.19).frameIndex == 3)
        precondition(clock.sample(at: 100.25).finished)
        let loop = PetAnimationTimeline(milliseconds: [60, 60, 60, 60], startedAt: 100)
        precondition(loop.sample(at: 110.27).frameIndex == 3 && !loop.sample(at: 110.27).finished)
        let finite = PetAnimationTimeline(milliseconds: [100, 100], startedAt: 100, cycles: 3)
        precondition(!finite.sample(at: 100.59).finished && finite.sample(at: 100.61).finished)
        let held = PetAnimationTimeline(milliseconds: [100, 100], startedAt: 100, cycles: 1, holdLastFrame: true)
        precondition(held.sample(at: 150).frameIndex == 1 && held.holdLastFrame)
        precondition(clock.sample(at: 90).frameIndex == 0)
        var tracker = PetDragTracker()
        tracker.start(screenLocation: .zero, windowOrigin: CGPoint(x: 100, y: 200), timestamp: 0)
        let jitter = tracker.drag(to: CGPoint(x: 2, y: 1), timestamp: 0.01)!
        precondition(!jitter.isDragging && jitter.directionChange == nil && jitter.windowOrigin == CGPoint(x: 100, y: 200),
                     "Touch jitter must not start walking, move the panel or consume the initial drag direction")
        let drag = tracker.drag(to: CGPoint(x: 8, y: 1), timestamp: 0.02)!
        precondition(drag.isDragging && drag.directionChange == .runningRight)
        precondition(tracker.end(at: CGPoint(x: 8, y: 1), timestamp: 0.03).wasDragging)
        let affectionStart = PetMotionPose.sample(action: "affection", elapsed: 0, duration: 1.2)
        let affectionMiddle = PetMotionPose.sample(action: "affection", elapsed: 0.6, duration: 1.2)
        let affectionEnd = PetMotionPose.sample(action: "affection", elapsed: 1.2, duration: 1.2)
        precondition(affectionStart == PetMotionPose())
        precondition(affectionMiddle.rotation > 0.034 && affectionMiddle.scaleY < 0.983)
        precondition(abs(affectionEnd.rotation) < 0.000001 && abs(affectionEnd.scaleY - 1) < 0.000001)
        for tick in 1...72 {
            let a = PetMotionPose.sample(action: "affection", elapsed: Double(tick - 1) / 60, duration: 1.2)
            let b = PetMotionPose.sample(action: "affection", elapsed: Double(tick) / 60, duration: 1.2)
            precondition(abs(a.rotation - b.rotation) < 0.002, "Affection must have no abrupt angle jumps")
        }
        let breath = PetMotionPose.sample(action: "breathe", elapsed: 0.55, duration: 1.1)
        precondition(breath.scaleY > 1.015 && breath.scaleX < 1)
        precondition(PetMotionPose.sample(action: "breathe", elapsed: 1.1, duration: 1.1).scaleY == 1)
        precondition(PetMotionPose().transitioning(from: breath, elapsed: 0) == breath)
        precondition(PetMotionPose().transitioning(from: breath, elapsed: 0.18) == PetMotionPose())
        precondition(bundle.manifest.reactionAnimations.first { $0.kind == "right" }?.loop == true)
        precondition(bundle.manifest.reactionAnimations.first { $0.kind == "sleep" }?.hold == true)
        precondition(bundle.manifest.reactionAnimations.first { $0.kind == "eat" }?.hold == false)

        var firedDuringTracking = false
        let timer = PetAnimationTimer.schedule(after: 0.015) { firedDuringTracking = true }
        let deadline = Date().addingTimeInterval(0.15)
        while !firedDuringTracking && Date() < deadline {
            RunLoop.main.run(mode: .eventTracking, before: deadline)
        }
        timer.invalidate()
        precondition(firedDuringTracking, "Animation timer must fire while AppKit tracks mouse/menu events")
        try verifyHost(directory: directory)
        if CommandLine.arguments.count > 2, let frame = assets.frames[.idle]?.first {
            let output = URL(fileURLWithPath: CommandLine.arguments[2])
            let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil)!
            CGImageDestinationAddImage(destination, frame, nil)
            precondition(CGImageDestinationFinalize(destination))
        }
        print("PASS: full portrait canvas, full movement/reaction clips, cached reaction images, animation timer during event tracking, monotonic playback, clip end modes, continuous micro motion, live host command/renderer regression")
    }

    @MainActor private static func verifyHost(directory: URL) throws {
        let temp = URL(fileURLWithPath: "/tmp/pet-display-" + UUID().uuidString.prefix(8))
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temp) }
        let session = OpenPetsHostSession(configuration: OpenPetsHostConfiguration(
            petDirectoryURL: directory, socketPath: temp.appendingPathComponent("test.sock").path,
            positionStoreURL: temp.appendingPathComponent("position.json")))
        try session.start()
        defer { session.stop() }
        // Reflection keeps diagnostics confined to this standalone test binary.
        let controller = field(session, "controller")!
        func timeline() -> PetAnimationTimeline { field(controller, "animationTimeline") as! PetAnimationTimeline }
        func currentKind() -> OpenPetsPetReactionKind? { field(controller, "currentReactionKind") as? OpenPetsPetReactionKind }
        let petView = field(controller, "petView") as! PetHostView
        let affectionLayer = petView.subviews.first!.layer!.sublayers!.first!
        let initialTime = timeline().startedAt
        var dragStarts = 0
        let originalDragStart = petView.onDragStart
        petView.onDragStart = { dragStarts += 1; originalDragStart?() }
        func nativeTouch() {
            let sprite = petView.subviews.first!
            let windowNumber = petView.window!.windowNumber
            let now = ProcessInfo.processInfo.systemUptime
            let down = NSEvent.mouseEvent(with: .leftMouseDown, location: .zero, modifierFlags: [], timestamp: now,
                windowNumber: windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1)!
            let up = NSEvent.mouseEvent(with: .leftMouseUp, location: .zero, modifierFlags: [], timestamp: now + 0.01,
                windowNumber: windowNumber, context: nil, eventNumber: 2, clickCount: 1, pressure: 0)!
            sprite.mouseDown(with: down)
            precondition(dragStarts == 0, "Mouse-down must not detach the pet or start drag physics")
            sprite.mouseUp(with: up)
        }
        nativeTouch()
        precondition(currentKind() == nil && timeline().startedAt == initialTime,
                     "A native touch must not insert a local waving clip before the controller responds")
        _ = session.apply(.companion(name: "happy"))
        let affectionTime = timeline().startedAt
        precondition(timeline().durations.count == 1, "Affection uses a stable image instead of discontinuous waving poses")
        let affectionImage = affectionLayer.contents as! CGImage
        for _ in 0..<5 {
            spin(0.06)
            nativeTouch()
            _ = session.apply(.companion(name: "happy"))
            precondition(currentKind() == "happy" && timeline().startedAt == affectionTime,
                         "Repeated real native touch callbacks and controller messages must not restart affection")
            precondition(ObjectIdentifier(affectionImage) == ObjectIdentifier(affectionLayer.contents as! CGImage),
                         "Affection must retain one registered image while moving continuously")
        }
        precondition(affectionLayer.position.y == 0 && affectionLayer.transform.m22 < 0.995,
                     "Affection keeps the idle ground line while visibly leaning into touch")
        spin(timeline().duration + 0.06)
        precondition(currentKind() == nil, "Affection must return to idle")
        precondition(abs(affectionLayer.transform.m22 - 1) < 0.0001 && abs(affectionLayer.transform.m12) < 0.0001,
                     "Affection must finish without a residual tilt or scale cut")
        print("PASS: real mouse-down/up path, drag threshold, repeated touches without detach/restart, stable artwork, continuous affection, neutral recovery")
        _ = session.apply(.companion(name: "eat"))
        let start = timeline().startedAt
        spin(0.22)
        _ = session.apply(.companion(name: "eat"))
        precondition(timeline().startedAt == start, "Duplicate action must not restart the clip")
        _ = session.apply(.notify(PetNotification(title: "Test", text: "Test", status: "message", threadId: "companion", ttlSeconds: 0.1)))
        precondition(currentKind() == "eat" && timeline().startedAt == start, "Companion text must not insert a waving pose")
        spin(timeline().duration + 0.06)
        precondition(currentKind() == nil, "Finite clip must return to idle without waiting for the JS behavior tick")
        _ = session.apply(.companion(name: "right"))
        spin(timeline().duration + 0.1)
        precondition(currentKind() == "right" && timeline().cycles == nil, "Walking must continue looping")
        // Inject a real main-thread stall: the next callback should select
        // the current pose, rather than advancing only one stale frame.
        Thread.sleep(forTimeInterval: 0.25)
        spin(0.01)
        let expected = timeline().sample(at: ProcessInfo.processInfo.systemUptime).frameIndex
        let actual = field(controller, "currentFrameIndex") as! Int
        let delta = abs(expected - actual)
        precondition(min(delta, timeline().durations.count - delta) <= 1, "Animation must catch up after a real main-thread stall")
        var delays: [Double] = []
        var lastIndex = actual
        let probeEnd = ProcessInfo.processInfo.systemUptime + 3.0
        while ProcessInfo.processInfo.systemUptime < probeEnd {
            spin(0.001)
            let index = field(controller, "currentFrameIndex") as! Int
            if index != lastIndex {
                let clock = timeline()
                let phase = (ProcessInfo.processInfo.systemUptime - clock.startedAt + clock.startingOffset)
                    .truncatingRemainder(dividingBy: clock.duration)
                let boundary = clock.durations.prefix(index).reduce(0, +)
                delays.append(max(0, (phase - boundary) * 1000))
                lastIndex = index
            }
        }
        delays.sort()
        precondition(delays.count >= 35, "Walking must keep delivering poses over three seconds")
        print("Pose assignment delay (not display FPS): count=\(delays.count), median=\(delays[delays.count / 2])ms, p95=\(delays[min(delays.count - 1, Int(Double(delays.count) * 0.95))])ms")
        _ = session.apply(.companion(name: "sleep"))
        spin(timeline().duration + 0.08)
        precondition(currentKind() == "sleep" && timeline().holdLastFrame, "Sleeping must hold its final pose")
        precondition((field(controller, "currentFrameIndex") as! Int) == timeline().durations.count - 1)
        _ = session.apply(.companion(name: "wake"))
        spin(timeline().duration + 0.06)
        precondition(currentKind() == nil, "Waking must return to idle")
        _ = session.apply(.companion(name: "breathe"))
        spin(0.4)
        let view = field(controller, "petView") as! NSView
        let imageLayer = view.subviews.first!.layer!.sublayers!.first!
        precondition(imageLayer.contents != nil && imageLayer.bounds.height > 0)
        precondition(abs(imageLayer.position.y + 8 * session.configuration.display.scale) < 0.0001, "Companion and base atlas must share a ground line")
        precondition(imageLayer.transform.m22 > 1.005, "Single-pose breathing must move continuously on the compositor")
        print("PASS: live host duplicate, text, finite/loop/hold/wake, compositor image and breathing")
    }

    private static func field(_ value: Any, _ name: String) -> Any? {
        guard let child = Mirror(reflecting: value).children.first(where: { $0.label == name })?.value else { return nil }
        let mirror = Mirror(reflecting: child)
        return mirror.displayStyle == .optional ? mirror.children.first?.value : child
    }

    @MainActor private static func spin(_ seconds: TimeInterval) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { RunLoop.main.run(mode: .default, before: min(end, Date().addingTimeInterval(0.01))) }
    }

}
