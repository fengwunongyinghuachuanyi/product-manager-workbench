// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WorkbenchPet",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../kit")],
    targets: [
        .executableTarget(
            name: "workbench-pet",
            dependencies: [.product(name: "OpenPetsKit", package: "kit")],
            path: "Sources/WorkbenchPet"
        )
    ]
)
