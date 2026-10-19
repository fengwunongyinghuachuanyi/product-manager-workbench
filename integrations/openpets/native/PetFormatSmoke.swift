import Foundation
import OpenPetsKit

@main
struct PetFormatSmoke {
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let whale = try PetBundle.load(from: root.appendingPathComponent("pets/deepseek"))
        precondition(whale.manifest.spriteVersionNumber == 2)
        precondition(whale.atlas.columns == 8 && whale.atlas.rows == 11)
        precondition(whale.atlas.cellWidth == 192 && whale.atlas.cellHeight == 208)
        let unicorn = try PetBundle.load(from: root.appendingPathComponent("kit/Sources/OpenPetsKit/Resources/Pets/starcorn"))
        precondition(unicorn.manifest.spriteVersionNumber == 1 && unicorn.atlas.rows == 9)
        let unsupported = Data(#"{"id":"bad","displayName":"bad","description":"bad","spritesheetPath":"bad.webp","spriteVersionNumber":99}"#.utf8)
        do {
            _ = try JSONDecoder().decode(PetManifest.self, from: unsupported)
            fatalError("Unsupported sprite version was accepted")
        } catch is DecodingError { }
        print("PASS: DeepSeek V2 atlas, legacy V1 atlas, unsupported version rejection")
    }
}
