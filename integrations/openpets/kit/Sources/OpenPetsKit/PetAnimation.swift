import Foundation

public enum PetAnimation: String, Codable, CaseIterable, Sendable {
    case idle
    case runningRight = "running-right"
    case runningLeft = "running-left"
    case waving
    case jumping
    case failed
    case waiting
    case running
    case review

    public var row: Int {
        switch self {
        case .idle: 0
        case .runningRight: 1
        case .runningLeft: 2
        case .waving: 3
        case .jumping: 4
        case .failed: 5
        case .waiting: 6
        case .running: 7
        case .review: 8
        }
    }

    public var frameCount: Int {
        frameDurationsMilliseconds.count
    }

    /// Prefer the full companion clips when the installed pet provides them.
    var companionReactionKind: OpenPetsPetReactionKind? {
        switch self {
        case .runningRight: "right"
        case .runningLeft: "left"
        case .waving: "wave"
        case .jumping: "jump"
        default: nil
        }
    }

    public var frameDurationsMilliseconds: [Int] {
        switch self {
        case .idle: [2_000, 880, 820, 880, 820, 2_600]
        case .runningRight: [120, 120, 120, 120, 120, 120, 120, 220]
        case .runningLeft: [120, 120, 120, 120, 120, 120, 120, 220]
        case .waving: [140, 140, 140, 280]
        case .jumping: [140, 140, 140, 140, 280]
        case .failed: [140, 140, 140, 140, 140, 140, 140, 240]
        case .waiting: [150, 150, 150, 150, 150, 280]
        case .running: [150, 150, 150, 150, 150, 280]
        case .review: [150, 150, 150, 150, 150, 280]
        }
    }

    public init?(cliValue: String) {
        if let animation = PetAnimation(rawValue: cliValue) {
            self = animation
            return
        }

        switch cliValue {
        case "runningRight", "right":
            self = .runningRight
        case "runningLeft", "left":
            self = .runningLeft
        default:
            return nil
        }
    }
}

/// Common-mode timers continue advancing while AppKit tracks dragging and menus.
@MainActor
enum PetAnimationTimer {
    static func schedule(after interval: TimeInterval, action: @escaping @MainActor () -> Void) -> Timer {
        let timer = Timer(timeInterval: max(0.001, interval), repeats: false) { _ in
            MainActor.assumeIsolated { action() }
        }
        timer.tolerance = min(0.002, interval * 0.05)
        RunLoop.main.add(timer, forMode: .common)
        return timer
    }
}

/// Samples the current pose from monotonic time, so a late callback never
/// lengthens the clip or leaves a backlog of obsolete frames to draw.
struct PetAnimationTimeline {
    struct Sample {
        var frameIndex: Int
        var elapsed: TimeInterval
        var finished: Bool
        var nextFrameIn: TimeInterval
    }

    let durations: [TimeInterval]
    let startedAt: TimeInterval
    let startingOffset: TimeInterval
    let cycles: Int?
    let holdLastFrame: Bool
    var duration: TimeInterval { durations.reduce(0, +) }

    init(milliseconds: [Int], startedAt: TimeInterval, startingFrame: Int = 0,
         cycles: Int? = nil, holdLastFrame: Bool = false) {
        durations = (milliseconds.isEmpty ? [100] : milliseconds).map { Double(max(1, $0)) / 1000 }
        self.startedAt = startedAt
        self.cycles = cycles.map { max(1, $0) }
        self.holdLastFrame = holdLastFrame
        startingOffset = durations.prefix(max(0, min(startingFrame, durations.count - 1))).reduce(0, +)
    }

    func sample(at now: TimeInterval) -> Sample {
        let elapsed = max(0, now - startedAt) + startingOffset
        if let cycles, elapsed >= duration * Double(cycles) {
            return Sample(frameIndex: durations.count - 1, elapsed: elapsed, finished: true, nextFrameIn: 0)
        }
        var position = elapsed.truncatingRemainder(dividingBy: duration)
        for (index, span) in durations.enumerated() {
            if position < span || index == durations.count - 1 {
                return Sample(frameIndex: index, elapsed: elapsed, finished: false, nextFrameIn: max(0.001, span - position))
            }
            position -= span
        }
        preconditionFailure("A nonempty timeline must contain a frame")
    }
}

/// Small continuous movements supplement the authored poses. Scaling is
/// anchored at the feet; artwork stays a single opaque pose, without blending.
struct PetMotionPose: Equatable {
    var scaleX: Double = 1
    var scaleY: Double = 1
    var rotation: Double = 0

    static func sample(action: String, elapsed: TimeInterval, duration: TimeInterval) -> Self {
        let phase = max(0, min(1, elapsed / max(0.001, duration)))
        let envelope = pow(sin(.pi * phase), 2)
        switch action {
        case "affection":
            // Lean into the touch, soften the stance, then return along the
            // same smooth curve. Endpoints have zero velocity and no pose cut.
            return Self(scaleX: 1 + 0.008 * envelope, scaleY: 1 - 0.018 * envelope,
                        rotation: 0.035 * envelope)
        case "breathe":
            return Self(scaleX: 1 - 0.008 * envelope, scaleY: 1 + 0.016 * envelope)
        case "settle":
            return Self(scaleY: 1 - 0.014 * envelope)
        case "shift":
            return Self(rotation: sin(phase * 2 * .pi) * envelope * 0.018)
        default:
            return Self()
        }
    }

    func transitioning(from: Self, elapsed: TimeInterval) -> Self {
        let t = max(0, min(1, elapsed / 0.18))
        let weight = t * t * (3 - 2 * t)
        return Self(scaleX: from.scaleX + (scaleX - from.scaleX) * weight,
                    scaleY: from.scaleY + (scaleY - from.scaleY) * weight,
                    rotation: from.rotation + (rotation - from.rotation) * weight)
    }
}
