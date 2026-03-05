// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "EegSdk",
    platforms: [
        .iOS(.v14),
        .macOS(.v11)
    ],
    products: [
        .library(
            name: "EegSdk",
            targets: ["EegSdk"]
        ),
    ],
    targets: [
        .target(
            name: "EegSdk",
            dependencies: ["EegSdkFFI"],
            path: "Sources"
        ),
        .binaryTarget(
            name: "EegSdkFFI",
            path: "../EegSdkFFI.xcframework"
        ),
    ]
)
