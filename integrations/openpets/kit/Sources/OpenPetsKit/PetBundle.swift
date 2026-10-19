import CoreGraphics
import Foundation
import ImageIO

public enum OpenPetsError: Error, LocalizedError, Equatable, Sendable {
    case missingManifest(URL)
    case missingSpritesheet(URL)
    case invalidSpritesheet(URL)
    case invalidAtlasDimensions(width: Int, height: Int)
    case invalidSocketPath(String)
    case socketAlreadyInUse(String)
    case socketFailure(String)
    case protocolFailure(String)

    public var errorDescription: String? {
        switch self {
        case .missingManifest(let url):
            "Missing pet manifest at \(url.path)"
        case .missingSpritesheet(let url):
            "Missing pet spritesheet at \(url.path)"
        case .invalidSpritesheet(let url):
            "Could not read pet spritesheet at \(url.path)"
        case .invalidAtlasDimensions(let width, let height):
            "Invalid Codex pet atlas dimensions: \(width)x\(height)"
        case .invalidSocketPath(let path):
            "Unix socket path is too long or invalid: \(path)"
        case .socketAlreadyInUse(let path):
            "A pet host is already running on \(path)"
        case .socketFailure(let message):
            message
        case .protocolFailure(let message):
            message
        }
    }
}

public struct PetBundle: Sendable {
    public var directoryURL: URL
    public var manifest: PetManifest
    public var spritesheetURL: URL
    public var atlas: PetAtlas

    public init(directoryURL: URL, manifest: PetManifest, spritesheetURL: URL, atlas: PetAtlas) {
        self.directoryURL = directoryURL
        self.manifest = manifest
        self.spritesheetURL = spritesheetURL
        self.atlas = atlas
    }

    public static func load(from directoryURL: URL) throws -> PetBundle {
        let manifest = try loadManifest(from: directoryURL)
        let spritesheetURL = directoryURL.appendingPathComponent(manifest.spritesheetPath)
        guard FileManager.default.fileExists(atPath: spritesheetURL.path) else {
            throw OpenPetsError.missingSpritesheet(spritesheetURL)
        }

        let atlas = try readAtlas(from: spritesheetURL, rows: manifest.spriteVersionNumber == 2 ? 11 : PetAtlas.codexRows)
        return PetBundle(
            directoryURL: directoryURL,
            manifest: manifest,
            spritesheetURL: spritesheetURL,
            atlas: atlas
        )
    }

    public static func loadManifest(from directoryURL: URL) throws -> PetManifest {
        let manifestURL = directoryURL.appendingPathComponent("pet.json")
        guard FileManager.default.fileExists(atPath: manifestURL.path) else {
            throw OpenPetsError.missingManifest(manifestURL)
        }

        return try JSONDecoder().decode(PetManifest.self, from: Data(contentsOf: manifestURL))
    }

    private static func readAtlas(from spritesheetURL: URL, rows: Int) throws -> PetAtlas {
        guard
            let source = CGImageSourceCreateWithURL(spritesheetURL as CFURL, nil),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else {
            throw OpenPetsError.invalidSpritesheet(spritesheetURL)
        }

        guard width % PetAtlas.codexColumns == 0, height % rows == 0 else {
            throw OpenPetsError.invalidAtlasDimensions(width: width, height: height)
        }

        return PetAtlas(
            columns: PetAtlas.codexColumns,
            rows: rows,
            cellWidth: width / PetAtlas.codexColumns,
            cellHeight: height / rows,
            pixelWidth: width,
            pixelHeight: height
        )
    }
}
